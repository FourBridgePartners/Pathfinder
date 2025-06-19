import { LPContact } from '../types';
import { normalizeRow, preprocessRecord } from '../normalization';
import { constructGraph } from '../graph';
import { fetchFromFirecrawl } from '../ingestion/firecrawl_webfetch';

interface LookupOptions {
  debug?: boolean;
  enrichGraph?: boolean;
}

interface LookupResult {
  contact: LPContact;
  nodeId: string;
}

export async function lookupFirm(
  query: string,
  options: LookupOptions = {}
): Promise<LookupResult | null> {
  const { debug = false, enrichGraph = true } = options;
  
  try {
    if (debug) {
      console.log(`[LookupFirm] Looking up firm: ${query}`);
    }

    // Fetch from Firecrawl
    const result = await fetchFromFirecrawl({
      entityName: query,
      debug
    });

    if (!result.contacts || result.contacts.length === 0) {
      if (debug) {
        console.log('[LookupFirm] No contacts found from Firecrawl');
      }
      return null;
    }

    // Take the top contact
    const enrichedData = result.contacts[0];

    if (debug) {
      console.log('[LookupFirm] Enriched data:', enrichedData);
    }

    // Normalize the enriched data
    const normalizedResult = normalizeRow(preprocessRecord(enrichedData), {
      source: {
        type: 'Firecrawl',
        filename: 'lookup_firm'
      },
      debug
    });
    
    if (debug) {
      console.log('[LookupFirm] Normalized result:', normalizedResult);
    }
    
    if (enrichGraph) {
      // Insert into graph
      const graphResult = await constructGraph([normalizedResult.contact], [], { debug });
      
      if (debug) {
        console.log('[LookupFirm] Graph construction result:', graphResult);
      }
    }

    const nodeId = `firm_${normalizedResult.contact.name.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      contact: normalizedResult.contact,
      nodeId
    };
  } catch (error: unknown) {
    if (debug) {
      console.error('[LookupFirm] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
  }
} 