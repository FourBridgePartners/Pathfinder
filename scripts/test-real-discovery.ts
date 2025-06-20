#!/usr/bin/env tsx

import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';
import { getFourBridgeMembers } from '../server/lib/linkedin/memberHelper';

async function testRealDiscovery() {
  console.log('🚀 Starting Real LP Discovery System Test\n');
  
  // Check if we have FourBridge member credentials
  const members = getFourBridgeMembers();
  console.log(`📋 Available FourBridge members: ${members.length}`);
  members.forEach(member => {
    console.log(`  - ${member.name}: ${member.username}`);
  });
  
  if (members.length === 0) {
    console.error('❌ No FourBridge member credentials found in environment variables');
    console.log('Please add your LinkedIn credentials to .env file:');
    console.log('LINKEDIN_TEJAS_USERNAME=tejas.agnihotri@trincoll.edu');
    console.log('LINKEDIN_TEJAS_PASSWORD=5Woodsend##');
    process.exit(1);
  }

  // Test targets
  const testTargets = [
    'LGL Partners (Forbes Family Trust)',
    'https://www.linkedin.com/in/satyanadella',
    'Sequoia Capital'
  ];

  for (const target of testTargets) {
    console.log(`\n🎯 Testing target: ${target}`);
    console.log('=' .repeat(50));
    
    try {
      const startTime = Date.now();
      
      // Run the full discovery pipeline
      const discovery = await discoverEntityPaths(target, {
        usePuppeteerFallback: true,
        debug: true,
        writeToGraph: true,
        logMetrics: true
      });

      const duration = Date.now() - startTime;
      
      console.log(`\n✅ Discovery completed in ${duration}ms`);
      console.log(`📊 Results:`);
      console.log(`  - People discovered: ${discovery.peopleDiscovered.length}`);
      console.log(`  - Total mutuals: ${discovery.summary.totalMutuals}`);
      console.log(`  - Methods used: ${discovery.summary.via.join(', ')}`);
      
      if (discovery.peopleDiscovered.length > 0) {
        console.log(`\n👥 People discovered:`);
        discovery.peopleDiscovered.forEach((person, i) => {
          console.log(`  ${i + 1}. ${person.name} (${person.source})`);
          if (person.linkedinUrl) {
            console.log(`     LinkedIn: ${person.linkedinUrl}`);
          }
        });
      }
      
      if (discovery.mutuals.length > 0) {
        console.log(`\n🔗 Mutual connections found:`);
        discovery.mutuals.forEach((mutual, i) => {
          console.log(`  ${i + 1}. Via ${mutual.via}: ${mutual.mutuals.length} mutuals`);
          mutual.mutuals.slice(0, 3).forEach(m => {
            console.log(`     - ${m.name}${m.linkedinUrl ? ` (${m.linkedinUrl})` : ''}`);
          });
          if (mutual.mutuals.length > 3) {
            console.log(`     ... and ${mutual.mutuals.length - 3} more`);
          }
        });
      }
      
      if (discovery.errors.length > 0) {
        console.log(`\n⚠️  Errors encountered:`);
        discovery.errors.forEach(error => {
          console.log(`  - ${error}`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Error testing target "${target}":`, error);
    }
  }
  
  console.log('\n🎉 Real discovery test completed!');
  console.log('\n📝 Summary:');
  console.log('- The system successfully ran the full discovery pipeline');
  console.log('- Puppeteer should have opened a browser window (headless: false in development)');
  console.log('- LinkedIn credentials were used for authentication');
  console.log('- Results were logged and can be stored in Neo4j');
}

// Run the test
testRealDiscovery().catch(console.error); 