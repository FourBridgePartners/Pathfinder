import type { NextApiRequest, NextApiResponse } from 'next';
import { Neo4jService } from '@/services/neo4j';
import { PathFinder } from '../../graph/queryPaths';
import { resolveEntityName } from '../../graph/utils/resolveAliases';
import { Node } from 'neo4j-driver';
import { discoverEntityPaths } from '../lib/discovery/discoverEntityPaths';

// TODO: Add Redis/Supabase caching for frequent targets

// Helper to check if a string is a LinkedIn profile URL
function isLinkedInUrl(input: string): boolean {
  return /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\//.test(input);
}

function isLikelyFirmOrFund(input: string): boolean {
  // Heuristic: if the normalized name contains common firm/fund keywords
  const normalized = resolveEntityName(input);
  return /fund|capital|ventures|partners|lp|llc|inc|group|firm|company|advisors|management|holdings|associates|foundation|trust/i.test(normalized);
}

// Helper to resolve a person or firm/fund node by name or LinkedIn URL
async function resolveTargetNode(
  neo4j: Neo4jService,
  input: string
): Promise<{ type: 'Person' | 'Firm' | 'Fund'; node: Node } | { type: 'Firm' | 'Fund'; people: Node[] } | null> {
  if (isLinkedInUrl(input)) {
    // Try to find a Person node by LinkedIn URL
    const person = await neo4j.findNodeByProperty('Person', 'linkedinUrl', input);
    if (person) return { type: 'Person', node: person };
    return null;
  }
  // Try to find a Person node by name (normalized)
  const normalized = resolveEntityName(input);
  const person = await neo4j.findNodeByProperty('Person', 'name', normalized);
  if (person) return { type: 'Person', node: person };
  // Try to find a Firm or Fund node by name (normalized)
  let firm = await neo4j.findNodeByProperty('Firm', 'name', normalized);
  if (!firm) {
    firm = await neo4j.findNodeByProperty('Fund', 'name', normalized);
    if (!firm) return null;
  }
  // Find key people at the firm/fund (e.g., execs, GPs)
  const session = neo4j.getSession();
  const result = await session.run(
    `MATCH (f {id: $id})<-[:WORKS_AT|GP_AT]-(p:Person) RETURN p`,
    { id: firm.properties.id }
  );
  await session.close();
  const people: Node[] = result.records.map((r: any) => r.get('p'));
  if (people.length === 0) return null;
  return { type: firm.labels[0] as 'Firm' | 'Fund', people };
}

async function handleFirmOrFundDiscovery(
  input: string,
  pathFinder: any
) {
  // Defensive logging
  console.log(`[Pathways] Attempting entity-level discovery for input: ${input}`);
  try {
    const discovery = await discoverEntityPaths(input, { writeToGraph: true });
    if (!discovery.peopleDiscovered || discovery.peopleDiscovered.length === 0) {
      console.warn('[Pathways] Entity discovery yielded no people, falling back to legacy logic.');
      return null;
    }
    // For each discovered person, try to find paths
    let allPaths: any[] = [];
    for (const person of discovery.peopleDiscovered) {
      // TODO: If person is not yet in Neo4j, ensure they are written (should be handled by discoverEntityPaths)
      // TODO: If person.linkedinUrl is missing, fallback to name
      const idOrName = person.linkedinUrl || person.name;
      try {
        const paths = await pathFinder.findPaths(idOrName);
        allPaths.push(...paths);
      } catch (err) {
        console.warn(`[Pathways] Failed to find paths for discovered person: ${person.name}`, err);
      }
    }
    return allPaths;
  } catch (err) {
    console.error('[Pathways] Error during entity-level discovery:', err);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { target } = req.query;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid target parameter' });
  }
  const neo4j = Neo4jService.getInstance();
  const pathFinder = new PathFinder(neo4j);
  try {
    // Branch: If input is likely a firm/fund, use entity-level discovery
    if (isLikelyFirmOrFund(target)) {
      const discoveredPaths = await handleFirmOrFundDiscovery(target, pathFinder);
      if (discoveredPaths && discoveredPaths.length > 0) {
        const formatted = discoveredPaths.map((p: any, i: number) => ({
          rank: i + 1,
          nodes: p.path.filter((n: any) => n.labels || n.type === 'Person' || n.type === 'Firm' || n.type === 'School'),
          summary: p.path.filter((n: any) => n.properties?.name || n.name).map((n: any) => n.properties?.name || n.name).join(' → '),
          score: p.confidence || p.score || 0,
          via: p.sources || p.metadata?.connectionTypes || [],
          mutualCount: p.metadata?.mutualTies?.length || 0,
          distance: p.metadata?.pathLength || 0,
          raw: p
        }));
        return res.status(200).json(formatted);
      }
      // Defensive: If discovery fails, fall through to legacy logic
    }
    // Otherwise, use legacy logic (person or LinkedIn URL)
    const resolved = await resolveTargetNode(neo4j, target);
    if (!resolved) {
      return res.status(404).json({ error: 'Target not found' });
    }
    let allPaths: any[] = [];
    if ('node' in resolved) {
      // Single person target
      const paths = await pathFinder.findPaths(resolved.node.properties.id);
      allPaths = paths;
    } else if ('people' in resolved) {
      // Firm/fund: aggregate paths to each key person
      for (const person of resolved.people) {
        const paths = await pathFinder.findPaths(person.properties.id);
        allPaths.push(...paths);
      }
    }
    if (!allPaths.length) {
      return res.status(200).json([]);
    }
    // Format for UI: nodes, score, via, mutualCount, distance, etc.
    const formatted = allPaths.map((p: any, i: number) => ({
      rank: i + 1,
      nodes: p.path.filter((n: any) => n.labels || n.type === 'Person' || n.type === 'Firm' || n.type === 'School'),
      summary: p.path.filter((n: any) => n.properties?.name || n.name).map((n: any) => n.properties?.name || n.name).join(' → '),
      score: p.confidence || p.score || 0,
      via: p.sources || p.metadata?.connectionTypes || [],
      mutualCount: p.metadata?.mutualTies?.length || 0,
      distance: p.metadata?.pathLength || 0,
      raw: p
    }));
    return res.status(200).json(formatted);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Pathways API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 