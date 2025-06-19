import { LPContact } from '../types';
import { normalizeRow, preprocessRecord } from '../normalization';
import { constructGraph } from '../graph';

interface ResolveOptions {
  debug?: boolean;
  enrichGraph?: boolean;
}

export async function resolvePeopleFromFirm(
  firmName: string,
  options: ResolveOptions = {}
): Promise<LPContact[]> {
  const { debug = false, enrichGraph = true } = options;
  
  try {
    if (debug) {
      console.log(`[ResolvePeopleFromFirm] Resolving people from firm: ${firmName}`);
    }

    // Mock data - simulate Firecrawl results
    const mockPeople = [
      {
        name: 'Alex Grant',
        role: 'Principal',
        firm: firmName,
        linkedin: 'https://linkedin.com/in/alex-grant',
        personalConnections: [
          { name: 'Tejas Agnihotri', mutualConnections: 5, source: 'LinkedIn' }
        ],
        jobHistoryRaw: JSON.stringify([{ title: 'Principal', company: firmName, startDate: '2020-01' }]),
        educationRaw: JSON.stringify([{ school: 'MIT', degree: 'MS' }])
      },
      {
        name: 'Maya Chen',
        role: 'Associate',
        firm: firmName,
        linkedin: 'https://linkedin.com/in/maya-chen',
        jobHistoryRaw: JSON.stringify([{ title: 'Associate', company: firmName, startDate: '2022-06' }]),
        educationRaw: JSON.stringify([{ school: 'Harvard', degree: 'BA' }])
      }
    ];

    if (debug) {
      console.log('[ResolvePeopleFromFirm] Mock data:', mockPeople);
    }

    // Normalize each person
    const normalizedContacts = await Promise.all(
      mockPeople.map(async (person) => {
        const normalizedResult = normalizeRow(preprocessRecord(person), {
          source: {
            type: 'Firecrawl',
            filename: `firm_${firmName}`
          },
          debug
        });

        if (debug) {
          console.log(`[ResolvePeopleFromFirm] Normalized ${person.name}:`, normalizedResult);
        }

        return normalizedResult.contact;
      })
    );

    if (enrichGraph) {
      if (debug) {
        console.log('[ResolvePeopleFromFirm] Enriching graph with contacts...');
      }

      // Insert into graph
      const graphResult = await constructGraph(normalizedContacts, [], { debug });
      
      if (debug) {
        console.log('[ResolvePeopleFromFirm] Graph construction result:', graphResult);
      }
    }

    return normalizedContacts;
  } catch (error: unknown) {
    if (debug) {
      console.error('[ResolvePeopleFromFirm] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    return [];
  }
} 