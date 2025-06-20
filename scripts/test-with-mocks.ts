import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';

// Mock the search engine to simulate successful API responses
const originalSearchEngine = require('../server/lib/alias/searchEngine');
const mockSearchEngine = {
  ...originalSearchEngine,
  async getHomepageForEntity(entity: string) {
    console.log(`[MockSearchEngine] Simulating successful search for: "${entity}"`);
    
    // Return mock homepage URLs for known firms
    const mockHomepages: Record<string, string> = {
      'Sequoia Capital': 'https://www.sequoiacap.com',
      'Andreessen Horowitz': 'https://a16z.com',
      'Benchmark Capital': 'https://benchmark.com',
      'Kleiner Perkins': 'https://www.kleinerperkins.com',
      'Greylock Partners': 'https://greylock.com'
    };
    
    const homepage = mockHomepages[entity];
    if (homepage) {
      console.log(`[MockSearchEngine] Found homepage: ${homepage}`);
      return homepage;
    }
    
    console.log(`[MockSearchEngine] No mock homepage for: "${entity}"`);
    return null;
  }
};

// Mock the team page crawler
const originalCrawlTeamPage = require('../server/lib/discovery/crawlTeamPage');
const mockCrawlTeamPage = {
  ...originalCrawlTeamPage,
  async crawlTeamPage(url: string, options: any) {
    console.log(`[MockCrawler] Simulating team page crawl for: ${url}`);
    
    // Return mock team members
    const mockTeamMembers = [
      {
        name: 'John Smith',
        title: 'Managing Partner',
        linkedinUrl: 'https://www.linkedin.com/in/johnsmith/',
        company: 'Mock Company'
      },
      {
        name: 'Sarah Johnson',
        title: 'Partner',
        linkedinUrl: 'https://www.linkedin.com/in/sarahjohnson/',
        company: 'Mock Company'
      },
      {
        name: 'Mike Chen',
        title: 'Principal',
        linkedinUrl: 'https://www.linkedin.com/in/mikechen/',
        company: 'Mock Company'
      }
    ];
    
    console.log(`[MockCrawler] Found ${mockTeamMembers.length} team members`);
    return mockTeamMembers;
  }
};

async function testWithMocks() {
  console.log('🧪 Testing Discovery System with Mock APIs\n');
  
  // Temporarily replace the real modules with mocks
  const originalModules = {
    searchEngine: require.cache[require.resolve('../server/lib/alias/searchEngine')],
    crawlTeamPage: require.cache[require.resolve('../server/lib/discovery/crawlTeamPage')]
  };
  
  // Mock the modules
  require.cache[require.resolve('../server/lib/alias/searchEngine')] = {
    exports: mockSearchEngine
  } as any;
  
  require.cache[require.resolve('../server/lib/discovery/crawlTeamPage')] = {
    exports: mockCrawlTeamPage
  } as any;
  
  try {
    const testEntities = [
      'Sequoia Capital',
      'Andreessen Horowitz'
    ];
    
    for (const entity of testEntities) {
      console.log(`\n--- Testing: "${entity}" ---`);
      
      try {
        const startTime = Date.now();
        
        const result = await discoverEntityPaths(entity, {
          debug: true,
          writeToGraph: false,
          usePuppeteerFallback: false,
          logMetrics: true
        });

        const duration = Date.now() - startTime;

        console.log(`✅ Completed in ${duration}ms`);
        console.log(`📊 People found: ${result.peopleDiscovered.length}`);
        console.log(`🔗 Mutual connections: ${result.mutuals.length}`);
        console.log(`🛠️  Methods used: ${result.summary.via.join(', ') || 'None'}`);
        
        if (result.errors.length > 0) {
          console.log(`❌ Errors: ${result.errors.length}`);
          result.errors.forEach(e => console.log(`   - ${e}`));
        }

        if (result.peopleDiscovered.length > 0) {
          console.log('\n--- PEOPLE DISCOVERED ---');
          result.peopleDiscovered.forEach(p => {
            console.log(`👤 ${p.name}${p.title ? ` (${p.title})` : ''}${p.company ? ` at ${p.company}` : ''}`);
            if (p.linkedinUrl) console.log(`   LinkedIn: ${p.linkedinUrl}`);
          });
        }

      } catch (error) {
        console.error(`❌ Discovery failed for "${entity}":`, error);
      }
    }
    
  } finally {
    // Restore original modules
    if (originalModules.searchEngine) {
      require.cache[require.resolve('../server/lib/alias/searchEngine')] = originalModules.searchEngine;
    }
    if (originalModules.crawlTeamPage) {
      require.cache[require.resolve('../server/lib/discovery/crawlTeamPage')] = originalModules.crawlTeamPage;
    }
  }
  
  console.log('\n--- SUMMARY ---');
  console.log('This demonstrates what the system can do with proper API keys!');
  console.log('To get real results, set up your .env file with:');
  console.log('- BRAVE_API_KEY (for search)');
  console.log('- FIRECRAWL_API_KEY (for web crawling)');
  console.log('- OPENAI_API_KEY (for LLM features)');
  console.log('- LinkedIn OAuth (for mutual connections)');
}

// Run the test
testWithMocks(); 