import { fetchFromFirecrawl } from '../../../ingestion/firecrawl_webfetch';
import { findTeamPageUrl } from '../utils/pageParser';
import { suggestTeamPagePaths, enrichContactTitle } from '../utils/llmExpander';
import { resolveLinkedInProfile } from '../linkedin/resolveLinkedInProfile';
import { LPContact } from '../../../types';

export interface TeamPageResult {
  contacts: LPContact[];
  teamPageUrl: string | null;
  errors: string[];
  summary: {
    homepageUrl: string;
    teamPageFound: boolean;
    contactsExtracted: number;
    linkedinProfilesResolved: number;
    fallbacksUsed: string[];
  };
}

/**
 * Crawls a homepage to find the team page and extract team members.
 * 
 * @param homepageUrl - The homepage URL to start crawling from
 * @param options - Configuration options
 * @returns Promise resolving to team members and metadata
 */
export async function crawlTeamPage(
  homepageUrl: string,
  options: {
    debug?: boolean;
    apiKey?: string;
    companyName?: string;
    enableLinkedInResolution?: boolean;
    enableLLMFallbacks?: boolean;
  } = {}
): Promise<TeamPageResult> {
  const debug = options.debug || false;
  const apiKey = options.apiKey || process.env.FIRECRAWL_API_KEY || '';
  const companyName = options.companyName;
  const enableLinkedInResolution = options.enableLinkedInResolution !== false;
  const enableLLMFallbacks = options.enableLLMFallbacks !== false;
  
  const result: TeamPageResult = {
    contacts: [],
    teamPageUrl: null,
    errors: [],
    summary: {
      homepageUrl,
      teamPageFound: false,
      contactsExtracted: 0,
      linkedinProfilesResolved: 0,
      fallbacksUsed: []
    }
  };

  try {
    if (debug) console.log(`[TeamPageCrawler] Starting crawl of homepage: ${homepageUrl}`);

    // Step 1: Crawl the homepage to find links
    const homepageCrawl = await fetchFromFirecrawl({
      url: homepageUrl,
      apiKey,
      debug
    });

    if (homepageCrawl.errors.length > 0) {
      result.errors.push(`Homepage crawl failed: ${homepageCrawl.errors.map((e: any) => e.reason).join(', ')}`);
      return result;
    }

    // Step 2: Find the team page URL from the links
    let teamPageUrl = findTeamPageUrl(homepageCrawl.links, homepageUrl);
    
    // Step 2a: LLM Fallback - If no team page found, use GPT to suggest paths
    if (!teamPageUrl && enableLLMFallbacks) {
      console.log(`[Fallback] LLM team page suggestions triggered for ${homepageUrl}`);
      result.summary.fallbacksUsed.push('llm_team_suggestions');
      
      const suggestions = await suggestTeamPagePaths(homepageUrl, companyName);
      
      // Try each suggested path
      for (const suggestion of suggestions) {
        if (suggestion.confidence > 0.7) { // Only try high-confidence suggestions
          const suggestedUrl = new URL(suggestion.path, homepageUrl).href;
          console.log(`[Fallback] Trying LLM-suggested path: ${suggestedUrl}`);
          
          try {
            const testCrawl = await fetchFromFirecrawl({
              url: suggestedUrl,
              apiKey,
              debug: false // Don't spam debug logs for fallback attempts
            });
            
            if (testCrawl.contacts.length > 0) {
              teamPageUrl = suggestedUrl;
              console.log(`[Fallback] LLM suggestion successful: ${suggestedUrl}`);
              break;
            }
          } catch (error) {
            // Continue to next suggestion
            continue;
          }
        }
      }
    }
    
    if (teamPageUrl) {
      result.teamPageUrl = teamPageUrl;
      result.summary.teamPageFound = true;
      
      if (debug) console.log(`[TeamPageCrawler] Found team page: ${teamPageUrl}`);

      // Step 3: Crawl the team page to extract members
      const teamPageCrawl = await fetchFromFirecrawl({
        url: teamPageUrl,
        apiKey,
        debug
      });

      if (teamPageCrawl.errors.length > 0) {
        result.errors.push(`Team page crawl failed: ${teamPageCrawl.errors.map((e: any) => e.reason).join(', ')}`);
      } else {
        result.contacts = teamPageCrawl.contacts;
        result.summary.contactsExtracted = teamPageCrawl.contacts.length;
        
        if (debug) console.log(`[TeamPageCrawler] Extracted ${teamPageCrawl.contacts.length} contacts from team page`);
      }
    } else {
      // Fallback: Try to extract contacts from homepage itself
      if (debug) console.log(`[TeamPageCrawler] No team page found, trying homepage as fallback`);
      result.summary.fallbacksUsed.push('homepage_fallback');
      
      if (homepageCrawl.contacts.length > 0) {
        result.contacts = homepageCrawl.contacts;
        result.summary.contactsExtracted = homepageCrawl.contacts.length;
        
        if (debug) console.log(`[TeamPageCrawler] Extracted ${homepageCrawl.contacts.length} contacts from homepage`);
      } else {
        result.errors.push('No team page found and no contacts extracted from homepage');
      }
    }

    // Step 4: LinkedIn Profile Resolution Fallback
    if (result.contacts.length > 0 && enableLinkedInResolution) {
      const contactsWithoutLinkedIn = result.contacts.filter(contact => !contact.linkedin);
      
      if (contactsWithoutLinkedIn.length > 0) {
        console.log(`[Fallback] LinkedIn profile resolution triggered for ${contactsWithoutLinkedIn.length} contacts`);
        result.summary.fallbacksUsed.push('linkedin_resolution');
        
        for (const contact of contactsWithoutLinkedIn) {
          try {
            const profileResult = await resolveLinkedInProfile(
              contact.name,
              companyName || undefined,
              contact.title || undefined
            );
            
            if (profileResult.linkedinUrl && profileResult.confidence !== 'low') {
              contact.linkedin = profileResult.linkedinUrl;
              result.summary.linkedinProfilesResolved++;
              console.log(`[Fallback] Resolved LinkedIn for "${contact.name}": ${profileResult.linkedinUrl}`);
            }
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error: any) {
            console.warn(`[Fallback] Failed to resolve LinkedIn for "${contact.name}": ${error.message}`);
          }
        }
      }
    }

    // Step 5: LLM Enrichment for Missing Metadata
    if (result.contacts.length > 0 && enableLLMFallbacks) {
      const contactsNeedingEnrichment = result.contacts.filter(contact => 
        !contact.title || !contact.linkedin
      );
      
      if (contactsNeedingEnrichment.length > 0) {
        console.log(`[Fallback] LLM enrichment triggered for ${contactsNeedingEnrichment.length} contacts`);
        result.summary.fallbacksUsed.push('llm_enrichment');
        
        for (const contact of contactsNeedingEnrichment) {
          try {
            // Enrich title if missing
            if (!contact.title && contact.name) {
              const enrichedTitle = await enrichContactTitle(contact.name, companyName);
              if (enrichedTitle) {
                contact.title = enrichedTitle;
                console.log(`[Fallback] Enriched title for "${contact.name}": ${enrichedTitle}`);
              }
            }
            
            // Try LinkedIn resolution again with enriched title
            if (!contact.linkedin && contact.name) {
              const profileResult = await resolveLinkedInProfile(
                contact.name,
                companyName || undefined,
                contact.title || undefined
              );
              
              if (profileResult.linkedinUrl && profileResult.confidence !== 'low') {
                contact.linkedin = profileResult.linkedinUrl;
                result.summary.linkedinProfilesResolved++;
                console.log(`[Fallback] Resolved LinkedIn after enrichment for "${contact.name}": ${profileResult.linkedinUrl}`);
              }
            }
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1500));
            
          } catch (error: any) {
            console.warn(`[Fallback] Failed to enrich contact "${contact.name}": ${error.message}`);
          }
        }
      }
    }

  } catch (error: any) {
    result.errors.push(`Crawl failed: ${error.message}`);
    if (debug) console.error(`[TeamPageCrawler] Error:`, error);
  }

  return result;
} 