import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';

async function testEntityDiscovery() {
  const testCases = [
    'LGL Partners',
    'FFT Partners', 
    'XYZ Capital',
    'ABC Ventures'
  ];

  console.log('🧪 Testing End-to-End Entity Discovery Pipeline\n');

  for (const targetEntity of testCases) {
    console.log(`\n--- Testing: "${targetEntity}" ---`);
    
    try {
      const startTime = Date.now();
      
      const result = await discoverEntityPaths(targetEntity, {
        debug: true,
        writeToGraph: true,
        usePuppeteerFallback: true,
        logMetrics: true
      });

      const duration = Date.now() - startTime;

      console.log(`✅ Discovery completed for "${targetEntity}"`);
      console.log(`   - Duration: ${duration}ms`);
      console.log(`   - People found: ${result.peopleDiscovered.length}`);
      console.log(`   - Mutuals found: ${result.mutuals.length}`);
      console.log(`   - Total mutual connections: ${result.summary.totalMutuals}`);
      console.log(`   - Via: ${result.summary.via.join(', ')}`);
      console.log(`   - Errors: ${result.errors.length}`);
      
      if (result.errors.length > 0) {
        console.log(`   - Error details:`);
        result.errors.forEach(e => console.log(`     * ${e}`));
      }

      if (result.peopleDiscovered.length > 0) {
        console.log(`   - People discovered:`);
        result.peopleDiscovered.forEach(p => {
          console.log(`     * ${p.name}${p.title ? ` (${p.title})` : ''}${p.company ? ` at ${p.company}` : ''}`);
          if (p.linkedinUrl) console.log(`       LinkedIn: ${p.linkedinUrl}`);
        });
      }

      if (result.mutuals.length > 0) {
        console.log(`   - Mutual connections:`);
        result.mutuals.forEach(m => {
          console.log(`     * ${m.person.name} has ${m.mutuals.length} mutuals via ${m.via}`);
        });
      }

      // Log metrics if available
      if (result.metrics) {
        console.log(`   - Metrics:`, result.metrics);
      }

    } catch (error) {
      console.error(`❌ Discovery failed for "${targetEntity}":`, error);
    }
  }

  console.log('\n🎉 End-to-end discovery test completed');
}

// Allow running specific entity from command line
const args = process.argv.slice(2);
if (args.length > 0) {
  const targetEntity = args[0];
  console.log(`🧪 Testing specific entity: "${targetEntity}"\n`);
  
  discoverEntityPaths(targetEntity, {
    debug: true,
    writeToGraph: true,
    usePuppeteerFallback: true,
    logMetrics: true
  }).then(result => {
    console.log('\n--- RESULT ---');
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
} else {
  testEntityDiscovery().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
} 