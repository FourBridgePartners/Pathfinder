import { insertDiscoveryMetric, insertDiscoveredPerson } from '../db/discovery';

export interface LogDiscoveryRunArgs {
  input: string;
  inputType: string;
  methods: any[];
  totalPeople: number;
  totalMutuals: number;
  duration: number;
  errors: string[];
  people: { 
    name: string; 
    linkedinUrl?: string; 
    title?: string;
    pageUrl?: string;
    company?: string;
    discoveredAt?: string;
    source: string 
  }[];
}

export async function logDiscoveryRun({ input, inputType, methods, totalPeople, totalMutuals, duration, errors, people }: LogDiscoveryRunArgs) {
  try {
    const metricRes = await insertDiscoveryMetric({
      input,
      input_type: inputType,
      methods,
      total_people: totalPeople,
      total_mutuals: totalMutuals,
      duration_ms: duration,
      error_messages: errors && errors.length > 0 ? errors : null
    });
    const discoveryId = metricRes.data?.id;
    if (discoveryId && Array.isArray(people)) {
      for (const person of people) {
        await insertDiscoveredPerson({
          discovery_id: discoveryId,
          name: person.name,
          linkedin_url: person.linkedinUrl || '',
          title: person.title || '',
          page_url: person.pageUrl || '',
          company: person.company || '',
          discovered_at: person.discoveredAt || new Date().toISOString(),
          source: person.source
        });
      }
    }
    return { metric: metricRes.data, error: metricRes.error };
  } catch (err) {
    // Do not throw, just log
    // eslint-disable-next-line no-console
    console.error('[logDiscoveryRun] Supabase logging failed:', err);
    return { metric: null, error: err };
  }
} 