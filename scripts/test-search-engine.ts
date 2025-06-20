import { getHomepageForEntity } from '../server/lib/alias/searchEngine';

async function testSearchEngine() {
  const testCases = [
    'FFT Partners',
    'XYZ Capital',
    'ABC Ventures',
    'Tech Startup Inc',
    'Global Investment Partners',
    'Sequoia Capital',
    'Andreessen Horowitz'
  ];

  console.log('🔍 Testing Brave Search API Integration\n');

  for (const query of testCases) {
    console.log(`\n--- Testing: "${query}" ---`);
    
    try {
      const homepage = await getHomepageForEntity(query);
      
      if (homepage) {
        console.log(`✅ Found homepage: ${homepage}`);
      } else {
        console.log(`❌ No homepage found`);
      }

    } catch (error) {
      console.error(`❌ Search failed:`, error);
    }
  }

  console.log('\n🎉 Search engine test completed');
}

testSearchEngine().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 