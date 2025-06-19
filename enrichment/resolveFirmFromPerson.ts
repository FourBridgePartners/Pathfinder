import { LPContact } from '../types';
import { lookupPerson } from './lookupPerson';
import { resolvePeopleFromFirm } from './resolvePeopleFromFirm';
import { constructGraph } from '../graph';

interface ResolveOptions {
  debug?: boolean;
  enrichGraph?: boolean;
}

export async function resolveFirmFromPerson(
  personName: string,
  options: ResolveOptions = {}
): Promise<LPContact[]> {
  const { debug = false, enrichGraph = true } = options;
  
  try {
    if (debug) {
      console.log(`[ResolveFirmFromPerson] Resolving firm from person: ${personName}`);
    }

    // First, get the enriched person
    const personResult = await lookupPerson(personName, { debug, enrichGraph: false });
    if (!personResult) {
      if (debug) {
        console.log('[ResolveFirmFromPerson] No person found');
      }
      return [];
    }

    const enrichedPerson = personResult.contact;
    if (!enrichedPerson.firm) {
      if (debug) {
        console.log('[ResolveFirmFromPerson] Person has no firm');
      }
      return [enrichedPerson];
    }

    if (debug) {
      console.log(`[ResolveFirmFromPerson] Found firm: ${enrichedPerson.firm}`);
    }

    // Get other people from the firm
    const peopleFromFirm = await resolvePeopleFromFirm(enrichedPerson.firm, { 
      debug, 
      enrichGraph: false 
    });

    // Combine all people
    const allPeople = [enrichedPerson, ...peopleFromFirm];

    if (debug) {
      console.log(`[ResolveFirmFromPerson] Found ${allPeople.length} total people`);
    }

    if (enrichGraph) {
      if (debug) {
        console.log('[ResolveFirmFromPerson] Enriching graph with all people...');
      }

      // Insert into graph
      const graphResult = await constructGraph(allPeople, [], { debug });
      
      if (debug) {
        console.log('[ResolveFirmFromPerson] Graph construction result:', graphResult);
      }
    }

    return allPeople;
  } catch (error: unknown) {
    if (debug) {
      console.error('[ResolveFirmFromPerson] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    return [];
  }
} 