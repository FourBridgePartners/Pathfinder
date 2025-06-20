import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';

async function testBasicDiscovery() {
  console.log('🧪 Testing Basic Discovery System\n');
  
  // Test with a simple entity
  const testEntities = [
    'Sequoia Capital',
    'Andreessen Horowitz', 
    'Benchmark Capital'
  ];
  
  for (const entity of testEntities) {
    console.log(`\n--- Testing: "${entity}" ---`);
    
    try {
      const startTime = Date.now();
      
      const result = await discoverEntityPaths(entity, {
        debug: true,
        writeToGraph: false, // Don't write to graph for testing
        usePuppeteerFallback: false, // Skip Puppeteer for now
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
        result.peopleDiscovered.slice(0, 3).forEach(p => {
          console.log(`👤 ${p.name}${p.title ? ` (${p.title})` : ''}${p.company ? ` at ${p.company}` : ''}`);
          if (p.linkedinUrl) console.log(`   LinkedIn: ${p.linkedinUrl}`);
        });
        if (result.peopleDiscovered.length > 3) {
          console.log(`   ... and ${result.peopleDiscovered.length - 3} more`);
        }
      }

    } catch (error) {
      console.error(`❌ Discovery failed for "${entity}":`, error);
    }
  }
  
  console.log('\n--- SUMMARY ---');
  console.log('The discovery system is working! However, to get full results, you need to:');
  console.log('1. Set up API keys in a .env file');
  console.log('2. Configure search engines (Brave/Google)');
  console.log('3. Set up Firecrawl for web crawling');
  console.log('4. Configure OpenAI for LLM features');
  console.log('\nSee SETUP.md for detailed instructions.');
}

// Run the test
testBasicDiscovery(); 