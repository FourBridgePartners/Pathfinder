#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { fetchFromFirecrawl } from '../ingestion/firecrawl_webfetch';

// Load environment variables
dotenv.config();

async function testFFTDiscovery() {
  console.log('🔍 Testing FFT Partners Discovery\n');
  
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
    // Test with multiple search terms for FFT Partners
    const searchTerms = [
      'FFT Partners',
      'FFT Wealth Management',
      'Forbes Family Trust',
      'FFT team',
      'FFT Wealth Management team',
      'Forbes Family Trust Wealth Management'
    ];
    
    for (const searchTerm of searchTerms) {
      console.log(`\n🎯 Testing discovery for: "${searchTerm}"`);
      
      try {
        const result = await fetchFromFirecrawl({
          entityName: searchTerm,
          apiKey: apiKey,
          debug: true,
          maxRetries: 3,
          maxConcurrent: 2
        });
        
        // Display results
        console.log(`\n📊 Discovery Results for "${searchTerm}":`);
        console.log(`- Entity queried: ${result.summary.entityQueried}`);
        console.log(`- Total URLs fetched: ${result.summary.totalUrlsFetched}`);
        console.log(`- Successfully normalized: ${result.summary.successfulNormalizations}`);
        console.log(`- Errors: ${result.errors.length}`);
        
        // Display discovered contacts
        if (result.contacts.length > 0) {
          console.log(`\n👥 Discovered Team Members for "${searchTerm}":`);
          result.contacts.forEach((contact, index) => {
            console.log(`\n${index + 1}. ${contact.name}`);
            console.log(`   Firm: ${contact.firm}`);
            console.log(`   Role: ${contact.role || 'N/A'}`);
            console.log(`   LinkedIn: ${contact.linkedin || 'N/A'}`);
            console.log(`   Email: ${contact.email || 'N/A'}`);
            console.log(`   Location: ${contact.location || 'N/A'}`);
          });
          
          // If we found contacts, we can stop testing other terms
          console.log(`\n✅ Successfully found team members with search term: "${searchTerm}"`);
          break;
        } else {
          console.log(`\n⚠️ No team members discovered for "${searchTerm}"`);
        }
        
        // Display errors if any
        if (result.errors.length > 0) {
          console.log(`\n❌ Errors for "${searchTerm}":`);
          result.errors.slice(0, 3).forEach((error, index) => {
            console.log(`\n${index + 1}. URL: ${error.url}`);
            console.log(`   Reason: ${error.reason}`);
          });
        }
        
      } catch (error) {
        console.log(`\n❌ Error testing "${searchTerm}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log('\n✅ FFT Partners discovery test completed');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the test
testFFTDiscovery().catch(error => {
  console.error('\n❌ Unhandled error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 