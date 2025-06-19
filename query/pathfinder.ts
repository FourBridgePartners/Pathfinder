import neo4j, { Driver, Session } from 'neo4j-driver';
import { GraphNode, GraphRelationship } from '../types';

export interface PathResult {
  path: (GraphNode | GraphRelationship)[];
  confidence: number;
  sources: string[];
  recommendedAction: string;
}

export class PathFinder {
  private driver: Driver;
  private session: Session;

  constructor(uri: string, username: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
    this.session = this.driver.session();
  }

  private calculateConfidence(path: any[]): number {
    // Simple confidence calculation based on relationship properties
    let totalConfidence = 0;
    let count = 0;

    for (const item of path) {
      if (item.type === 'WORKED_AT' || item.type === 'ATTENDED_SCHOOL') {
        if (item.properties?.source?.confidence) {
          totalConfidence += item.properties.source.confidence;
          count++;
        }
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  private extractSources(path: any[]): string[] {
    const sources = new Set<string>();
    
    for (const item of path) {
      if (item.properties?.source?.type) {
        sources.add(item.properties.source.type);
      }
    }

    return Array.from(sources);
  }

  private generateRecommendedAction(path: any[]): string {
    const nodes = path.filter(item => !item.type);
    const relationships = path.filter(item => item.type);

    if (nodes.length < 2) return 'No clear path found';

    const source = nodes[0];
    const target = nodes[nodes.length - 1];
    const middlePerson = nodes[1];

    if (relationships[0]?.type === 'KNOWS') {
      const metadata = relationships[0].properties;
      const mutuals = metadata.mutualConnections || 0;
      const direction = metadata.direction || 'unknown';
      
      let action = `Connection path through ${middlePerson.properties.name}:`;
      
      // Add recommendation based on mutual count
      if (mutuals >= 100) {
        action += `\nStrong connection opportunity: ${mutuals} mutual connections`;
      } else if (mutuals >= 30) {
        action += `\nWarm connection: ${mutuals} shared connections`;
      } else {
        action += `\nPossible connection: ${mutuals} mutual connections`;
      }
      
      // Add metadata
      action += `\n- Connection type: ${direction}`;
      if (metadata.lastSeen) {
        action += `\n- Last seen: ${metadata.lastSeen}`;
      }
      if (metadata.notes) {
        action += `\n- Notes: ${metadata.notes}`;
      }
      return action;
    } else if (relationships[0]?.type === 'WORKED_AT') {
      return `Ask ${middlePerson.properties.name} to introduce you to ${target.properties.name} via ${relationships[0].properties.role} at ${relationships[1].properties.role}`;
    } else if (relationships[0]?.type === 'ATTENDED_SCHOOL') {
      return `Ask ${middlePerson.properties.name} to introduce you to ${target.properties.name} via ${relationships[0].properties.role} at ${relationships[1].properties.role}`;
    }

    return 'Consider reaching out through mutual connections';
  }

  async findPaths(sourceId: string, targetId: string, maxDepth: number = 3): Promise<PathResult[]> {
    const query = `
      MATCH path = shortestPath((source)-[*1..${maxDepth}]-(target))
      WHERE source.id = $sourceId AND target.id = $targetId
      RETURN path
      LIMIT 5
    `;

    try {
      const result = await this.session.run(query, { sourceId, targetId });
      const paths: PathResult[] = [];

      for (const record of result.records) {
        const path = record.get('path');
        const pathElements = path.segments.map((segment: any) => [
          {
            id: segment.start.identity.toString(),
            labels: segment.start.labels,
            properties: segment.start.properties,
          },
          {
            type: segment.relationship.type,
            properties: segment.relationship.properties,
          },
          {
            id: segment.end.identity.toString(),
            labels: segment.end.labels,
            properties: segment.end.properties,
          },
        ]).flat();

        paths.push({
          path: pathElements,
          confidence: this.calculateConfidence(pathElements),
          sources: this.extractSources(pathElements),
          recommendedAction: this.generateRecommendedAction(pathElements),
        });
      }

      return paths.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Failed to find paths:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.session.close();
    await this.driver.close();
  }
}
