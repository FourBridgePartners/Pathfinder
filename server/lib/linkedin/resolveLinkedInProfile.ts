import * as puppeteer from 'puppeteer';

export interface LinkedInProfileResult {
  linkedinUrl: string | null;
  confidence: 'high' | 'medium' | 'low';
  title?: string;
  company?: string;
}

/**
 * Resolves a person's name to their LinkedIn profile URL using Puppeteer.
 * 
 * @param name - The person's name
 * @param company - The company they work for (optional, for disambiguation)
 * @param title - Their job title (optional, for disambiguation)
 * @returns Promise resolving to LinkedIn profile information
 */
export async function resolveLinkedInProfile(
  name: string,
  company?: string,
  title?: string
): Promise<LinkedInProfileResult> {
  console.log(`[LinkedInResolver] Resolving profile for: "${name}"${company ? ` at ${company}` : ''}`);

  let browser: puppeteer.Browser | null = null;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Construct search query
    let searchQuery = name;
    if (company) {
      searchQuery += ` ${company}`;
    }

    // Navigate to LinkedIn search
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for search results to load
    await page.waitForSelector('.entity-result__item', { timeout: 10000 });

    // Extract the first result
    const firstResult = await page.$('.entity-result__item');
    if (!firstResult) {
      console.log(`[LinkedInResolver] No search results found for "${name}"`);
      return { linkedinUrl: null, confidence: 'low' };
    }

    // Get the profile link
    const profileLink = await firstResult.$('a[href*="/in/"]');
    if (!profileLink) {
      console.log(`[LinkedInResolver] No profile link found in first result for "${name}"`);
      return { linkedinUrl: null, confidence: 'low' };
    }

    const linkedinUrl = await profileLink.evaluate((el: any) => el.href);
    
    // Get additional context for confidence scoring
    const resultText = await firstResult.evaluate((el: any) => el.textContent);
    
    // Determine confidence based on name match and company/title presence
    let confidence: 'high' | 'medium' | 'low' = 'low';
    
    if (resultText?.toLowerCase().includes(name.toLowerCase())) {
      confidence = 'medium';
      
      if (company && resultText?.toLowerCase().includes(company.toLowerCase())) {
        confidence = 'high';
      } else if (title && resultText?.toLowerCase().includes(title.toLowerCase())) {
        confidence = 'high';
      }
    }

    console.log(`[LinkedInResolver] Found profile: ${linkedinUrl} (confidence: ${confidence})`);
    
    return {
      linkedinUrl,
      confidence,
      title: title,
      company: company
    };

  } catch (error: any) {
    console.error(`[LinkedInResolver] Error resolving profile for "${name}": ${error.message}`);
    return { linkedinUrl: null, confidence: 'low' };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Batch resolves multiple names to LinkedIn profiles.
 * 
 * @param profiles - Array of profile information to resolve
 * @returns Promise resolving to array of LinkedIn profile results
 */
export async function resolveLinkedInProfiles(
  profiles: Array<{ name: string; company?: string; title?: string }>
): Promise<LinkedInProfileResult[]> {
  console.log(`[LinkedInResolver] Batch resolving ${profiles.length} profiles`);
  
  const results: LinkedInProfileResult[] = [];
  
  for (const profile of profiles) {
    try {
      const result = await resolveLinkedInProfile(profile.name, profile.company, profile.title);
      results.push(result);
      
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`[LinkedInResolver] Failed to resolve "${profile.name}": ${error.message}`);
      results.push({ linkedinUrl: null, confidence: 'low' });
    }
  }
  
  return results;
} 