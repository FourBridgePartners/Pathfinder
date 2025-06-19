import { Neo4jService } from '../services/neo4j';
import { PathNode, PathConnection, ScoredPath, ScoringWeights } from '../types/path';

interface PathFinderOptions {
  maxHops?: number;
  minScore?: number;
  debug?: boolean;
  weights?: Partial<ScoringWeights>;
}

interface PathQueryOptions {
  debug?: boolean;
  limit?: number;
}

/**
 * PathFinder is responsible for discovering and scoring connection paths between
 * FourBridge contacts and target nodes (people or firms) in the graph.
 * 
 * It uses Neo4j's shortestPath algorithm to find optimal paths, with fallback
 * to alternative paths if no shortest path exists. Paths are scored based on:
 * - Path length (shorter paths score higher)
 * - Connection types (e.g., direct connections score higher than indirect)
 * - Connection strength (based on relationship properties)
 * - Mutual ties (shared firms, connections, etc.)
 * 
 * Example usage:
 * ```typescript
 * const pathFinder = new PathFinder(neo4jService);
 * const paths = await pathFinder.findPaths('target_123', { debug: true });
 * ```
 */
export class PathFinder {
  private neo4j: Neo4jService;
  private weights: ScoringWeights;

  constructor(neo4j: Neo4jService, options: PathFinderOptions = {}) {
    this.neo4j = neo4j;
    this.weights = {
      maxHops: 4,
      minScore: 0.1,
      pathLengthWeight: 0.4,
      connectionTypeWeight: 0.3,
      connectionStrengthWeight: 0.2,
      mutualTiesWeight: 0.1,
      ...options.weights
    };
  }

  /**
   * Finds the top scoring paths from FourBridge contacts to a target node.
   * 
   * The method first attempts to find shortest paths using Neo4j's shortestPath
   * algorithm. If no paths are found, it falls back to finding alternative paths
   * with the same constraints.
   * 
   * @param targetNodeId - The ID of the target node to find paths to
   * @param options - Query options including debug mode and result limit
   * @returns Array of scored paths, sorted by score in descending order
   * 
   * Example return shape:
   * ```typescript
   * [
   *   {
   *     path: [
   *       { id: 'person_1', type: 'Person', name: 'John Doe' },
   *       { type: 'CONNECTED_TO', strength: 0.8 },
   *       { id: 'person_2', type: 'Person', name: 'Target Person' }
   *     ],
   *     score: 0.85,
   *     metadata: {
   *       pathLength: 2,
   *       connectionTypes: ['CONNECTED_TO'],
   *       mutualTies: ['Acme Corp']
   *     }
   *   }
   * ]
   * ```
   */
  public async findPaths(
    targetNodeId: string,
    options: PathQueryOptions = {}
  ): Promise<ScoredPath[]> {
    const { debug = false } = options;

    // First try to find shortest paths
    const shortestPaths = await this.findShortestPaths(targetNodeId, options);
    if (shortestPaths.length > 0) {
      return this.normalizeScores(shortestPaths);
    }

    if (debug) {
      console.log('[PathFinder] No shortest paths found, trying alternative paths');
    }

    // If no shortest paths, try alternative paths
    const alternativePaths = await this.findAlternativePaths(targetNodeId, options);
    return this.normalizeScores(alternativePaths);
  }

  private normalizeScores(paths: ScoredPath[]): ScoredPath[] {
    if (paths.length === 0) return paths;

    // Find min and max scores
    const scores = paths.map(p => p.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;

    // Normalize scores if there's a range
    if (scoreRange > 0) {
      return paths.map(path => ({
        ...path,
        normalizedScore: (path.score - minScore) / scoreRange,
        metadata: {
          ...path.metadata,
          minScore,
          maxScore
        }
      }));
    }

    // If all scores are the same, set normalized score to 1
    return paths.map(path => ({
      ...path,
      normalizedScore: 1,
      metadata: {
        ...path.metadata,
        minScore,
        maxScore
      }
    }));
  }

  private async findShortestPaths(
    targetNodeId: string,
    options: PathQueryOptions
  ): Promise<ScoredPath[]> {
    const { debug = false, limit = 3 } = options;
    const maxHops = this.weights.maxHops;

    const query = `
      MATCH (target)
      WHERE target.id = $targetNodeId
      AND (target:Person OR target:Firm)
      
      MATCH path = shortestPath((start:Person {source: "FourBridge"})-[*1..${maxHops}]-(target))
      WHERE ANY(node IN nodes(path) WHERE node.source = "FourBridge")
      
      WITH path,
           [r IN relationships(path) | {
             type: type(r),
             properties: properties(r),
             direction: CASE
               WHEN startNode(r) = target THEN 'IN'
               WHEN endNode(r) = target THEN 'OUT'
               ELSE 'BIDIRECTIONAL'
             END
           }] as connections,
           [n IN nodes(path) | {
             id: n.id,
             type: labels(n)[0],
             name: n.name,
             source: n.source,
             confidence: n.confidence,
             isFourBridge: n.source = "FourBridge",
             sharedFirm: n.firm = target.firm
           }] as nodes,
           length(path) as pathLength
           
      RETURN path, connections, nodes, pathLength
      ORDER BY pathLength
      LIMIT $limit
    `;

    const session = this.neo4j.driver.session();
    try {
      const result = await session.run(query, { targetNodeId, limit });
      
      if (debug) {
        console.log(`[PathFinder] Found ${result.records.length} shortest paths`);
      }

      return result.records.map(record => this.scorePath({
        path: record.get('path'),
        connections: record.get('connections'),
        nodes: record.get('nodes'),
        length: record.get('pathLength')
      }));
    } finally {
      await session.close();
    }
  }

  private async findAlternativePaths(
    targetNodeId: string,
    options: PathQueryOptions
  ): Promise<ScoredPath[]> {
    const { debug = false, limit = 3 } = options;
    const maxHops = this.weights.maxHops;

    const query = `
      MATCH (target)
      WHERE target.id = $targetNodeId
      AND (target:Person OR target:Firm)
      
      MATCH path = (start:Person {source: "FourBridge"})-[*1..${maxHops}]-(target)
      WHERE ANY(node IN nodes(path) WHERE node.source = "FourBridge")
      
      WITH path,
           [r IN relationships(path) | {
             type: type(r),
             properties: properties(r),
             direction: CASE
               WHEN startNode(r) = target THEN 'IN'
               WHEN endNode(r) = target THEN 'OUT'
               ELSE 'BIDIRECTIONAL'
             END
           }] as connections,
           [n IN nodes(path) | {
             id: n.id,
             type: labels(n)[0],
             name: n.name,
             source: n.source,
             confidence: n.confidence,
             isFourBridge: n.source = "FourBridge",
             sharedFirm: n.firm = target.firm
           }] as nodes,
           length(path) as pathLength
           
      RETURN path, connections, nodes, pathLength
      ORDER BY pathLength
      LIMIT $limit
    `;

    const session = this.neo4j.driver.session();
    try {
      const result = await session.run(query, { targetNodeId, limit });
      
      if (debug) {
        console.log(`[PathFinder] Found ${result.records.length} alternative paths`);
      }

      return result.records.map(record => this.scorePath({
        path: record.get('path'),
        connections: record.get('connections'),
        nodes: record.get('nodes'),
        length: record.get('pathLength')
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Scores a path based on multiple factors:
   * - Path length (shorter paths score higher)
   * - Connection types (direct connections score higher)
   * - Connection strength (from relationship properties)
   * - Mutual ties (shared firms, connections)
   * 
   * The final score is a weighted average of these factors.
   * 
   * @param path - The path to score
   * @returns A scored path with metadata about the scoring factors
   */
  private scorePath(path: any): ScoredPath {
    const {
      path: neo4jPath,
      connections,
      nodes,
      length: pathLength
    } = path;

    // Calculate base score components
    const pathLengthScore = 1 - (pathLength / this.weights.maxHops);
    const connectionTypeScore = this.calculateConnectionTypeScore(connections);
    const connectionStrengthScore = this.calculateConnectionStrengthScore(connections);
    const mutualTiesScore = this.calculateMutualTiesScore(nodes);

    // Calculate weighted score
    const score = (
      this.weights.pathLengthWeight * pathLengthScore +
      this.weights.connectionTypeWeight * connectionTypeScore +
      this.weights.connectionStrengthWeight * connectionStrengthScore +
      this.weights.mutualTiesWeight * mutualTiesScore
    );

    return {
      path: this.convertNeo4jPath(neo4jPath),
      score,
      metadata: {
        pathLength,
        connectionTypes: connections.map((c: any) => c.type),
        mutualTies: this.extractMutualTies(nodes)
      }
    };
  }

  private calculateConnectionTypeScore(connections: any[]): number {
    // Direct connections score higher
    let baseScore = connections.length === 1 ? 1 : 0.5;
    
    // Boost for mutual connections
    const mutualConnections = connections.filter((c: any) => c.type === 'CONNECTED_VIA_MUTUAL');
    if (mutualConnections.length > 0) {
      baseScore += 0.2; // +20% boost for mutual connections
    }
    
    return Math.min(baseScore, 1); // Cap at 1
  }

  private calculateConnectionStrengthScore(connections: any[]): number {
    // Average of connection strengths with boost for mutual connections
    const strengths = connections.map((c: any) => {
      let strength = c.properties?.strength || 0;
      
      // Boost strength for mutual connections
      if (c.type === 'CONNECTED_VIA_MUTUAL') {
        strength += 0.3; // +30% strength boost
      }
      
      return Math.min(strength, 1); // Cap at 1
    });
    
    return strengths.reduce((a: number, b: number) => a + b, 0) / strengths.length;
  }

  private calculateMutualTiesScore(nodes: any[]): number {
    // Count shared firms and mutual connections
    const mutualTies = this.extractMutualTies(nodes);
    let baseScore = Math.min(mutualTies.length / 3, 1); // Cap at 1
    
    // Additional boost for paths with mutual connections
    const hasMutualConnections = nodes.some((node: any) => 
      node.properties?.type === 'mutual_connection'
    );
    
    if (hasMutualConnections) {
      baseScore += 0.2; // +20% boost for mutual connection paths
    }
    
    return Math.min(baseScore, 1); // Cap at 1
  }

  private extractMutualTies(nodes: any[]): string[] {
    const ties: string[] = [];
    nodes.forEach(node => {
      if (node.sharedFirm) {
        ties.push(node.firm);
      }
      // Add mutual connections as ties
      if (node.properties?.type === 'mutual_connection') {
        ties.push(`mutual_${node.name}`);
      }
    });
    return ties;
  }

  private convertNeo4jPath(neo4jPath: any): (PathNode | PathConnection)[] {
    const path: (PathNode | PathConnection)[] = [];
    
    neo4jPath.segments.forEach((segment: any, index: number) => {
      // Add start node only on first segment
      if (index === 0) {
        path.push({
          id: segment.start.identity.toString(),
          type: segment.start.labels[0] as 'Person' | 'Firm' | 'School',
          name: segment.start.properties.name,
          source: segment.start.properties.source,
          confidence: segment.start.properties.confidence,
          isFourBridge: segment.start.properties.source === 'FourBridge',
          sharedFirm: segment.start.properties.sharedFirm
        });
      }
      // Add relationship
      path.push({
        type: segment.relationship.type,
        strength: segment.relationship.properties?.strength || 0,
        direction: segment.relationship.properties?.direction || 'BIDIRECTIONAL',
        properties: segment.relationship.properties
      });
      // Add end node of each segment
      path.push({
        id: segment.end.identity.toString(),
        type: segment.end.labels[0] as 'Person' | 'Firm' | 'School',
        name: segment.end.properties.name,
        source: segment.end.properties.source,
        confidence: segment.end.properties.confidence,
        isFourBridge: segment.end.properties.source === 'FourBridge',
        sharedFirm: segment.end.properties.sharedFirm
      });
    });

    return path;
  }
} 