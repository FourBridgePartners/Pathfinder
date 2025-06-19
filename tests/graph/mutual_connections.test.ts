import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphConstructor } from '../../graph/construct_graph';
import { PathFinder } from '../../graph/queryPaths';
import { Neo4jService } from '../../services/neo4j';
import { MutualConnectionFetcher } from '../../server/lib/linkedin/getMutualConnections';
import { LinkedInOAuthService } from '../../server/api/linkedin/oauth';
import { mockSession, mockDriver } from '../setup';

interface MockMutualConnection {
  id: string;
  name: string;
  headline?: string;
  profileUrl?: string;
  mutualCount: number;
  viaFourBridgeMembers: string[];
}

describe('Mutual Connections Integration', () => {
  let graphConstructor: GraphConstructor;
  let pathFinder: PathFinder;
  let mockNeo4j: Neo4jService;
  let mutualConnectionFetcher: MutualConnectionFetcher;
  let oauthService: LinkedInOAuthService;

  beforeEach(() => {
    // Create mock Neo4j service
    mockNeo4j = {
      driver: mockDriver,
      createOrUpdateNode: vi.fn(),
      createOrUpdateRelationship: vi.fn(),
      findNodeByProperty: vi.fn(),
      close: vi.fn()
    } as unknown as Neo4jService;

    graphConstructor = new GraphConstructor(mockDriver, mockSession);
    pathFinder = new PathFinder(mockNeo4j);
    
    oauthService = new LinkedInOAuthService({
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
      redirectUri: 'http://localhost:3000/callback',
      scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social', 'r_organization_social']
    });
    
    mutualConnectionFetcher = new MutualConnectionFetcher(oauthService);
    
    vi.clearAllMocks();
  });

  describe('GraphConstructor.addMutualConnectionsToGraph', () => {
    it('should create Person nodes for mutual connections', async () => {
      const mockMutuals: MockMutualConnection[] = [
        {
          id: 'linkedin_123',
          name: 'John Doe',
          headline: 'Software Engineer at Tech Corp',
          profileUrl: 'https://linkedin.com/in/johndoe',
          mutualCount: 2,
          viaFourBridgeMembers: ['Chris', 'Jon']
        }
      ];

      // Mock FourBridge member node
      const mockFourBridgeNode = {
        identity: { toString: () => 'chris_node_id' },
        properties: { name: 'Chris', source: 'FourBridge' }
      };

      vi.mocked(mockNeo4j.findNodeByProperty).mockResolvedValue(mockFourBridgeNode as any);
      vi.mocked(mockNeo4j.createOrUpdateNode).mockResolvedValue({
        identity: { toString: () => 'mutual_node_id' }
      } as any);

      await graphConstructor.addMutualConnectionsToGraph(
        'https://linkedin.com/in/target',
        mockMutuals,
        { debug: true }
      );

      // Verify mutual connection node was created
      expect(mockNeo4j.createOrUpdateNode).toHaveBeenCalledWith({
        labels: ['Person'],
        properties: expect.objectContaining({
          id: 'linkedin_linkedin_123',
          name: 'John Doe',
          headline: 'Software Engineer at Tech Corp',
          linkedinUrl: 'https://linkedin.com/in/johndoe',
          source: 'LinkedIn',
          type: 'Person'
        })
      });
    });

    it('should create CONNECTED_VIA_MUTUAL relationships', async () => {
      const mockMutuals: MockMutualConnection[] = [
        {
          id: 'linkedin_123',
          name: 'John Doe',
          mutualCount: 1,
          viaFourBridgeMembers: ['Chris']
        }
      ];

      const mockFourBridgeNode = {
        identity: { toString: () => 'chris_node_id' },
        properties: { name: 'Chris', source: 'FourBridge' }
      };

      const mockMutualNode = {
        identity: { toString: () => 'mutual_node_id' }
      };

      vi.mocked(mockNeo4j.findNodeByProperty).mockResolvedValue(mockFourBridgeNode as any);
      vi.mocked(mockNeo4j.createOrUpdateNode).mockResolvedValue(mockMutualNode as any);

      await graphConstructor.addMutualConnectionsToGraph(
        'https://linkedin.com/in/target',
        mockMutuals,
        { debug: true }
      );

      // Verify CONNECTED_VIA_MUTUAL relationship was created
      expect(mockNeo4j.createOrUpdateRelationship).toHaveBeenCalledWith({
        fromNode: 'chris_node_id',
        toNode: 'mutual_node_id',
        type: 'CONNECTED_VIA_MUTUAL',
        properties: expect.objectContaining({
          source: 'LinkedIn',
          type: 'mutual_connection',
          via: 'Chris',
          weight: 0.8,
          mutualCount: 1
        })
      });
    });

    it('should handle multiple FourBridge members with same mutual', async () => {
      const mockMutuals: MockMutualConnection[] = [
        {
          id: 'linkedin_123',
          name: 'John Doe',
          mutualCount: 2,
          viaFourBridgeMembers: ['Chris', 'Jon']
        }
      ];

      const mockChrisNode = {
        identity: { toString: () => 'chris_node_id' },
        properties: { name: 'Chris', source: 'FourBridge' }
      };

      const mockJonNode = {
        identity: { toString: () => 'jon_node_id' },
        properties: { name: 'Jon', source: 'FourBridge' }
      };

      const mockMutualNode = {
        identity: { toString: () => 'mutual_node_id' }
      };

      vi.mocked(mockNeo4j.findNodeByProperty)
        .mockResolvedValueOnce(mockChrisNode as any)
        .mockResolvedValueOnce(mockJonNode as any);
      vi.mocked(mockNeo4j.createOrUpdateNode).mockResolvedValue(mockMutualNode as any);

      await graphConstructor.addMutualConnectionsToGraph(
        'https://linkedin.com/in/target',
        mockMutuals,
        { debug: true }
      );

      // Verify relationships were created for both FourBridge members
      expect(mockNeo4j.createOrUpdateRelationship).toHaveBeenCalledWith({
        fromNode: 'chris_node_id',
        toNode: 'mutual_node_id',
        type: 'CONNECTED_VIA_MUTUAL',
        properties: expect.objectContaining({ via: 'Chris' })
      });

      expect(mockNeo4j.createOrUpdateRelationship).toHaveBeenCalledWith({
        fromNode: 'jon_node_id',
        toNode: 'mutual_node_id',
        type: 'CONNECTED_VIA_MUTUAL',
        properties: expect.objectContaining({ via: 'Jon' })
      });
    });

    it('should skip FourBridge members not found in graph', async () => {
      const mockMutuals: MockMutualConnection[] = [
        {
          id: 'linkedin_123',
          name: 'John Doe',
          mutualCount: 1,
          viaFourBridgeMembers: ['UnknownMember']
        }
      ];

      const mockMutualNode = {
        identity: { toString: () => 'mutual_node_id' }
      };

      vi.mocked(mockNeo4j.findNodeByProperty).mockResolvedValue(null);
      vi.mocked(mockNeo4j.createOrUpdateNode).mockResolvedValue(mockMutualNode as any);

      await graphConstructor.addMutualConnectionsToGraph(
        'https://linkedin.com/in/target',
        mockMutuals,
        { debug: true }
      );

      // Verify no relationship was created for unknown member
      expect(mockNeo4j.createOrUpdateRelationship).not.toHaveBeenCalled();
    });
  });

  describe('PathFinder scoring with mutual connections', () => {
    it('should boost scores for paths with CONNECTED_VIA_MUTUAL relationships', async () => {
      const mockResult = {
        records: [{
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
                          name: 'Chris',
                          source: 'FourBridge',
                          confidence: 0.9
                        }
                      },
                      relationship: {
                        type: 'CONNECTED_VIA_MUTUAL',
                        properties: { 
                          strength: 0.8,
                          type: 'mutual_connection',
                          weight: 0.8
                        }
                      },
                      end: {
                        identity: { toString: () => '2' },
                        labels: ['Person'],
                        properties: {
                          name: 'John Doe',
                          source: 'LinkedIn',
                          confidence: 0.85
                        }
                      }
                    }
                  ]
                };
              case 'connections':
                return [
                  {
                    type: 'CONNECTED_VIA_MUTUAL',
                    properties: { 
                      strength: 0.8,
                      type: 'mutual_connection',
                      weight: 0.8
                    },
                    direction: 'OUT'
                  }
                ];
              case 'nodes':
                return [
                  {
                    id: '1',
                    type: 'Person',
                    name: 'Chris',
                    source: 'FourBridge',
                    confidence: 0.9,
                    isFourBridge: true
                  },
                  {
                    id: '2',
                    type: 'Person',
                    name: 'John Doe',
                    source: 'LinkedIn',
                    confidence: 0.85,
                    isFourBridge: false,
                    properties: { type: 'mutual_connection' }
                  }
                ];
              case 'pathLength':
                return 1;
              default:
                return null;
            }
          }
        }]
      };

      mockSession.run.mockResolvedValue(mockResult);

      const paths = await pathFinder.findPaths('2');

      expect(paths).toHaveLength(1);
      const path = paths[0];
      
      // Score should be boosted due to mutual connection
      expect(path.score).toBeGreaterThan(0.5);
      expect(path.metadata.connectionTypes).toContain('CONNECTED_VIA_MUTUAL');
    });

    it('should handle multiple mutual connections and rank by strength', async () => {
      const mockResult = {
        records: [
          // Path with single mutual connection
          {
            get: (key: string) => {
              switch (key) {
                case 'path':
                  return {
                    segments: [{
                      start: { identity: { toString: () => '1' }, labels: ['Person'], properties: { name: 'Chris', source: 'FourBridge' } },
                      relationship: { type: 'CONNECTED_VIA_MUTUAL', properties: { strength: 0.8, weight: 0.8 } },
                      end: { identity: { toString: () => '2' }, labels: ['Person'], properties: { name: 'John Doe', source: 'LinkedIn' } }
                    }]
                  };
                case 'connections':
                  return [{ type: 'CONNECTED_VIA_MUTUAL', properties: { strength: 0.8, weight: 0.8 }, direction: 'OUT' }];
                case 'nodes':
                  return [
                    { id: '1', type: 'Person', name: 'Chris', source: 'FourBridge', isFourBridge: true },
                    { id: '2', type: 'Person', name: 'John Doe', source: 'LinkedIn', isFourBridge: false, properties: { type: 'mutual_connection' } }
                  ];
                case 'pathLength':
                  return 1;
                default:
                  return null;
              }
            }
          },
          // Path with multiple mutual connections (should score higher)
          {
            get: (key: string) => {
              switch (key) {
                case 'path':
                  return {
                    segments: [
                      {
                        start: { identity: { toString: () => '1' }, labels: ['Person'], properties: { name: 'Chris', source: 'FourBridge' } },
                        relationship: { type: 'CONNECTED_VIA_MUTUAL', properties: { strength: 0.9, weight: 0.8 } },
                        end: { identity: { toString: () => '3' }, labels: ['Person'], properties: { name: 'Jane Smith', source: 'LinkedIn' } }
                      },
                      {
                        start: { identity: { toString: () => '3' }, labels: ['Person'], properties: { name: 'Jane Smith', source: 'LinkedIn' } },
                        relationship: { type: 'CONNECTED_VIA_MUTUAL', properties: { strength: 0.9, weight: 0.8 } },
                        end: { identity: { toString: () => '2' }, labels: ['Person'], properties: { name: 'John Doe', source: 'LinkedIn' } }
                      }
                    ]
                  };
                case 'connections':
                  return [
                    { type: 'CONNECTED_VIA_MUTUAL', properties: { strength: 0.9, weight: 0.8 }, direction: 'OUT' },
                    { type: 'CONNECTED_VIA_MUTUAL', properties: { strength: 0.9, weight: 0.8 }, direction: 'OUT' }
                  ];
                case 'nodes':
                  return [
                    { id: '1', type: 'Person', name: 'Chris', source: 'FourBridge', isFourBridge: true },
                    { id: '3', type: 'Person', name: 'Jane Smith', source: 'LinkedIn', isFourBridge: false, properties: { type: 'mutual_connection' } },
                    { id: '2', type: 'Person', name: 'John Doe', source: 'LinkedIn', isFourBridge: false, properties: { type: 'mutual_connection' } }
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

      const paths = await pathFinder.findPaths('2');

      expect(paths).toHaveLength(2);
      
      // Paths should be sorted by score (highest first)
      expect(paths[0].score).toBeGreaterThanOrEqual(paths[1].score);
      
      // Both paths should have mutual connections
      expect(paths[0].metadata.connectionTypes).toContain('CONNECTED_VIA_MUTUAL');
      expect(paths[1].metadata.connectionTypes).toContain('CONNECTED_VIA_MUTUAL');
    });
  });

  describe('MutualConnectionFetcher', () => {
    it('should extract LinkedIn user ID from profile URL', async () => {
      const profileUrl = 'https://linkedin.com/in/johndoe';
      const userId = await mutualConnectionFetcher.getLinkedInUserId(profileUrl, true);
      
      expect(userId).toBe('johndoe');
    });

    it('should handle invalid LinkedIn URLs', async () => {
      const invalidUrl = 'https://invalid-url.com';
      const userId = await mutualConnectionFetcher.getLinkedInUserId(invalidUrl, true);
      
      expect(userId).toBeNull();
    });

    it('should cache connections and respect TTL', async () => {
      const linkedinUserId = 'test_user';
      const accessToken = 'test_token';
      
      // Mock the getConnections method
      vi.spyOn(mutualConnectionFetcher as any, 'getConnections').mockResolvedValue([
        { id: '1', firstName: 'John', lastName: 'Doe' }
      ]);

      // First call should fetch from API
      const connections1 = await mutualConnectionFetcher.getCachedConnections(
        linkedinUserId, 
        accessToken, 
        { useCache: true, cacheTTL: 1 }
      );

      // Second call should use cache
      const connections2 = await mutualConnectionFetcher.getCachedConnections(
        linkedinUserId, 
        accessToken, 
        { useCache: true, cacheTTL: 1 }
      );

      expect(connections1).toEqual(connections2);
      expect(mutualConnectionFetcher['getConnections']).toHaveBeenCalledTimes(1);
    });

    it('should provide cache statistics', () => {
      const stats = mutualConnectionFetcher.getCacheStats();
      
      expect(stats).toHaveProperty('totalCached');
      expect(stats).toHaveProperty('expiredEntries');
      expect(typeof stats.totalCached).toBe('number');
      expect(typeof stats.expiredEntries).toBe('number');
    });
  });
}); 