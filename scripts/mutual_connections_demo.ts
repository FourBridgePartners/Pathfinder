import dotenv from 'dotenv';
import { LinkedInOAuthService } from '../server/api/linkedin/oauth';
import { MutualConnectionFetcher } from '../server/lib/linkedin/getMutualConnections';
import { GraphConstructor } from '../graph/construct_graph';
import { PathFinder } from '../graph/queryPaths';

// Load environment variables
dotenv.config();

/**
 * Demo script showing how to use the mutual connections feature
 */
async function mutualConnectionsDemo() {
  console.log('🔗 LinkedIn Mutual Connections Demo\n');

  // Initialize graph constructor outside try block for cleanup
  let graphConstructor: GraphConstructor | null = null;

  try {
    // 1. Initialize OAuth service
    console.log('1. Initializing LinkedIn OAuth service...');
    const oauthService = new LinkedInOAuthService({
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/callback',
      scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social', 'r_organization_social']
    });

    // 2. Initialize mutual connection fetcher
    console.log('2. Initializing mutual connection fetcher...');
    const mutualFetcher = new MutualConnectionFetcher(oauthService);

    // 3. Initialize graph constructor
    console.log('3. Initializing graph constructor...');
    graphConstructor = new GraphConstructor();

    // 4. Initialize path finder
    console.log('4. Initializing path finder...');
    const pathFinder = new PathFinder(graphConstructor.neo4j);

    // Example target LinkedIn profile
    const targetProfileUrl = 'https://linkedin.com/in/example-target';
    
    console.log(`\n🎯 Target profile: ${targetProfileUrl}`);

    // 5. Find mutual connections (this would require valid OAuth tokens)
    console.log('\n5. Finding mutual connections...');
    console.log('   Note: This requires valid LinkedIn OAuth tokens for FourBridge team members');
    
    // Mock mutual connections for demo purposes
    const mockMutualConnections = [
      {
        id: 'linkedin_123',
        name: 'John Doe',
        headline: 'Software Engineer at Tech Corp',
        profileUrl: 'https://linkedin.com/in/johndoe',
        mutualCount: 2,
        viaFourBridgeMembers: ['Chris', 'Jon']
      },
      {
        id: 'linkedin_456',
        name: 'Jane Smith',
        headline: 'Product Manager at Startup Inc',
        profileUrl: 'https://linkedin.com/in/janesmith',
        mutualCount: 1,
        viaFourBridgeMembers: ['Chris']
      },
      {
        id: 'linkedin_789',
        name: 'Bob Wilson',
        headline: 'VC Partner at Capital Fund',
        profileUrl: 'https://linkedin.com/in/bobwilson',
        mutualCount: 3,
        viaFourBridgeMembers: ['Chris', 'Jon', 'Ted']
      }
    ];

    console.log(`   Found ${mockMutualConnections.length} mutual connections:`);
    mockMutualConnections.forEach((mutual, index) => {
      console.log(`   ${index + 1}. ${mutual.name} (${mutual.headline})`);
      console.log(`      Via: ${mutual.viaFourBridgeMembers.join(', ')}`);
      console.log(`      Mutual count: ${mutual.mutualCount}`);
    });

    // 6. Add mutual connections to graph
    console.log('\n6. Adding mutual connections to graph...');
    await graphConstructor.addMutualConnectionsToGraph(
      targetProfileUrl,
      mockMutualConnections,
      { debug: true }
    );

    // 7. Find paths to target (this would require the target to exist in the graph)
    console.log('\n7. Finding paths to target...');
    console.log('   Note: This requires the target to exist in the Neo4j graph');
    
    // Mock path finding results
    const mockPaths = [
      {
        path: [
          { id: 'chris_node', type: 'Person', name: 'Chris', source: 'FourBridge' },
          { type: 'CONNECTED_VIA_MUTUAL', strength: 0.8 },
          { id: 'bob_wilson_node', type: 'Person', name: 'Bob Wilson', source: 'LinkedIn' },
          { type: 'CONNECTED_VIA_MUTUAL', strength: 0.8 },
          { id: 'target_node', type: 'Person', name: 'Target Person', source: 'LinkedIn' }
        ] as any[],
        score: 0.85,
        normalizedScore: 1.0,
        metadata: {
          pathLength: 2,
          connectionTypes: ['CONNECTED_VIA_MUTUAL'],
          mutualTies: ['mutual_Bob Wilson']
        }
      },
      {
        path: [
          { id: 'jon_node', type: 'Person', name: 'Jon', source: 'FourBridge' },
          { type: 'CONNECTED_VIA_MUTUAL', strength: 0.8 },
          { id: 'john_doe_node', type: 'Person', name: 'John Doe', source: 'LinkedIn' },
          { type: 'CONNECTED_VIA_MUTUAL', strength: 0.8 },
          { id: 'target_node', type: 'Person', name: 'Target Person', source: 'LinkedIn' }
        ] as any[],
        score: 0.82,
        normalizedScore: 0.96,
        metadata: {
          pathLength: 2,
          connectionTypes: ['CONNECTED_VIA_MUTUAL'],
          mutualTies: ['mutual_John Doe']
        }
      }
    ];

    console.log(`   Found ${mockPaths.length} paths to target:`);
    mockPaths.forEach((path, index) => {
      console.log(`   ${index + 1}. Score: ${path.score.toFixed(2)} (${path.normalizedScore.toFixed(2)})`);
      console.log(`      Path: ${path.path.map(node => 'type' in node ? node.type : (node as any).name).join(' → ')}`);
      console.log(`      Length: ${path.metadata.pathLength} hops`);
      console.log(`      Connection types: ${path.metadata.connectionTypes.join(', ')}`);
    });

    // 8. Show cache statistics
    console.log('\n8. Cache statistics:');
    const cacheStats = mutualFetcher.getCacheStats();
    console.log(`   Total cached: ${cacheStats.totalCached}`);
    console.log(`   Expired entries: ${cacheStats.expiredEntries}`);

    console.log('\n✅ Demo completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set up LinkedIn OAuth credentials in environment variables');
    console.log('   2. Implement Supabase token storage in LinkedInOAuthService');
    console.log('   3. Add FourBridge team member LinkedIn IDs to MutualConnectionFetcher');
    console.log('   4. Integrate with your existing ingestion pipeline');
    console.log('   5. Add Fastify routes for OAuth flow');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    try {
      if (graphConstructor) {
        await graphConstructor.close();
      }
    } catch (error) {
      console.error('Error closing graph constructor:', error);
    }
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  mutualConnectionsDemo().catch(console.error);
}

export { mutualConnectionsDemo }; 