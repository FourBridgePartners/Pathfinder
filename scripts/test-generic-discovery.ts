import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';

async function testGenericDiscovery() {
  const testCases = [
    'XYZ Capital',
    'ABC Ventures', 
    'Tech Startup Inc',
    'Global Investment Partners'
  ];

  console.log('🧪 Testing Generic Discovery Pipeline\n');

  for (const targetEntity of testCases) {
    console.log(`\n--- Testing: "${targetEntity}" ---`);
    
    try {
      const results = await discoverEntityPaths(targetEntity, {
        debug: true,
      });

      console.log(`✅ Discovery completed for "${targetEntity}"`);
      console.log(`   - People found: ${results.peopleDiscovered.length}`);
      console.log(`   - Mutuals found: ${results.mutuals.length}`);
      console.log(`   - Via: ${results.summary.via.join(', ')}`);
      
      if (results.errors.length > 0) {
        console.log(`   - Errors: ${results.errors.length}`);
        results.errors.forEach(e => console.log(`     * ${e}`));
      }

    } catch (error) {
      console.error(`❌ Discovery failed for "${targetEntity}":`, error);
    }
  }

  console.log('\n🎉 Generic discovery test completed');
}

testGenericDiscovery().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 