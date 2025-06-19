/// <reference types="vitest" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PathFinder } from '../pathfinder';
import { Neo4jService } from '@/services/neo4j';
import type { GraphNode, GraphRelationship } from '@/types';

describe('PathFinder Integration', () => {
  let pathFinder: PathFinder;
  let neo4jService: Neo4jService;

  beforeAll(async () => {
    neo4jService = Neo4jService.getInstance();
    pathFinder = new PathFinder(neo4jService);

    // Create test data
    const session = neo4jService.getSession();
    try {
      await session.run(`
        MATCH (n) DETACH DELETE n
      `);

      await session.run(`
        CREATE (alice:Person {id: '1', name: 'Alice', confidence: 0.9})
        CREATE (bob:Person {id: '2', name: 'Bob', confidence: 0.8})
        CREATE (charlie:Person {id: '3', name: 'Charlie', confidence: 0.9})
        CREATE (acme:Company {id: '4', name: 'Acme Corp', confidence: 0.8})
        CREATE (harvard:School {id: '5', name: 'Harvard', confidence: 0.9})
        
        CREATE (alice)-[r1:WORKED_AT {id: '1_4_WORKED_AT', fromId: '1', toId: '4', startYear: 2010, endYear: 2015, isCurrent: false, sourceType: 'linkedin', sourceConfidence: 0.9}]->(acme)
        CREATE (bob)-[r2:WORKED_AT {id: '2_4_WORKED_AT', fromId: '2', toId: '4', startYear: 2015, isCurrent: true, sourceType: 'linkedin', sourceConfidence: 0.9}]->(acme)
        CREATE (alice)-[r3:ATTENDED_SCHOOL {id: '1_5_ATTENDED_SCHOOL', fromId: '1', toId: '5', startYear: 2000, endYear: 2004, isCurrent: false, sourceType: 'linkedin', sourceConfidence: 0.9}]->(harvard)
        CREATE (charlie)-[r4:ATTENDED_SCHOOL {id: '3_5_ATTENDED_SCHOOL', fromId: '3', toId: '5', startYear: 2002, endYear: 2006, isCurrent: false, sourceType: 'linkedin', sourceConfidence: 0.9}]->(harvard)
      `);
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    const session = neo4jService.getSession();
    try {
      await session.run(`
        MATCH (n) DETACH DELETE n
      `);
    } finally {
      await session.close();
    }
  });

  it('should find paths between two nodes', async () => {
    const results = await pathFinder.findPaths('1', '3');

    expect(results).toHaveLength(1);
    expect(results[0].path).toHaveLength(5); // 3 nodes + 2 relationships
    expect(results[0].confidence).toBeGreaterThan(0);
    expect(results[0].sources).toContain('linkedin');
    expect(results[0].recommendedAction).toBeTruthy();
  });

  it('should handle non-existent nodes', async () => {
    const results = await pathFinder.findPaths('999', '888');
    expect(results).toHaveLength(0);
  });

  it('should include metadata in results', async () => {
    const results = await pathFinder.findPaths('1', '3');
    expect(results[0].sources).toContain('linkedin');
    expect(results[0].recommendedAction).toBeTruthy();
  });
}); 