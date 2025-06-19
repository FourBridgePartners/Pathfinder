import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathFinder } from '../../graph/queryPaths';
import { Neo4jService } from '../../services/neo4j';
import { PathNode, PathConnection, ScoredPath } from '../../types/path';
import samplePath from '../fixtures/sample_path.json';
import { mockSession, mockDriver } from '../setup';

describe('PathFinder', () => {
  let pathFinder: PathFinder;
  let mockNeo4j: Neo4jService;

  beforeEach(() => {
    // Create mock Neo4j service
    mockNeo4j = {
      driver: mockDriver
    } as unknown as Neo4jService;

    pathFinder = new PathFinder(mockNeo4j);
    vi.clearAllMocks();
  });

  describe('findPaths', () => {
    it('should return normalized scored paths', async () => {
      // Mock Neo4j response
      const mockResult = {
        records: [
          {
            get: (key: string) => {
              switch (key) {
                case 'path':
                  return {
                    segments: [
                      {
                        start: {
                          identity: { toString: () => '1' },
                          labels: ['Person'],
                          properties: {
                            name: 'John Smith',
                            source: 'FourBridge',
                            confidence: 0.9
                          }
                        },
                        relationship: {
                          type: 'WORKS_WITH',
                          properties: { strength: 0.8 }
                        },
                        end: {
                          identity: { toString: () => '2' },
                          labels: ['Person'],
                          properties: {
                            name: 'Jane Doe',
                            source: 'LinkedIn',
                            confidence: 0.85,
                            firm: 'Target Firm'
                          }
                        }
                      }
                    ]
                  };
                case 'connections':
                  return [
                    {
                      type: 'WORKS_WITH',
                      properties: { strength: 0.8 },
                      direction: 'OUT'
                    }
                  ];
                case 'nodes':
                  return [
                    {
                      id: '1',
                      type: 'Person',
                      name: 'John Smith',
                      source: 'FourBridge',
                      confidence: 0.9,
                      isFourBridge: true,
                      sharedFirm: false
                    },
                    {
                      id: '2',
                      type: 'Person',
                      name: 'Jane Doe',
                      source: 'LinkedIn',
                      confidence: 0.85,
                      isFourBridge: false,
                      sharedFirm: true
                    }
                  ];
                case 'pathLength':
                  return 1;
                default:
                  return null;
              }
            }
          }
        ]
      };

      mockSession.run.mockResolvedValue(mockResult);

      const paths = await pathFinder.findPaths('2');

      expect(paths).toHaveLength(1);
      const path = paths[0];
      expect(path).toMatchObject({
        path: expect.arrayContaining([
          expect.objectContaining({
            id: '1',
            type: 'Person',
            name: 'John Smith',
            source: 'FourBridge',
            confidence: 0.9,
            isFourBridge: true
          }),
          expect.objectContaining({
            type: 'WORKS_WITH',
            strength: 0.8,
            direction: expect.any(String)
          }),
          expect.objectContaining({
            id: '2',
            type: 'Person',
            name: 'Jane Doe',
            source: 'LinkedIn',
            confidence: 0.85,
            isFourBridge: false
          })
        ]),
        score: expect.any(Number),
        normalizedScore: expect.any(Number),
        metadata: expect.objectContaining({
          pathLength: 1,
          connectionTypes: ['WORKS_WITH'],
          mutualTies: expect.any(Array)
        })
      });

      // Verify Neo4j query was called
      expect(mockSession.run).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      mockSession.run.mockResolvedValue({ records: [] });
      const paths = await pathFinder.findPaths('1');
      expect(paths).toHaveLength(0);
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('scorePath', () => {
    it('should score paths with mutual connections higher', () => {
      const path = {
        path: {
          segments: [
            {
              start: {
                identity: { toString: () => '1' },
                labels: ['Person'],
                properties: {
                  name: 'John Smith',
                  source: 'FourBridge',
                  confidence: 0.9
                }
              },
              relationship: {
                type: 'WORKS_WITH',
                properties: { strength: 0.9, mutualConnections: 5 }
              },
              end: {
                identity: { toString: () => '2' },
                labels: ['Person'],
                properties: {
                  name: 'Jane Doe',
                  source: 'LinkedIn',
                  confidence: 0.85
                }
              }
            }
          ]
        },
        connections: [
          {
            type: 'WORKS_WITH',
            properties: { strength: 0.9, mutualConnections: 5 },
            direction: 'OUT'
          }
        ],
        nodes: [
          {
            id: '1',
            type: 'Person',
            name: 'John Smith',
            source: 'FourBridge',
            confidence: 0.9,
            isFourBridge: true
          },
          {
            id: '2',
            type: 'Person',
            name: 'Jane Doe',
            source: 'LinkedIn',
            confidence: 0.85,
            isFourBridge: false
          }
        ],
        length: 1
      };

      const scoredPath = pathFinder['scorePath'](path);
      expect(scoredPath.score).toBeGreaterThan(0.5);
      expect(scoredPath.metadata).toMatchObject({
        pathLength: 1,
        connectionTypes: ['WORKS_WITH'],
        mutualTies: expect.any(Array)
      });
    });

    it('should score paths with shared firms higher', () => {
      const path = {
        path: {
          segments: [
            {
              start: {
                identity: { toString: () => '1' },
                labels: ['Person'],
                properties: {
                  name: 'John Smith',
                  source: 'FourBridge',
                  confidence: 0.9,
                  firm: 'Shared Firm'
                }
              },
              relationship: {
                type: 'WORKS_WITH',
                properties: { strength: 0.8 }
              },
              end: {
                identity: { toString: () => '2' },
                labels: ['Person'],
                properties: {
                  name: 'Jane Doe',
                  source: 'LinkedIn',
                  confidence: 0.85,
                  firm: 'Shared Firm'
                }
              }
            }
          ]
        },
        connections: [
          {
            type: 'WORKS_WITH',
            properties: { strength: 0.8 },
            direction: 'OUT'
          }
        ],
        nodes: [
          {
            id: '1',
            type: 'Person',
            name: 'John Smith',
            source: 'FourBridge',
            confidence: 0.9,
            isFourBridge: true,
            sharedFirm: true
          },
          {
            id: '2',
            type: 'Person',
            name: 'Jane Doe',
            source: 'LinkedIn',
            confidence: 0.85,
            isFourBridge: false,
            sharedFirm: true
          }
        ],
        length: 1
      };

      const scoredPath = pathFinder['scorePath'](path);
      expect(scoredPath.score).toBeGreaterThan(0.5);
    });
  });

  describe('normalizeScores', () => {
    it('should normalize scores to [0, 1] range', () => {
      const paths: ScoredPath[] = [
        {
          path: [],
          score: 0.3,
          metadata: { pathLength: 1, connectionTypes: [], mutualTies: [] }
        },
        {
          path: [],
          score: 0.6,
          metadata: { pathLength: 1, connectionTypes: [], mutualTies: [] }
        },
        {
          path: [],
          score: 0.9,
          metadata: { pathLength: 1, connectionTypes: [], mutualTies: [] }
        }
      ];

      const normalized = pathFinder['normalizeScores'](paths);
      
      expect(normalized[0].normalizedScore).toBe(0);
      expect(normalized[1].normalizedScore).toBeCloseTo(0.5, 1);
      expect(normalized[2].normalizedScore).toBe(1);
    });

    it('should handle equal scores', () => {
      const paths: ScoredPath[] = [
        {
          path: [],
          score: 0.5,
          metadata: { pathLength: 1, connectionTypes: [], mutualTies: [] }
        },
        {
          path: [],
          score: 0.5,
          metadata: { pathLength: 1, connectionTypes: [], mutualTies: [] }
        }
      ];

      const normalized = pathFinder['normalizeScores'](paths);
      
      expect(normalized[0].normalizedScore).toBe(1);
      expect(normalized[1].normalizedScore).toBe(1);
    });
  });

  describe('convertNeo4jPath', () => {
    it('should maintain node/edge order and preserve metadata', () => {
      const neo4jPath = {
        segments: [
          {
            start: {
              identity: { toString: () => '1' },
              labels: ['Person'],
              properties: {
                name: 'John Smith',
                source: 'FourBridge',
                confidence: 0.9
              }
            },
            relationship: {
              type: 'WORKS_WITH',
              properties: { strength: 0.8 }
            },
            end: {
              identity: { toString: () => '2' },
              labels: ['Person'],
              properties: {
                name: 'Jane Doe',
                source: 'LinkedIn',
                confidence: 0.85
              }
            }
          }
        ]
      };

      const converted = pathFinder['convertNeo4jPath'](neo4jPath);

      expect(converted).toHaveLength(3); // Node, Edge, Node
      expect(converted[0]).toMatchObject({
        id: '1',
        type: 'Person',
        name: 'John Smith',
        source: 'FourBridge',
        confidence: 0.9
      });
      expect(converted[1]).toMatchObject({
        type: 'WORKS_WITH',
        strength: 0.8
      });
      expect(converted[2]).toMatchObject({
        id: '2',
        type: 'Person',
        name: 'Jane Doe',
        source: 'LinkedIn',
        confidence: 0.85
      });
    });
  });

  describe('fixture-based tests', () => {
    it('should match expected path structure from fixture', async () => {
      const mockResult = {
        records: [
          {
            get: (key: string) => {
              switch (key) {
                case 'path':
                  return {
                    segments: [
                      {
                        start: {
                          identity: { toString: () => '1' },
                          labels: ['Person'],
                          properties: {
                            name: 'John Smith',
                            source: 'FourBridge',
                            confidence: 0.9
                          }
                        },
                        relationship: {
                          type: 'WORKS_WITH',
                          properties: { strength: 0.8 }
                        },
                        end: {
                          identity: { toString: () => '2' },
                          labels: ['Person'],
                          properties: {
                            name: 'Jane Doe',
                            source: 'LinkedIn',
                            confidence: 0.85,
                            firm: 'Target Firm'
                          }
                        }
                      },
                      {
                        start: {
                          identity: { toString: () => '2' },
                          labels: ['Person'],
                          properties: {
                            name: 'Jane Doe',
                            source: 'LinkedIn',
                            confidence: 0.85,
                            firm: 'Target Firm'
                          }
                        },
                        relationship: {
                          type: 'WORKS_AT',
                          properties: { strength: 0.9 }
                        },
                        end: {
                          identity: { toString: () => '3' },
                          labels: ['Firm'],
                          properties: {
                            name: 'Target Firm',
                            source: 'Firecrawl',
                            confidence: 0.95
                          }
                        }
                      }
                    ]
                  };
                case 'connections':
                  return [
                    {
                      type: 'WORKS_WITH',
                      properties: { strength: 0.8 },
                      direction: 'OUT'
                    },
                    {
                      type: 'WORKS_AT',
                      properties: { strength: 0.9 },
                      direction: 'IN'
                    }
                  ];
                case 'nodes':
                  return [
                    {
                      id: '1',
                      type: 'Person',
                      name: 'John Smith',
                      source: 'FourBridge',
                      confidence: 0.9,
                      isFourBridge: true,
                      sharedFirm: false
                    },
                    {
                      id: '2',
                      type: 'Person',
                      name: 'Jane Doe',
                      source: 'LinkedIn',
                      confidence: 0.85,
                      isFourBridge: false,
                      sharedFirm: true
                    },
                    {
                      id: '3',
                      type: 'Firm',
                      name: 'Target Firm',
                      source: 'Firecrawl',
                      confidence: 0.95,
                      isFourBridge: false,
                      sharedFirm: false
                    }
                  ];
                case 'pathLength':
                  return 2;
                default:
                  return null;
              }
            }
          }
        ]
      };

      mockSession.run.mockResolvedValue(mockResult);

      const paths = await pathFinder.findPaths('3');
      expect(paths[0]).toMatchObject({
        path: expect.arrayContaining([
          expect.objectContaining({
            id: '1',
            type: 'Person',
            name: 'John Smith'
          }),
          expect.objectContaining({
            type: 'WORKS_WITH',
            direction: expect.any(String)
          }),
          expect.objectContaining({
            id: '2',
            type: 'Person',
            name: 'Jane Doe'
          }),
          expect.objectContaining({
            type: 'WORKS_AT',
            direction: expect.any(String)
          }),
          expect.objectContaining({
            id: '3',
            type: 'Firm',
            name: 'Target Firm'
          })
        ]),
        metadata: expect.objectContaining({
          pathLength: 2,
          connectionTypes: ['WORKS_WITH', 'WORKS_AT'],
          mutualTies: expect.any(Array)
        })
      });

      expect(mockSession.close).toHaveBeenCalled();
    });
  });
}); 