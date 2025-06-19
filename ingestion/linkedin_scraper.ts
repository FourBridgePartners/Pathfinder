import axios from 'axios';
import { LPContact } from '../types';
import { normalizeRow } from '../normalization/normalizeRow';
import { fetchFromFirecrawl } from './firecrawl_webfetch';
import { preprocessRecord } from '../normalization/utils/preprocessRecord';

interface LinkedInConfig {
  personName?: string;
  linkedinUrl?: string;
  debug?: boolean;
}

interface WorkExperience {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface LinkedInProfile {
  name: string;
  headline?: string;
  currentCompany?: string;
  workExperiences: WorkExperience[];
  education?: string[];
}

interface ImportResult {
  contacts: LPContact[];
  errors: { record: Record<string, string>; errors: string[] }[];
  summary: {
    totalRecords: number;
    successfulImports: number;
    failedImports: number;
  };
}

/**
 * Search for a LinkedIn profile URL using Firecrawl
 */
async function searchLinkedInProfile(personName: string, debug: boolean = false): Promise<string | undefined> {
  try {
    if (debug) console.log(`[LinkedInScraper] Searching for profile: ${personName}`);
    
    // Use Firecrawl to search for the profile
    const result = await fetchFromFirecrawl({
      entityName: personName,
      debug
    });
    
    // Look for LinkedIn URL in the contacts
    for (const contact of result.contacts) {
      const linkedinUrl = contact.linkedin;
      if (linkedinUrl) {
        if (debug) console.log(`[LinkedInScraper] Found profile URL: ${linkedinUrl}`);
        return linkedinUrl;
      }
    }
    
    if (debug) console.log('[LinkedInScraper] No profile URL found in search results');
    return undefined;
  } catch (error) {
    console.error('[LinkedInScraper] Error searching for profile:', error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

/**
 * Parse structured content from LinkedIn profile
 */
function parseLinkedInProfile(content: string, debug: boolean = false): LinkedInProfile | null {
  try {
    if (debug) console.log('[LinkedInScraper] Parsing profile content...');
    
    const profile: LinkedInProfile = {
      name: '',
      workExperiences: [],
      education: []
    };

    // Extract name (usually in a heading or title)
    const nameMatch = content.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                     content.match(/<title>([^<]+) \| LinkedIn<\/title>/i);
    if (nameMatch) {
      profile.name = nameMatch[1].trim();
    }

    // Extract headline
    const headlineMatch = content.match(/<div[^>]*class="[^"]*text-body-medium[^"]*"[^>]*>([^<]+)<\/div>/i);
    if (headlineMatch) {
      profile.headline = headlineMatch[1].trim();
    }

    // Extract work experiences
    const experienceBlocks = content.match(/<section[^>]*class="[^"]*experience-section[^"]*"[^>]*>([\s\S]*?)<\/section>/gi) || [];
    
    for (const block of experienceBlocks) {
      const companyMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      const titleMatch = block.match(/<h4[^>]*>([^<]+)<\/h4>/i);
      const dateMatch = block.match(/(\d{4}\s*-\s*(?:Present|\d{4}))/i);
      
      if (companyMatch) {
        const experience: WorkExperience = {
          company: companyMatch[1].trim(),
          title: titleMatch ? titleMatch[1].trim() : '',
        };

        if (dateMatch) {
          const [startDate, endDate] = dateMatch[1].split('-').map(d => d.trim());
          experience.startDate = startDate;
          experience.endDate = endDate === 'Present' ? undefined : endDate;
        }

        profile.workExperiences.push(experience);
      }
    }

    // Extract education
    const educationBlocks = content.match(/<section[^>]*class="[^"]*education-section[^"]*"[^>]*>([\s\S]*?)<\/section>/gi) || [];
    for (const block of educationBlocks) {
      const schoolMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      if (schoolMatch) {
        profile.education?.push(schoolMatch[1].trim());
      }
    }

    if (debug) {
      console.log('[LinkedInScraper] Parsed profile:', JSON.stringify(profile, null, 2));
    }

    return profile;
  } catch (error) {
    console.error('[LinkedInScraper] Error parsing profile:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Convert LinkedIn profile to LPContact records
 */
function profileToContacts(profile: LinkedInProfile, source: { type: string; filename: string; sourceName: string }, debug: boolean = false): ImportResult {
  const contacts: LPContact[] = [];
  const errors: { record: Record<string, string>; errors: string[] }[] = [];
  
  try {
    if (debug) console.log('[LinkedInScraper] Converting profile to contacts...');

    // Create a contact for each work experience
    for (const experience of profile.workExperiences) {
      const record: Record<string, string> = {
        'Name': profile.name,
        'Firm': experience.company,
        'Title': experience.title,
        'Start Date': experience.startDate || '',
        'End Date': experience.endDate || '',
        'Source': 'LinkedIn',
        'Education': profile.education?.join(', ') || ''
      };

      try {
        // Preprocess the record first
        const preprocessed = preprocessRecord(record, {
          debug,
          source: {
            type: 'linkedin',
            filename: source.filename
          }
        });

        const result = normalizeRow(preprocessed, { source, debug });
        
        // Check for required fields
        if (!result.contact.name || !result.contact.firm) {
          errors.push({
            record,
            errors: result.logs.filter(log => log.startsWith('ERROR'))
          });
          continue;
        }
        
        contacts.push(result.contact);
      } catch (error) {
        errors.push({
          record,
          errors: [error instanceof Error ? error.message : String(error)]
        });
      }
    }

    if (debug) {
      console.log(`[LinkedInScraper] Created ${contacts.length} contacts`);
      if (errors.length > 0) {
        console.log(`[LinkedInScraper] Failed to create ${errors.length} contacts`);
      }
    }

    return {
      contacts,
      errors,
      summary: {
        totalRecords: profile.workExperiences.length,
        successfulImports: contacts.length,
        failedImports: errors.length
      }
    };
  } catch (error) {
    console.error('[LinkedInScraper] Error converting profile:', error instanceof Error ? error.message : String(error));
    return {
      contacts: [],
      errors: [{
        record: { 'Name': profile.name },
        errors: [error instanceof Error ? error.message : String(error)]
      }],
      summary: {
        totalRecords: 0,
        successfulImports: 0,
        failedImports: 1
      }
    };
  }
}

/**
 * Main function to import data from LinkedIn
 */
export async function importFromLinkedIn(config: LinkedInConfig): Promise<ImportResult> {
  const debug = config.debug || false;
  
  try {
    if (debug) console.log('[LinkedInScraper] Starting LinkedIn import...');

    // Get LinkedIn URL
    let linkedinUrl = config.linkedinUrl;
    if (!linkedinUrl && config.personName) {
      if (debug) console.log(`[LinkedInScraper] Searching for profile: ${config.personName}`);
      linkedinUrl = await searchLinkedInProfile(config.personName, debug);
      if (!linkedinUrl) {
        throw new Error(`Could not find LinkedIn profile for: ${config.personName}`);
      }
    } else if (!linkedinUrl) {
      throw new Error('Either personName or linkedinUrl must be provided');
    }

    // Fetch and parse profile
    if (debug) console.log(`[LinkedInScraper] Fetching profile: ${linkedinUrl}`);
    const result = await fetchFromFirecrawl({
      entityName: linkedinUrl,
      debug
    });
    
    // Convert the first contact to a LinkedIn profile
    if (result.contacts.length === 0) {
      throw new Error('No profile data found');
    }

    const contact = result.contacts[0];
    const profile: LinkedInProfile = {
      name: contact.name || '',
      headline: contact.role || '',
      currentCompany: contact.firm ?? undefined,
      workExperiences: [{
        company: contact.firm || '',
        title: contact.role || '',
        startDate: contact.jobHistoryRaw || '',
        endDate: undefined // We don't have end date in the contact
      }],
      education: contact.educationRaw ? [contact.educationRaw] : []
    };

    // Convert to contacts
    return profileToContacts(profile, {
      type: 'linkedin',
      filename: linkedinUrl,
      sourceName: profile.name
    }, debug);

  } catch (error) {
    console.error('[LinkedInScraper] Error during import:', error instanceof Error ? error.message : String(error));
    return {
      contacts: [],
      errors: [{
        record: { 'Error': error instanceof Error ? error.message : String(error) },
        errors: [error instanceof Error ? error.message : String(error)]
      }],
      summary: {
        totalRecords: 0,
        successfulImports: 0,
        failedImports: 1
      }
    };
  }
}

/**
 * Enrich a single person's data from LinkedIn
 */
export async function enrichPersonFromLinkedIn(
  personName: string,
  debug: boolean = false
): Promise<LPContact | null> {
  try {
    if (debug) console.log(`[LinkedInScraper] Enriching person: ${personName}`);

    // Get LinkedIn URL
    const linkedinUrl = await searchLinkedInProfile(personName, debug);
    if (!linkedinUrl) {
      if (debug) console.log('[LinkedInScraper] No LinkedIn profile found');
      return null;
    }

    // Fetch and parse profile
    if (debug) console.log(`[LinkedInScraper] Fetching profile: ${linkedinUrl}`);
    const result = await fetchFromFirecrawl({
      entityName: linkedinUrl,
      debug
    });

    if (!result.contacts || result.contacts.length === 0) {
      if (debug) console.log('[LinkedInScraper] No profile data found');
      return null;
    }

    // Parse the profile content
    const profile = parseLinkedInProfile(result.contacts[0].rawContent || '', debug);
    if (!profile) {
      if (debug) console.log('[LinkedInScraper] Failed to parse profile');
      return null;
    }

    // Convert to LPContact
    const importResult = profileToContacts(profile, {
      type: 'linkedin',
      filename: 'linkedin_enrichment',
      sourceName: 'LinkedIn Enrichment'
    }, debug);

    if (importResult.contacts.length === 0) {
      if (debug) console.log('[LinkedInScraper] No valid contacts generated');
      return null;
    }

    // Return the first contact (most recent position)
    return importResult.contacts[0];
  } catch (error) {
    console.error('[LinkedInScraper] Error enriching person:', error instanceof Error ? error.message : String(error));
    return null;
  }
}
