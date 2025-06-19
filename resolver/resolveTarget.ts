import { Neo4jService } from '../services/neo4j';
import { resolveEntityName } from '../graph/utils/resolveAliases';
import { lookupPerson, lookupFirm } from '../enrichment';
import { ResolvedTarget, ResolverOptions } from '../types/resolver';
import { PathFinder } from '../graph/queryPaths';
import { ScoredPath } from '../types/path';

export class TargetResolver {
  private neo4j: Neo4jService;
  private pathFinder: PathFinder;

  constructor() {
    this.neo4j = Neo4jService.getInstance();
    this.pathFinder = new PathFinder(this.neo4j);
  }

  async resolveTarget(query: string, options: ResolverOptions = {}): Promise<ResolvedTarget> {
    const {
      debug = false,
      minSimilarity = 0.85,
      enrichOnMiss = true,
      findPaths = true
    } = options;

    const notes: string[] = [];
    const result: ResolvedTarget = {
      metadata: {
        matchType: 'unknown',
        query,
        source: 'local',
        notes
      }
    };

    try {
      // First try to match against existing nodes
      const matchResult = await this.matchExistingNode(query, { debug, minSimilarity });
      
      if (matchResult) {
        if (debug) {
          console.log(`[Resolver] Found existing node match:`, matchResult);
        }

        // Find paths if requested
        let connectionPaths: ScoredPath[] | undefined;
        if (findPaths && matchResult.targetNodeId) {
          connectionPaths = await this.pathFinder.findPaths(matchResult.targetNodeId, { debug });
          if (debug) {
            console.log(`[Resolver] Found ${connectionPaths.length} connection paths`);
          }
        }

        return {
          ...matchResult,
          connectionPaths,
          metadata: {
            ...matchResult.metadata,
            notes: [...notes, ...(matchResult.metadata.notes || [])]
          }
        };
      }

      // If no match and enrichment is enabled, try external lookups
      if (enrichOnMiss) {
        const enrichedResult = await this.enrichTarget(query, { debug });
        if (enrichedResult) {
          if (debug) {
            console.log(`[Resolver] Found enriched target:`, enrichedResult);
          }

          // Find paths if requested
          let connectionPaths: ScoredPath[] | undefined;
          if (findPaths && enrichedResult.targetNodeId) {
            connectionPaths = await this.pathFinder.findPaths(enrichedResult.targetNodeId, { debug });
            if (debug) {
              console.log(`[Resolver] Found ${connectionPaths.length} connection paths`);
            }
          }

          return {
            ...enrichedResult,
            connectionPaths,
            metadata: {
              ...enrichedResult.metadata,
              notes: [...notes, ...(enrichedResult.metadata.notes || [])]
            }
          };
        }
      }

      // If we get here, we couldn't resolve the target
      notes.push('No match found in graph or external sources');
      return result;

    } catch (error: unknown) {
      console.error('[Resolver] Error resolving target:', error);
      notes.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  private async matchExistingNode(
    query: string,
    options: { debug: boolean; minSimilarity: number }
  ): Promise<ResolvedTarget | null> {
    const { debug, minSimilarity } = options;
    const notes: string[] = [];

    // Try to match against people
    const personMatch = await this.matchPerson(query, { debug, minSimilarity });
    if (personMatch) {
      return {
        targetNodeId: personMatch.id,
        targetName: personMatch.name,
        targetType: 'Person',
        metadata: {
          matchType: 'exact',
          query,
          source: 'local',
          notes: ['Exact match found in graph']
        }
      };
    }

    // Try to match against firms
    const firmMatch = await this.matchFirm(query, { debug, minSimilarity });
    if (firmMatch) {
      return {
        targetNodeId: firmMatch.id,
        targetName: firmMatch.name,
        targetType: 'Firm',
        metadata: {
          matchType: 'exact',
          query,
          source: 'local',
          notes: ['Exact match found in graph']
        }
      };
    }

    return null;
  }

  private async matchPerson(
    query: string,
    options: { debug: boolean; minSimilarity: number }
  ): Promise<{ id: string; name: string; similarity: number } | null> {
    const { debug, minSimilarity } = options;
    const resolvedName = resolveEntityName(query, { debug, minSimilarity });

    // Query Neo4j for person match
    const session = this.neo4j.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (p:Person)
        WHERE toLower(p.name) CONTAINS toLower($name)
        RETURN p.id as id, p.name as name
        `,
        { name: resolvedName }
      );

      if (result.records.length > 0) {
        const record = result.records[0];
        const similarity = this.calculateSimilarity(resolvedName, record.get('name'));
        
        if (similarity >= minSimilarity) {
          return {
            id: record.get('id'),
            name: record.get('name'),
            similarity
          };
        }
      }
      return null;
    } finally {
      await session.close();
    }
  }

  private async matchFirm(
    query: string,
    options: { debug: boolean; minSimilarity: number }
  ): Promise<{ id: string; name: string; similarity: number } | null> {
    const { debug, minSimilarity } = options;
    const resolvedName = resolveEntityName(query, { debug, minSimilarity });

    // Query Neo4j for firm match
    const session = this.neo4j.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (f:Firm)
        WHERE toLower(f.name) CONTAINS toLower($name)
        RETURN f.id as id, f.name as name
        `,
        { name: resolvedName }
      );

      if (result.records.length > 0) {
        const record = result.records[0];
        const similarity = this.calculateSimilarity(resolvedName, record.get('name'));
        
        if (similarity >= minSimilarity) {
          return {
            id: record.get('id'),
            name: record.get('name'),
            similarity
          };
        }
      }
      return null;
    } finally {
      await session.close();
    }
  }

  private async enrichTarget(
    query: string,
    options: { debug: boolean }
  ): Promise<ResolvedTarget | null> {
    const { debug } = options;
    const notes: string[] = [];

    // Determine if query looks like a person or firm
    const isPersonQuery = this.looksLikePerson(query);
    
    try {
      if (isPersonQuery) {
        const personResult = await lookupPerson(query, { debug });
        if (personResult) {
          return {
            targetNodeId: personResult.nodeId,
            targetName: personResult.contact.name,
            targetType: 'Person',
            metadata: {
              matchType: 'enriched',
              query,
              source: 'external',
              notes: ['Enriched from external sources']
            }
          };
        }
      } else {
        const firmResult = await lookupFirm(query, { debug });
        if (firmResult) {
          return {
            targetNodeId: firmResult.nodeId,
            targetName: firmResult.contact.name,
            targetType: 'Firm',
            metadata: {
              matchType: 'enriched',
              query,
              source: 'external',
              notes: ['Enriched from external sources']
            }
          };
        }
      }
      return null;
    } catch (error: unknown) {
      console.error('[Resolver] Error enriching target:', error);
      notes.push(`Enrichment error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private looksLikePerson(query: string): boolean {
    // Simple heuristic: if it contains "at" or "from", it's likely a person
    // You might want to enhance this with more sophisticated logic
    return /\s+(at|from|@)\s+/i.test(query);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple similarity calculation - you might want to use a more sophisticated algorithm
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Add more sophisticated similarity calculation here
    return 0.5;
  }
} 