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
import { resolveFirmAlias } from '../alias/firmAliasResolver';
import { expandFirmQuery } from '../alias/gptEntityExpander';
import { getHomepageForEntity } from '../alias/searchEngine';
import { crawlTeamPage } from './crawlTeamPage';

export type DiscoveryOptions = {
  usePuppeteerFallback?: boolean;
  debug?: boolean;
  writeToGraph?: boolean;
  logMetrics?: boolean;
};

export type PersonEntity = {
  name: string;
  linkedinUrl?: string;
  title?: string;
  pageUrl?: string;
  source: 'firecrawl' | 'linkedin-api' | 'puppeteer';
  company?: string;
  discoveredAt?: string;
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

  // Initialize GraphConstructor for duplicate checking
  const graphConstructor = new GraphConstructor();

  // 1. Normalize input and detect type
  let normalized = resolveEntityName(input);
  if (/linkedin\.com\/(in|company)\//i.test(input)) {
    inputType = 'linkedin';
  } else if (/fund/i.test(normalized)) {
    inputType = 'fund';
  } else if (/capital|ventures|partners|lp|llc|inc|group|firm|company|advisors|management|holdings|associates|foundation|trust/i.test(normalized)) {
    inputType = 'firm';
  }

  // >> NEW: ALIAS RESOLUTION STAGE
  let resolvedInput = normalized;
  if (inputType === 'firm' || inputType === 'fund') {
    const aliasMatch = await resolveFirmAlias(normalized);
    if (aliasMatch) {
      resolvedInput = aliasMatch;
    } else {
      // As a fallback, use GPT to expand the query
      const expanded = await expandFirmQuery(normalized);
      resolvedInput = expanded;
    }
    if (options.debug) console.log(`[Resolver] Input "${input}" resolved to "${resolvedInput}"`);
  }
  // << END NEW

  // 2. Resolve entities (people)
  if (inputType === 'firm' || inputType === 'fund') {
    try {
      // --- Stage 1: Find Homepage (with Brave + Google fallback) ---
      const homepageUrl = await getHomepageForEntity(resolvedInput);
      if (!homepageUrl) {
        throw new Error(`Could not find a homepage for "${resolvedInput}" via any search engine.`);
      }

      // --- Stage 2: Crawl Homepage and Extract Team Members (with all fallbacks) ---
      if (options.debug) console.log(`[Discovery] Crawling homepage ${homepageUrl} with fallback mechanisms...`);
      const teamPageResult = await crawlTeamPage(homepageUrl, {
        debug: options.debug,
        apiKey: process.env.FIRECRAWL_API_KEY || '',
        companyName: resolvedInput,
        enableLinkedInResolution: true,
        enableLLMFallbacks: true
      });

      if (teamPageResult.errors.length > 0) {
        errors.push(...teamPageResult.errors);
      }

      if (teamPageResult.contacts.length > 0) {
        firecrawlContacts = teamPageResult.contacts;
        firecrawlContacts.forEach((contact: any) => {
          peopleDiscovered.push({
            name: contact.name,
            linkedinUrl: contact.linkedin,
            title: contact.title,
            pageUrl: contact.sourceUrl || teamPageResult.teamPageUrl,
            source: 'firecrawl',
            company: resolvedInput,
            discoveredAt: new Date().toISOString()
          });
        });
        via.push('firecrawl');
        
        if (options.debug) {
          console.log(`[Discovery] Successfully extracted ${firecrawlContacts.length} team members.`);
          console.log(`[Discovery] Fallbacks used: ${teamPageResult.summary.fallbacksUsed.join(', ')}`);
          console.log(`[Discovery] LinkedIn profiles resolved: ${teamPageResult.summary.linkedinProfilesResolved}`);
        }
      } else {
        throw new Error(`No team members found for "${resolvedInput}" after all fallback attempts.`);
      }

    } catch (err: any) {
      errors.push(`Discovery error for "${resolvedInput}": ${err.message}`);
      if (options.debug) console.warn(`[Discovery] Pipeline failed for "${resolvedInput}", skipping team discovery.`);
    }
    // TODO: LinkedIn search fallback if Firecrawl fails
  } else if (inputType === 'linkedin') {
    peopleDiscovered.push({ 
      name: normalized, 
      linkedinUrl: input, 
      source: 'linkedin-api',
      discoveredAt: new Date().toISOString()
    });
    via.push('linkedin-api');
  } else {
    peopleDiscovered.push({ 
      name: normalized, 
      source: 'linkedin-api',
      discoveredAt: new Date().toISOString()
    });
    via.push('linkedin-api');
  }

  // 3. Deduplicate people (by LinkedIn URL or normalized name)
  const dedupedPeople = Array.from(
    new Map(peopleDiscovered.map(p => [(p.linkedinUrl || p.name).toLowerCase(), p])).values()
  );
  
  // Skip people already processed (by LinkedIn URL hash)
  const filteredPeople = [];
  for (const person of dedupedPeople) {
    if (person.linkedinUrl) {
      // Check if this LinkedIn URL has already been processed
      try {
        const existingPerson = await graphConstructor.neo4j.findNodeByProperty('Person', 'linkedinUrl', person.linkedinUrl);
        if (existingPerson) {
          if (options.debug) console.log(`[Discovery] Skipping already processed person: ${person.name} (${person.linkedinUrl})`);
          continue;
        }
      } catch (error) {
        // If query fails, continue with the person
        if (options.debug) console.warn(`[Discovery] Error checking existing person: ${error}`);
      }
    }
    filteredPeople.push(person);
  }
  
  if (options.debug) {
    console.log(`[Discovery] Deduplicated ${peopleDiscovered.length} people to ${dedupedPeople.length}`);
    console.log(`[Discovery] After filtering previously processed: ${filteredPeople.length} people`);
  }

  // 4. For each person, fetch mutuals with FourBridge members (with parallel processing)
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
      totalPeople: filteredPeople.length,
      totalMutuals: 0,
      durationMs
    };
    const summary = {
      totalPeople: filteredPeople.length,
      totalMutuals: 0,
      via: Array.from(new Set(via)),
      durationMs
    };
    errors.push('No MutualConnectionFetcher or Puppeteer fallback available, skipping mutual discovery');
    return { peopleDiscovered: filteredPeople, mutuals: [], summary, errors, metrics };
  }

  // Process people in parallel with throttling to avoid rate limits
  const processPerson = async (person: PersonEntity, index: number) => {
    // Add delay between requests to avoid rate limiting
    if (index > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }

    if (!person.linkedinUrl) {
      errors.push(`No LinkedIn URL for ${person.name}, skipping mutuals`);
      return null;
    }

    let foundMutuals = false;
    let personMutuals: MutualConnection | null = null;

    // Try LinkedIn API first
    if (mutualFetcher) {
      try {
        const apiMutuals = await mutualFetcher.findMutualConnections(person.linkedinUrl, { debug: options.debug });
        if (apiMutuals && apiMutuals.length > 0) {
          personMutuals = {
            person,
            mutuals: apiMutuals.map(m => ({
              name: m.name,
              linkedinUrl: m.profileUrl,
              source: 'linkedin-api',
              discoveredAt: new Date().toISOString()
            })),
            via: 'linkedin-api'
          };
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
            personMutuals = {
              person,
              mutuals: puppeteerMutuals.map(m => ({
                name: m.name,
                linkedinUrl: m.profileUrl,
                source: 'puppeteer',
                discoveredAt: new Date().toISOString()
              })),
              via: 'puppeteer'
            };
            via.push('puppeteer');
            
            // Write to Neo4j if enabled
            if (options.writeToGraph) {
              const graphConstructor = new GraphConstructor();
              await graphConstructor.addPuppeteerMutualConnectionsToGraph(person.linkedinUrl, puppeteerMutuals, { debug: options.debug });
            }
            break; // Found mutuals, no need to check other members
          }
        }
        await puppeteerFetcher.close();
      } catch (err: any) {
        errors.push(`Puppeteer fallback failed for ${person.name}: ${err.message}`);
        if (options.debug) console.warn(`[Discovery] Puppeteer fallback failed for ${person.name}`);
      }
    }

    return personMutuals;
  };

  // Process people in parallel with throttling
  const mutualPromises = filteredPeople.map((person, index) => processPerson(person, index));
  const mutualResults = await Promise.all(mutualPromises);
  
  // Filter out null results and add to mutuals array
  mutuals.push(...mutualResults.filter((result): result is MutualConnection => result !== null));

  // 5. Track metrics
  const durationMs = Date.now() - start;
  const metrics = {
    inputType,
    methods: Array.from(new Set(via)),
    totalPeople: filteredPeople.length,
    totalMutuals: mutuals.reduce((acc, m) => acc + (m.mutuals?.length || 0), 0),
    durationMs
  };
  if (options.logMetrics) {
    // TODO: Write metrics to Supabase or log table
    if (options.debug) console.log('[Discovery] Metrics:', metrics);
  }

  // 6. Build summary
  const summary = {
    totalPeople: filteredPeople.length,
    totalMutuals: mutuals.reduce((acc, m) => acc + (m.mutuals?.length || 0), 0),
    via: Array.from(new Set(via)),
    durationMs
  };

  const result = {
    peopleDiscovered: filteredPeople,
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
      totalPeople: filteredPeople.length,
      totalMutuals: result.summary.totalMutuals,
      duration: durationMs,
      errors,
      people: filteredPeople
    });
  } catch (err) {
    // Do not throw, just log
    // eslint-disable-next-line no-console
    console.error('[discoverEntityPaths] Supabase logging failed:', err);
  }

  return result;
} 