import { LPContact } from '../types';
import { normalizeRow, preprocessRecord } from '../normalization';
import { constructGraph } from '../graph';
import { enrichConnectionsFromLinkedIn } from './enrichConnectionsFromLinkedIn';
import { fetchFromFirecrawl } from '../ingestion/firecrawl_webfetch';
import { enrichPersonFromLinkedIn } from '../ingestion/linkedin_scraper';

interface LookupOptions {
  debug?: boolean;
  enrichGraph?: boolean;
}

interface LookupResult {
  contact: LPContact;
  nodeId: string;
}

export async function lookupPerson(
  query: string,
  options: LookupOptions = {}
): Promise<LookupResult | null> {
  const { debug = false, enrichGraph = true } = options;
  
  try {
    if (debug) {
      console.log(`[LookupPerson] Looking up person: ${query}`);
    }

    // Fetch from Firecrawl
    const firecrawlResult = await fetchFromFirecrawl({
      entityName: query,
      debug
    });

    if (!firecrawlResult.contacts || firecrawlResult.contacts.length === 0) {
      if (debug) {
        console.log('[LookupPerson] No contacts found from Firecrawl');
      }
      return null;
    }

    // Take the top contact from Firecrawl
    let enrichedData = firecrawlResult.contacts[0];

    // Enrich with LinkedIn data if available
    const linkedinData = await enrichPersonFromLinkedIn(query, debug);
    if (linkedinData) {
      if (debug) {
        console.log('[LookupPerson] Enriched with LinkedIn data');
      }
      // Merge LinkedIn data with Firecrawl data
      enrichedData = {
        ...enrichedData,
        ...linkedinData,
        // Preserve Firecrawl data for fields that LinkedIn doesn't provide
        email: enrichedData.email || linkedinData.email,
        linkedin: enrichedData.linkedin || linkedinData.linkedin,
        source: {
          type: 'Firecrawl+LinkedIn',
          filename: 'lookup_person'
        }
      };
    }

    // Enrich connections from LinkedIn
    const connections = await enrichConnectionsFromLinkedIn(query, { debug });
    enrichedData.personalConnections = connections;

    if (debug) {
      console.log('[LookupPerson] Enriched data:', enrichedData);
    }

    // Normalize the enriched data
    const normalizedResult = normalizeRow(preprocessRecord(enrichedData), {
      source: {
        type: 'Firecrawl+LinkedIn',
        filename: 'lookup_person'
      },
      debug
    });
    
    if (debug) {
      console.log('[LookupPerson] Normalized result:', normalizedResult);
      console.log('[LookupPerson] Connections:', normalizedResult.contact.personalConnections);
    }
    
    if (enrichGraph) {
      // Insert into graph
      const graphResult = await constructGraph([normalizedResult.contact], [], { debug });
      
      if (debug) {
        console.log('[LookupPerson] Graph construction result:', graphResult);
      }
    }

    const nodeId = `person_${normalizedResult.contact.name.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      contact: normalizedResult.contact,
      nodeId
    };
  } catch (error: unknown) {
    if (debug) {
      console.error('[LookupPerson] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
  }
} 