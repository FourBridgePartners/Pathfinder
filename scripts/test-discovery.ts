import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';

async function testDiscovery() {
  // Get entity from command line args or use default
  const entity = process.argv[2] || 'LGL Partners';
  
  console.log(`🧪 Testing discovery for: "${entity}"\n`);
  
  try {
    const startTime = Date.now();
    
    const result = await discoverEntityPaths(entity, {
      debug: true,
      writeToGraph: true,
      usePuppeteerFallback: true,
      logMetrics: true
    });

    const duration = Date.now() - startTime;

    console.log('\n--- DISCOVERY RESULTS ---');
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 People found: ${result.peopleDiscovered.length}`);
    console.log(`🔗 Mutual connections: ${result.mutuals.length}`);
    console.log(`📈 Total mutuals: ${result.summary.totalMutuals}`);
    console.log(`🛠️  Methods used: ${result.summary.via.join(', ')}`);
    
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

    if (result.mutuals.length > 0) {
      console.log('\n--- MUTUAL CONNECTIONS ---');
      result.mutuals.forEach(m => {
        console.log(`🤝 ${m.person.name} has ${m.mutuals.length} mutuals via ${m.via}`);
      });
    }

    console.log('\n--- FULL RESULT ---');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Discovery failed:', error);
    process.exit(1);
  }
}

// Run the test
testDiscovery(); 