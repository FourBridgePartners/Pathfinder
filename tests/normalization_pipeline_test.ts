import { testWithSampleData } from '../ingestion/airtable_import';
import { testNormalization } from '../normalization/normalizeRow';

/**
 * Test the entire normalization pipeline
 */
async function testPipeline() {
  console.log('=== TESTING NORMALIZATION ROW MODULE ===');
  testNormalization();
  
  console.log('\n=== TESTING AIRTABLE IMPORT WITH SAMPLE DATA ===');
  testWithSampleData();
}

// Run the test
testPipeline().catch(console.error); 