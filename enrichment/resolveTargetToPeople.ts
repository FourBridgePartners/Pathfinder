import { LPContact } from '../types';
import { resolveFirmFromPerson } from './resolveFirmFromPerson';
import { resolvePeopleFromFirm } from './resolvePeopleFromFirm';

interface ResolveOptions {
  debug?: boolean;
  enrichGraph?: boolean;
}

export async function resolveTargetToPeople(
  query: string,
  options: ResolveOptions = {}
): Promise<LPContact[]> {
  const { debug = false, enrichGraph = true } = options;
  
  try {
    if (debug) {
      console.log(`[ResolveTargetToPeople] Resolving query: "${query}"`);
    }

    // Simple heuristic: if it contains "at", "from", or "@", it's likely a person
    const looksLikePerson = /\b(at|from|@)\b/i.test(query);
    
    if (debug) {
      console.log(`[ResolveTargetToPeople] Query looks like a ${looksLikePerson ? 'person' : 'firm'}`);
    }

    let resolvedPeople: LPContact[];
    
    if (looksLikePerson) {
      if (debug) {
        console.log('[ResolveTargetToPeople] Using person resolution strategy');
      }
      // For person queries, use resolveFirmFromPerson which will:
      // 1. Look up the person
      // 2. Get their firm
      // 3. Get all people at that firm
      resolvedPeople = await resolveFirmFromPerson(query, { debug, enrichGraph });
    } else {
      if (debug) {
        console.log('[ResolveTargetToPeople] Using firm resolution strategy');
      }
      // For firm queries, directly get all people at the firm
      resolvedPeople = await resolvePeopleFromFirm(query, { debug, enrichGraph });
    }

    if (debug) {
      console.log(`[ResolveTargetToPeople] Resolved ${resolvedPeople.length} people`);
      if (resolvedPeople.length > 0) {
        console.log('[ResolveTargetToPeople] First person:', resolvedPeople[0]);
      }
    }

    return resolvedPeople;
  } catch (error: unknown) {
    if (debug) {
      console.error('[ResolveTargetToPeople] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    return [];
  }
} 