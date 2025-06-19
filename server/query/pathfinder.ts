import { Neo4jService } from '@/services/neo4j';
import { PathResult, ConnectionStep, ConnectionEdge } from '@/types/path';
import { scoreAndSortPaths } from './score_paths';
import { GraphNode, GraphRelationship } from '@/types';
import { Record } from 'neo4j-driver';

export class PathFinder {
  private neo4jService: Neo4jService;

  constructor(neo4jService: Neo4jService) {
    this.neo4jService = neo4jService;
  }

  /**
   * Convert Neo4j path to our internal format
   */
  private convertNeo4jPath(neo4jPath: any): (GraphNode | GraphRelationship)[] {
    const path: (GraphNode | GraphRelationship)[] = [];
    
    neo4jPath.segments.forEach((segment: any, index: number) => {
      // Add start node only on first segment
      if (index === 0) {
        path.push({
          id: segment.start.identity.toString(),
          labels: segment.start.labels,
          properties: segment.start.properties,
        });
      }
      // Add relationship
      path.push({
        id: segment.relationship.identity.toString(),
        type: segment.relationship.type,
        fromId: segment.relationship.start.toString(),
        toId: segment.relationship.end.toString(),
        properties: segment.relationship.properties,
      });
      // Add end node of each segment
      path.push({
        id: segment.end.identity.toString(),
        labels: segment.end.labels,
        properties: segment.end.properties,
      });
    });

    return path;
  }

  /**
   * Deduplicate paths by comparing their structure
   */
  private deduplicatePaths(paths: (GraphNode | GraphRelationship)[][]): (GraphNode | GraphRelationship)[][] {
    const uniquePaths: (GraphNode | GraphRelationship)[][] = [];
    const pathSignatures = new Set<string>();

    for (const path of paths) {
      // Create a signature based on node IDs and relationship types
      const signature = path.map(item => {
        if ('type' in item) {
          return `R:${item.type}`;
        } else {
          return `N:${item.id}`;
        }
      }).join('|');

      if (!pathSignatures.has(signature)) {
        pathSignatures.add(signature);
        uniquePaths.push(path);
      }
    }

    return uniquePaths;
  }

  /**
   * Convert scored path to PathResult format
   */
  private convertToPathResult(scoredPath: any): PathResult {
    return {
      path: scoredPath.path.map((item: any) => {
        if ('type' in item) {
          // It's a relationship
          return {
            type: item.type,
            properties: item.properties
          } as ConnectionEdge;
        } else {
          // It's a node
          return {
            id: item.id,
            labels: item.labels,
            properties: item.properties
          } as ConnectionStep;
        }
      }),
      confidence: scoredPath.score,
      sources: scoredPath.metadata.sourceTypes,
      recommendedAction: this.generateRecommendedAction(scoredPath)
    };
  }

  /**
   * Generate a recommended action based on path metadata
   */
  private generateRecommendedAction(scoredPath: any): string {
    const { strongestLink, notes } = scoredPath.metadata;
    if (notes.some((note: string) => note.includes('Current position'))) {
      return 'Reach out directly - they are currently connected';
    }
    if (notes.some((note: string) => note.includes('Recent end date'))) {
      return 'Reach out - they were recently connected';
    }
    return 'Consider reaching out through the strongest connection';
  }

  /**
   * Get relationship type summary for a path
   */
  private getRelationshipSummary(path: (GraphNode | GraphRelationship)[]): string {
    const relationships = path.filter(item => 'type' in item) as GraphRelationship[];
    const typeCounts = new Map<string, number>();
    
    relationships.forEach(rel => {
      typeCounts.set(rel.type, (typeCounts.get(rel.type) || 0) + 1);
    });

    return Array.from(typeCounts.entries())
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
  }

  /**
   * Find paths between two nodes
   */
  async findPaths(sourceId: string, targetId: string): Promise<PathResult[]> {
    const session = this.neo4jService.getSession();
    
    try {
      // Query to find all paths up to length 3
      const result = await session.run(
        `
        MATCH (source {id: $sourceId})
        MATCH (target {id: $targetId})
        MATCH path = (source)-[*1..3]-(target)
        RETURN path
        `,
        { sourceId, targetId }
      );

      // Convert Neo4j paths to our format
      const rawPaths = result.records.map((record: Record) => 
        this.convertNeo4jPath(record.get('path'))
      );

      if (rawPaths.length === 0) {
        return [];
      }

      // Deduplicate paths before scoring
      const uniquePaths = this.deduplicatePaths(rawPaths);

      // Score and sort paths
      const scoredPaths = scoreAndSortPaths(uniquePaths);

      // Log scoring results in dev mode
      if (process.env.NODE_ENV === 'development' && scoredPaths.length > 1) {
        console.log(`Found ${scoredPaths.length} unique paths between nodes ${sourceId} and ${targetId}`);
        scoredPaths.forEach((path, index) => {
          console.log(`\nPath ${index + 1}:`);
          console.log(`Score: ${path.score.toFixed(2)}`);
          console.log(`Relationship types: ${this.getRelationshipSummary(path.path)}`);
          console.log(`Strongest link: ${path.metadata.strongestLink}`);
          console.log('Scoring notes:');
          path.metadata.notes?.forEach((note: string) => console.log(`  - ${note}`));
          console.log('---');
        });
      }

      // Convert to PathResult format and return top 3
      return scoredPaths
        .slice(0, 3)
        .map(path => this.convertToPathResult(path));

    } finally {
      await session.close();
    }
  }

  /**
   * Close the Neo4j driver connection
   */
  async close(): Promise<void> {
    await this.neo4jService.close();
  }
} 