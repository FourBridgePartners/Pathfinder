// Centralized entity discovery pipeline for FourBridge
// This function normalizes input, resolves people, fetches mutuals, enriches, and writes to Neo4j

import { resolveEntityName } from '../../../graph/utils/resolveAliases';
import { fetchFromFirecrawl } from '../../../ingestion/firecrawl_webfetch';
import { MutualConnectionFetcher } from '../../lib/linkedin/getMutualConnections';
import { GraphConstructor } from '../../../graph/construct_graph';
import { PuppeteerConnectionFetcher } from '../../lib/linkedin/PuppeteerConnectionFetcher';
import { getFourBridgeMembers } from '../../lib/linkedin/memberHelper';
import { logDiscoveryRun } from '../supabase/discoveryLogger';
import { LinkedInOAuthService } from '../../api/linkedin/oauth'; // Assume this exists for production

export type DiscoveryOptions = {
  usePuppeteerFallback?: boolean;
  debug?: boolean;
  writeToGraph?: boolean;
  logMetrics?: boolean;
};

export type PersonEntity = {
  name: string;
  linkedinUrl?: string;
  source: 'firecrawl' | 'linkedin-api' | 'puppeteer';
};

export type MutualConnection = {
  person: PersonEntity;
  mutuals: PersonEntity[];
  via: 'linkedin-api' | 'puppeteer';
};

export type EntityDiscoveryResult = {
  peopleDiscovered: PersonEntity[];
  mutuals: MutualConnection[];
  summary: {
    totalPeople: number;
    totalMutuals: number;
    via: ('firecrawl' | 'linkedin-api' | 'puppeteer')[];
    durationMs: number;
  };
  errors: string[];
  metrics?: Record<string, any>;
};

export async function discoverEntityPaths(
  input: string,
  options: DiscoveryOptions = {},
  oauthService?: LinkedInOAuthService // <-- Injected for production
): Promise<EntityDiscoveryResult> {
  const start = Date.now();
  const errors: string[] = [];
  const peopleDiscovered: PersonEntity[] = [];
  const mutuals: MutualConnection[] = [];
  const via: ('firecrawl' | 'linkedin-api' | 'puppeteer')[] = [];
  let inputType: 'person' | 'firm' | 'fund' | 'linkedin' = 'person';
  let firecrawlContacts: any[] = [];

  // 1. Normalize input and detect type
  let normalized = resolveEntityName(input);
  if (/linkedin\.com\/(in|company)\//i.test(input)) {
    inputType = 'linkedin';
  } else if (/fund/i.test(normalized)) {
    inputType = 'fund';
  } else if (/capital|ventures|partners|lp|llc|inc|group|firm|company|advisors|management|holdings|associates|foundation|trust/i.test(normalized)) {
    inputType = 'firm';
  }

  // 2. Resolve entities (people)
  if (inputType === 'firm' || inputType === 'fund') {
    try {
      const firecrawlResult = await fetchFromFirecrawl({
        entityName: normalized,
        apiKey: process.env.FIRECRAWL_API_KEY || '',
        debug: options.debug,
        useStructuredBlocks: true
      });
      firecrawlContacts = firecrawlResult.contacts || [];
      firecrawlContacts.forEach((contact: any) => {
        peopleDiscovered.push({
          name: contact.name,
          linkedinUrl: contact.linkedin,
          source: 'firecrawl'
        });
      });
      via.push('firecrawl');
      if (options.debug) console.log(`[Discovery] Firecrawl found ${firecrawlContacts.length} contacts`);
    } catch (err: any) {
      errors.push(`Firecrawl error: ${err.message}`);
      if (options.debug) console.warn('[Discovery] Firecrawl failed, skipping team discovery');
    }
    // TODO: LinkedIn search fallback if Firecrawl fails
  } else if (inputType === 'linkedin') {
    peopleDiscovered.push({ name: normalized, linkedinUrl: input, source: 'linkedin-api' });
    via.push('linkedin-api');
  } else {
    peopleDiscovered.push({ name: normalized, source: 'linkedin-api' });
    via.push('linkedin-api');
  }

  // 3. Deduplicate people (by LinkedIn URL or normalized name)
  const dedupedPeople = Array.from(
    new Map(peopleDiscovered.map(p => [(p.linkedinUrl || p.name).toLowerCase(), p])).values()
  );
  // TODO: Skip people already processed (by ID or LinkedIn URL hash)
  // TODO: Enrich PersonEntity with work history, bio/title, and source page URL (for Firecrawl results)

  // 4. For each person, fetch mutuals with FourBridge members
  // If oauthService is provided, use it for LinkedIn API mutuals
  let mutualFetcher: MutualConnectionFetcher | null = null;
  if (oauthService) {
    mutualFetcher = new MutualConnectionFetcher(oauthService);
  } else {
    // No LinkedIn API available; will only use Puppeteer fallback if enabled
    // TODO: For production, inject LinkedInOAuthService here
  }

  // Guard: If no mutualFetcher and no Puppeteer fallback, skip mutuals entirely
  if (!mutualFetcher && !options.usePuppeteerFallback) {
    const durationMs = Date.now() - start;
    const metrics = {
      inputType,
      methods: Array.from(new Set(via)),
      totalPeople: dedupedPeople.length,
      totalMutuals: 0,
      durationMs
    };
    const summary = {
      totalPeople: dedupedPeople.length,
      totalMutuals: 0,
      via: Array.from(new Set(via)),
      durationMs
    };
    errors.push('No MutualConnectionFetcher or Puppeteer fallback available, skipping mutual discovery');
    return { peopleDiscovered: dedupedPeople, mutuals: [], summary, errors, metrics };
  }

  for (const person of dedupedPeople) {
    if (!person.linkedinUrl) {
      errors.push(`No LinkedIn URL for ${person.name}, skipping mutuals`);
      continue;
    }
    let foundMutuals = false;
    if (mutualFetcher) {
      try {
        // Try LinkedIn API first
        const apiMutuals = await mutualFetcher.findMutualConnections(person.linkedinUrl, { debug: options.debug });
        if (apiMutuals && apiMutuals.length > 0) {
          mutuals.push({
            person,
            mutuals: apiMutuals.map(m => ({
              name: m.name,
              linkedinUrl: m.profileUrl,
              source: 'linkedin-api'
            })),
            via: 'linkedin-api'
          });
          via.push('linkedin-api');
          foundMutuals = true;
          // Write to Neo4j if enabled
          if (options.writeToGraph) {
            const graphConstructor = new GraphConstructor();
            await graphConstructor.addMutualConnectionsToGraph(person.linkedinUrl, apiMutuals, { debug: options.debug });
          }
        }
      } catch (err: any) {
        errors.push(`Failed to fetch mutuals for ${person.name}: ${err.message}`);
        if (options.debug) console.warn(`[Discovery] Failed to fetch mutuals for ${person.name}`);
      }
    }
    // Puppeteer fallback if enabled and no API mutuals found
    if (!foundMutuals && options.usePuppeteerFallback) {
      try {
        const puppeteerFetcher = new PuppeteerConnectionFetcher({ headless: true });
        const fbMembers = getFourBridgeMembers();
        for (const member of fbMembers) {
          const puppeteerMutuals = await puppeteerFetcher.fetchMutualConnections(person.linkedinUrl, member);
          if (puppeteerMutuals && puppeteerMutuals.length > 0) {
            mutuals.push({
              person,
              mutuals: puppeteerMutuals.map(m => ({
                name: m.name,
                linkedinUrl: m.profileUrl,
                source: 'puppeteer'
              })),
              via: 'puppeteer'
            });
            via.push('puppeteer');
            // Write to Neo4j if enabled
            if (options.writeToGraph) {
              const graphConstructor = new GraphConstructor();
              await graphConstructor.addPuppeteerMutualConnectionsToGraph(person.linkedinUrl, puppeteerMutuals, { debug: options.debug });
            }
          }
        }
        await puppeteerFetcher.close();
      } catch (err: any) {
        errors.push(`Puppeteer fallback failed for ${person.name}: ${err.message}`);
        if (options.debug) console.warn(`[Discovery] Puppeteer fallback failed for ${person.name}`);
      }
    }
  }

  // 5. Track metrics
  const durationMs = Date.now() - start;
  const metrics = {
    inputType,
    methods: Array.from(new Set(via)),
    totalPeople: dedupedPeople.length,
    totalMutuals: mutuals.reduce((acc, m) => acc + (m.mutuals?.length || 0), 0),
    durationMs
  };
  if (options.logMetrics) {
    // TODO: Write metrics to Supabase or log table
    if (options.debug) console.log('[Discovery] Metrics:', metrics);
  }

  // 6. Build summary
  const summary = {
    totalPeople: dedupedPeople.length,
    totalMutuals: mutuals.reduce((acc, m) => acc + (m.mutuals?.length || 0), 0),
    via: Array.from(new Set(via)),
    durationMs
  };

  const result = {
    peopleDiscovered: dedupedPeople,
    mutuals,
    summary,
    errors,
    metrics
  };

  // Log to Supabase
  try {
    await logDiscoveryRun({
      input,
      inputType: inputType,
      methods: Array.from(new Set(via)),
      totalPeople: dedupedPeople.length,
      totalMutuals: result.summary.totalMutuals,
      duration: durationMs,
      errors,
      people: dedupedPeople
    });
  } catch (err) {
    // Do not throw, just log
    // eslint-disable-next-line no-console
    console.error('[discoverEntityPaths] Supabase logging failed:', err);
  }

  return result;
} 