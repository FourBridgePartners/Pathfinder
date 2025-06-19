import axios from 'axios';
import dotenv from 'dotenv';
import { LPContact } from '../types';
import { normalizeRow } from '../normalization/normalizeRow';
import { preprocessRecord } from '../normalization/utils/preprocessRecord';

// Load environment variables
dotenv.config();

interface FirecrawlConfig {
  apiKey: string;
  entityName: string;
  debug?: boolean;
  maxRetries?: number;
  maxConcurrent?: number;
  useStructuredBlocks?: boolean;
}

interface FirecrawlSearchResponse {
  urls: string[];
}

interface FirecrawlCrawlResponse {
  url: string;
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
  structuredBlocks?: Array<{ type: string; content: string }>,
  useStructuredBlocks: boolean = false
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
  if (useStructuredBlocks && structuredBlocks?.length) {
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
async function fetchUrls(config: FirecrawlConfig): Promise<string[]> {
  try {
    const response = await axios.post<FirecrawlSearchResponse>(
      'https://api.firecrawl.dev/v1/search',
      {
        query: config.entityName,
        numResults: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.urls;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('[FirecrawlFetch] Error fetching URLs:', error.response?.data || error.message);
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
    const response = await axios.post<FirecrawlCrawlResponse>(
      'https://api.firecrawl.dev/v1/crawl',
      {
        url,
        includeTextContent: true
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`[FirecrawlFetch] Error crawling URL ${url}:`, error.response?.data || error.message);
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
  // Use provided config or fall back to env vars
  const firecrawlConfig: FirecrawlConfig = {
    apiKey: config?.apiKey || process.env.FIRECRAWL_API_KEY || '',
    entityName: config?.entityName || '',
    debug: config?.debug || false,
    maxRetries: config?.maxRetries ?? 3,
    maxConcurrent: config?.maxConcurrent ?? 2,
    useStructuredBlocks: config?.useStructuredBlocks || false
  };
  
  // Validate config
  if (!firecrawlConfig.apiKey) {
    throw new Error('Missing Firecrawl API key');
  }
  if (!firecrawlConfig.entityName) {
    throw new Error('Missing entity name to search for');
  }
  
  console.log(`[FirecrawlFetch] Searching for "${firecrawlConfig.entityName}"`);
  
  // Fetch URLs with retry
  const urls = await retryWithBackoff(
    () => fetchUrls(firecrawlConfig),
    firecrawlConfig.maxRetries ?? 3
  );
  console.log(`[FirecrawlFetch] Found ${urls.length} relevant URLs`);
  
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
        crawlResult.structuredBlocks,
        firecrawlConfig.useStructuredBlocks
      );
      
      // Add the entity name as a fallback for name/firm
      if (!structuredData['Name'] && !structuredData['Firm']) {
        structuredData['Name'] = firecrawlConfig.entityName;
      }
      
      if (firecrawlConfig.debug) {
        console.log(`[Debug] Extracted data: ${JSON.stringify(structuredData, null, 2)}`);
      }
      
      // Normalize the data
      const normalizedResult = normalizeRow(structuredData, {
        source: {
          type: 'firecrawl',
          filename: url,
          sourceName: firecrawlConfig.entityName
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
    } catch (error) {
      errors.push({
        url,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  console.log(`[FirecrawlFetch] Successfully normalized ${contacts.length} contacts`);
  if (errors.length > 0) {
    console.warn(`[FirecrawlFetch] Failed to process ${errors.length} URLs`);
  }
  
  return {
    contacts,
    errors,
    summary: {
      entityQueried: firecrawlConfig.entityName,
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
