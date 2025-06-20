import axios from 'axios';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { LPContact } from '../types';
import { normalizeRow } from '../normalization/normalizeRow';
import { preprocessRecord } from '../normalization/utils/preprocessRecord';

// Load environment variables
dotenv.config();

interface FirecrawlConfig {
  apiKey: string;
  entityName?: string; // Name to search for
  url?: string; // Specific URL to crawl
  debug?: boolean;
  maxRetries?: number;
  maxConcurrent?: number;
}

interface FirecrawlSearchResponse {
  web: {
    results: Array<{
      url: string;
      title?: string;
      description?: string;
    }>;
  };
}

interface FirecrawlCrawlResponse {
  url: string;
  html?: string; // Expecting HTML to parse links
  metadata: {
    title: string;
    description?: string;
    publishedDate?: string;
  };
  textContent: string;
  structuredBlocks?: Array<{
    type: string;
    content: string;
  }>;
}

interface FetchResult {
  contacts: LPContact[];
  errors: { url: string; reason: string }[];
  links: string[]; // Return extracted links
  summary: {
    entityQueried: string;
    totalUrlsFetched: number;
    successfulNormalizations: number;
  };
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  initialDelay: number = 1000
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (retries >= maxRetries) {
        throw error;
      }
      
      // Check if it's a rate limit error
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        console.log(`[FirecrawlFetch] Rate limited, retrying in ${delay}ms...`);
        await sleep(delay);
        retries++;
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}

/**
 * Process URLs in parallel with a concurrency limit
 */
async function processUrlsInParallel(
  urls: string[],
  apiKey: string,
  maxConcurrent: number,
  maxRetries: number,
  debug?: boolean
): Promise<Array<{ url: string; result?: FirecrawlCrawlResponse; error?: string }>> {
  const results: Array<{ url: string; result?: FirecrawlCrawlResponse; error?: string }> = [];
  const chunks: string[][] = [];
  
  // Split URLs into chunks for parallel processing
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    chunks.push(urls.slice(i, i + maxConcurrent));
  }
  
  // Process each chunk
  for (const chunk of chunks) {
    const chunkPromises = chunk.map(url =>
      retryWithBackoff(
        () => crawlUrl(url, apiKey),
        maxRetries
      )
      .then(result => ({ url, result }))
      .catch(error => ({ 
        url, 
        error: error instanceof Error ? error.message : String(error)
      }))
    );
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    
    // Add a small delay between chunks to avoid overwhelming the API
    if (chunks.length > 1) {
      await sleep(1000);
    }
  }
  
  return results;
}

/**
 * Extract structured data from Firecrawl's response text and blocks
 */
function extractStructuredData(
  docText: string,
  structuredBlocks?: Array<{ type: string; content: string }>
): Record<string, string> {
  const structuredData: Record<string, string> = {};
  
  // Extract LinkedIn URL
  const linkedinMatch = docText.match(/linkedin\.com\/in\/[a-zA-Z0-9-]+/i);
  if (linkedinMatch) {
    structuredData['LinkedIn'] = `https://www.${linkedinMatch[0]}`;
  }
  
  // Extract website URL
  const websiteMatch = docText.match(/https?:\/\/[a-zA-Z0-9-]+\.(com|org|io|co|ai)\b/i);
  if (websiteMatch) {
    structuredData['Website'] = websiteMatch[0];
  }
  
  // Extract location (look for common patterns like "City, State" or "City, Country")
  const locationMatch = docText.match(/([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)/);
  if (locationMatch) {
    structuredData['Location'] = locationMatch[0];
  }
  
  // Extract AUM (look for patterns like "$X billion" or "$X million")
  const aumMatch = docText.match(/\$(\d+(?:\.\d+)?)\s*(billion|million)/i);
  if (aumMatch) {
    structuredData['AUM'] = aumMatch[0];
  }
  
  // Extract email
  const emailMatch = docText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    structuredData['Email'] = emailMatch[0];
  }
  
  // Extract role/title (look for common patterns)
  const roleMatch = docText.match(/(?:Managing Director|Partner|Principal|Vice President|Director|Associate|Analyst)/i);
  if (roleMatch) {
    structuredData['Role'] = roleMatch[0];
  }
  
  // Add the full text as notes for further processing
  structuredData['Notes'] = docText.substring(0, 1000); // Limit to first 1000 chars
  
  // Process structured blocks if enabled and available
  if (structuredBlocks?.length) {
    structuredBlocks.forEach(block => {
      if (block.type === 'paragraph' || block.type === 'list') {
        // Extract data from the block
        const blockData = extractFromBlock(block.content);
        
        // Merge with existing data, preferring block data for certain fields
        Object.entries(blockData).forEach(([key, value]) => {
          // For certain fields, prefer data from structured blocks
          if (['Role', 'Location', 'AUM'].includes(key)) {
            structuredData[key] = value;
          }
          // For other fields, only use block data if we don't have it yet
          else if (!structuredData[key]) {
            structuredData[key] = value;
          }
        });
      }
    });
  }
  
  return structuredData;
}

/**
 * Extract data from a single structured block
 */
function extractFromBlock(content: string): Record<string, string> {
  const blockData: Record<string, string> = {};
  
  // Extract role/title (often more accurate in structured blocks)
  const roleMatch = content.match(/(?:Managing Director|Partner|Principal|Vice President|Director|Associate|Analyst)/i);
  if (roleMatch) {
    blockData['Role'] = roleMatch[0];
  }
  
  // Extract location (often in a dedicated section)
  const locationMatch = content.match(/(?:Location|Based in|Headquarters):\s*([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)/i);
  if (locationMatch) {
    blockData['Location'] = locationMatch[1] + ', ' + locationMatch[2];
  }
  
  // Extract AUM (often in a dedicated section)
  const aumMatch = content.match(/(?:AUM|Assets Under Management):\s*\$(\d+(?:\.\d+)?)\s*(billion|million)/i);
  if (aumMatch) {
    blockData['AUM'] = `$${aumMatch[1]} ${aumMatch[2]}`;
  }
  
  return blockData;
}

/**
 * Fetch URLs from Firecrawl's search endpoint
 */
async function fetchUrls(config: { apiKey: string, entityName?: string }): Promise<string[]> {
  try {
    const requestBody = {
      query: config.entityName
    };
    
    console.log('[FirecrawlFetch] Sending search request to Firecrawl:');
    console.log('[FirecrawlFetch] URL: https://api.firecrawl.dev/v1/search');
    console.log('[FirecrawlFetch] Body:', JSON.stringify(requestBody, null, 2));
    console.log('[FirecrawlFetch] API Key:', config.apiKey ? '✓ Present' : '✗ Missing');
    
    const response = await axios.post<FirecrawlSearchResponse>(
      'https://api.firecrawl.dev/v1/search',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('[FirecrawlFetch] Search response received:', {
      status: response.status,
      urlsFound: response.data.web.results?.length || 0
    });
    
    return response.data.web.results.map((result: any) => result.url);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('[FirecrawlFetch] Error fetching URLs:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
    } else {
      console.error('[FirecrawlFetch] Unexpected error:', error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

/**
 * Crawl a single URL using Firecrawl's crawl endpoint
 */
async function crawlUrl(url: string, apiKey: string): Promise<FirecrawlCrawlResponse> {
  try {
    const requestBody = {
      url,
      pageOptions: { includeHtml: true }, // Explicitly request HTML
    };
    
    console.log(`[FirecrawlFetch] Crawling URL: ${url}`);
    console.log('[FirecrawlFetch] Crawl request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post<FirecrawlCrawlResponse>(
      'https://api.firecrawl.dev/v1/crawl',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`[FirecrawlFetch] Successfully crawled: ${url}`);
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`[FirecrawlFetch] Error crawling URL ${url}:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
    } else {
      console.error(`[FirecrawlFetch] Unexpected error crawling ${url}:`, error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

/**
 * Main function to fetch and process data from Firecrawl
 */
export async function fetchFromFirecrawl(
  config: Partial<FirecrawlConfig>
): Promise<FetchResult> {
  const firecrawlConfig: FirecrawlConfig = {
    apiKey: config.apiKey || process.env.FIRECRAWL_API_KEY || '',
    entityName: config.entityName,
    url: config.url,
    debug: config.debug || false,
    maxRetries: config.maxRetries || 3,
    maxConcurrent: config.maxConcurrent || 5
  };

  if (!firecrawlConfig.apiKey) {
    throw new Error('Firecrawl API key is required');
  }

  let urls: string[] = [];

  // If a specific URL is provided, use it directly
  if (firecrawlConfig.url) {
    urls = [firecrawlConfig.url];
    if (firecrawlConfig.debug) console.log(`[FirecrawlFetch] Using provided URL: ${firecrawlConfig.url}`);
  } else if (firecrawlConfig.entityName) {
    // Search for URLs using the entity name
    if (firecrawlConfig.debug) console.log(`[FirecrawlFetch] Searching for URLs for: ${firecrawlConfig.entityName}`);
    
    const searchResult = await searchUrls(firecrawlConfig.entityName, firecrawlConfig.apiKey);
    if (!searchResult) {
      return {
        contacts: [],
        errors: [{ url: 'search', reason: `No URLs found for "${firecrawlConfig.entityName}" after retries` }],
        links: [],
        summary: {
          entityQueried: firecrawlConfig.entityName || firecrawlConfig.url || '',
          totalUrlsFetched: 0,
          successfulNormalizations: 0
        }
      };
    }
    
    urls = searchResult.web.results.map((result: any) => result.url).slice(0, 10); // Limit to top 10 results
    if (firecrawlConfig.debug) console.log(`[FirecrawlFetch] Found ${urls.length} URLs to crawl`);
  } else {
    throw new Error('Either entityName or url must be provided');
  }

  console.log(`[FirecrawlFetch] Found ${urls.length} relevant URLs`);
  
  // Guard against no URLs found
  if (!urls || urls.length === 0) {
    console.warn(`[FirecrawlFetch] No URLs found for "${firecrawlConfig.entityName}"`);
    return {
      contacts: [],
      errors: [{ url: 'search', reason: `No URLs found for "${firecrawlConfig.entityName}"` }],
      links: [],
      summary: {
        entityQueried: firecrawlConfig.entityName || firecrawlConfig.url || '',
        totalUrlsFetched: 0,
        successfulNormalizations: 0
      }
    };
  }
  
  // Process URLs in parallel with rate limiting
  const crawlResults = await processUrlsInParallel(
    urls,
    firecrawlConfig.apiKey,
    firecrawlConfig.maxConcurrent ?? 2,
    firecrawlConfig.maxRetries ?? 3,
    firecrawlConfig.debug
  );
  
  // Process results
  const contacts: LPContact[] = [];
  const errors: { url: string; reason: string }[] = [];
  const links: string[] = [];
  
  // Guard against missing contacts field
  if (!crawlResults || !Array.isArray(crawlResults)) {
    throw new Error("Firecrawl response missing or invalid crawl results");
  }
  
  for (const { url, result: crawlResult, error } of crawlResults) {
    if (error) {
      errors.push({ url, reason: error });
      continue;
    }
    
    if (!crawlResult) {
      errors.push({ url, reason: 'No result returned from crawl' });
      continue;
    }
    
    try {
      if (firecrawlConfig.debug) {
        console.log(`[Debug] Crawled URL: ${url}`);
        console.log(`[Debug] Title: ${crawlResult.metadata.title}`);
      }
      
      // Extract structured data
      const structuredData = extractStructuredData(
        crawlResult.textContent,
        crawlResult.structuredBlocks
      );
      
      // Add the entity name as a fallback for name/firm
      if (!structuredData['Name'] && !structuredData['Firm']) {
        structuredData['Name'] = firecrawlConfig.entityName || firecrawlConfig.url || '';
      }
      
      if (firecrawlConfig.debug) {
        console.log(`[Debug] Extracted data: ${JSON.stringify(structuredData, null, 2)}`);
      }
      
      // Normalize the data
      const normalizedResult = normalizeRow(structuredData, {
        source: {
          type: 'firecrawl',
          filename: url,
          sourceName: firecrawlConfig.entityName || firecrawlConfig.url || ''
        },
        debug: firecrawlConfig.debug
      });
      
      // Check for required fields
      if (!normalizedResult.contact.name || !normalizedResult.contact.firm) {
        errors.push({
          url,
          reason: 'Missing required fields after normalization'
        });
        continue;
      }
      
      contacts.push(normalizedResult.contact);

      // Extract links from the HTML using cheerio
      if (crawlResult.html) {
        const $ = cheerio.load(crawlResult.html);
        $('a').each((i: number, link: any) => {
          const href = $(link).attr('href');
          if (href) {
            links.push(href);
          }
        });
      }
    } catch (error) {
      errors.push({
        url,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Consolidate all links from all crawled pages
  const allLinks = crawlResults.flatMap(r => {
    if (r.result?.html) {
      const $ = cheerio.load(r.result.html);
      const pageLinks: string[] = [];
      $('a').each((i: number, link: any) => {
        const href = $(link).attr('href');
        if (href) {
          pageLinks.push(href);
        }
      });
      return pageLinks;
    }
    return [];
  });

  console.log(`[FirecrawlFetch] Successfully normalized ${contacts.length} contacts`);
  if (errors.length > 0) {
    console.warn(`[FirecrawlFetch] Failed to process ${errors.length} URLs`);
  }
  
  return {
    contacts,
    errors,
    links: [...new Set(allLinks)], // Return unique links
    summary: {
      entityQueried: firecrawlConfig.entityName || firecrawlConfig.url || '',
      totalUrlsFetched: urls.length,
      successfulNormalizations: contacts.length
    }
  };
}

/**
 * Test function to demonstrate the Firecrawl fetch with sample data
 */
export function testWithSampleData(): void {
  // Sample data that would come from Firecrawl
  const sampleData: Record<string, string> = {
    'Name': 'Jane Doe',
    'Firm': 'Acme Capital',
    'Email': 'jane@acmecapital.com',
    'Role': 'Managing Director',
    'LinkedIn': 'https://www.linkedin.com/in/janedoe/',
    'Location': 'San Francisco, CA',
    'Notes': 'Sample notes from web scraping'
  };
  
  console.log('[Test] Processing sample data...');
  
  try {
    // Preprocess the record first
    const preprocessed = preprocessRecord(sampleData, {
      debug: true,
      source: {
        type: 'test',
        filename: 'sample_data'
      }
    });

    const result = normalizeRow(preprocessed, {
      source: {
        type: 'test',
        filename: 'sample_data',
        sourceName: 'Jane Doe'
      },
      debug: true
    });
    
    console.log(`[Test] Processed record: ${result.contact.name}`);
    console.log(`[Test] Confidence scores: ${JSON.stringify(result.confidence)}`);
    console.log(`[Test] Logs: ${result.logs.join(', ')}`);
    
    // Display the normalized contact
    console.log('[Test] Normalized contact:');
    console.log(JSON.stringify(result.contact, null, 2));
  } catch (error) {
    console.error('[Test] Error processing record:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testWithSampleData();
}

async function searchUrls(entityName: string, apiKey: string): Promise<FirecrawlSearchResponse | null> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second base delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[FirecrawlSearch] Attempt ${attempt}/${maxRetries} for "${entityName}"`);
      
      const requestBody = {
        query: entityName,
        pageOptions: { includeHtml: true }
      };
      
      const response = await axios.post(
        'https://api.firecrawl.dev/search',
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      const result = response.data;
      
      // Guard against undefined or empty results
      if (!result?.web?.results) {
        console.warn(`[FirecrawlSearch] No web results in response for "${entityName}"`);
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`[FirecrawlSearch] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      if (result.web.results.length === 0) {
        console.warn(`[FirecrawlSearch] No URLs found for "${entityName}"`);
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`[FirecrawlSearch] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      console.log(`[FirecrawlSearch] Found ${result.web.results.length} URLs for "${entityName}"`);
      return result;

    } catch (error: any) {
      console.error(`[FirecrawlSearch] Attempt ${attempt} failed for "${entityName}":`, error.message);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[FirecrawlSearch] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[FirecrawlSearch] All ${maxRetries} attempts failed for "${entityName}"`);
        return null;
      }
    }
  }

  return null;
}
