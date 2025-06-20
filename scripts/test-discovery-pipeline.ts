#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { discoverEntityPaths } from '../server/lib/discovery/discoverEntityPaths';

// Load environment variables
dotenv.config();

async function testDiscoveryPipeline() {
  console.log('🔍 Testing Full Discovery Pipeline\n');
  
  // Check if Firecrawl API key is configured
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey || apiKey === 'your_firecrawl_api_key_here') {
    console.error('❌ Firecrawl API key not configured');
    console.log('Please add your Firecrawl API key to the .env file:');
    console.log('FIRECRAWL_API_KEY=your_actual_api_key_here');
    process.exit(1);
  }
  
  console.log('✅ Firecrawl API key found');
  
  try {
    // Test with FFT Partners
    console.log('\n🎯 Testing discoverEntityPaths for: "FFT Partners"');
    
    const startTime = Date.now();
    
    const discovery = await discoverEntityPaths('FFT Partners', {
      usePuppeteerFallback: false, // Disable for now to focus on Firecrawl
      debug: true,
      writeToGraph: false, // Don't write to graph for testing
      logMetrics: true
    });
    
    const duration = Date.now() - startTime;
    
    // Display results
    console.log('\n📊 Discovery Pipeline Results:');
    console.log(`- Input: "FFT Partners"`);
    console.log(`- Duration: ${duration}ms`);
    console.log(`- People discovered: ${discovery.peopleDiscovered.length}`);
    console.log(`- Total mutuals: ${discovery.summary.totalMutuals}`);
    console.log(`- Methods used: ${discovery.summary.via.join(', ')}`);
    console.log(`- Errors: ${discovery.errors.length}`);
    
    // Display discovered people
    if (discovery.peopleDiscovered.length > 0) {
      console.log('\n👥 Discovered People:');
      discovery.peopleDiscovered.forEach((person, index) => {
        console.log(`\n${index + 1}. ${person.name}`);
        console.log(`   Source: ${person.source}`);
        console.log(`   LinkedIn URL: ${person.linkedinUrl || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️ No people discovered');
    }
    
    // Display mutual connections if any
    if (discovery.mutuals.length > 0) {
      console.log('\n🔗 Mutual Connections:');
      discovery.mutuals.forEach((mutual, index) => {
        console.log(`\n${index + 1}. ${mutual.person.name}`);
        console.log(`   Via: ${mutual.via}`);
        console.log(`   Mutual connections: ${mutual.mutuals.length}`);
        
        if (mutual.mutuals.length > 0) {
          console.log('   Mutuals:');
          mutual.mutuals.slice(0, 3).forEach((m, i) => {
            console.log(`     ${i + 1}. ${m.name} (${m.linkedinUrl || 'N/A'})`);
          });
          
          if (mutual.mutuals.length > 3) {
            console.log(`     ... and ${mutual.mutuals.length - 3} more`);
          }
        }
      });
    } else {
      console.log('\n⚠️ No mutual connections found');
    }
    
    // Display errors if any
    if (discovery.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      discovery.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error}`);
      });
    }
    
    // Test with alternative terms
    console.log('\n🔄 Testing alternative search terms...');
    
    const alternativeTerms = [
      'FFT Wealth Management',
      'Forbes Family Trust'
    ];
    
    for (const term of alternativeTerms) {
      console.log(`\n🎯 Testing: "${term}"`);
      
      try {
        const altDiscovery = await discoverEntityPaths(term, {
          usePuppeteerFallback: false,
          debug: false,
          writeToGraph: false,
          logMetrics: false
        });
        
        console.log(`   People found: ${altDiscovery.peopleDiscovered.length}`);
        console.log(`   Mutuals found: ${altDiscovery.summary.totalMutuals}`);
        
        if (altDiscovery.peopleDiscovered.length > 0) {
          console.log(`   Sample person: ${altDiscovery.peopleDiscovered[0].name}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log('\n✅ Discovery pipeline test completed');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the test
testDiscoveryPipeline().catch(error => {
  console.error('\n❌ Unhandled error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 