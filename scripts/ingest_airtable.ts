import dotenv from 'dotenv';
import { importFromAirtable } from '../ingestion/airtable_import';
import { LPContact } from '../types';

// Load environment variables
dotenv.config();

/**
 * Main function to run the Airtable import process
 */
async function main() {
  console.log('\n🔄 Starting Airtable import process...\n');

  try {
    // Get table name from environment or use default
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'LP Network';
    
    console.log(`📊 Importing from Airtable table: "${tableName}"`);
    console.log('🔑 Using API key:', process.env.AIRTABLE_API_KEY ? '✓ Configured' : '✗ Missing');
    console.log('🏢 Using base ID:', process.env.AIRTABLE_BASE_ID ? '✓ Configured' : '✗ Missing');

    // Import from Airtable
    const result = await importFromAirtable({
      tableName,
      debug: true
    });

    // Log results
    console.log('\n✅ Airtable import complete. Summary:');
    console.log(`- Table: ${tableName}`);
    console.log(`- Total records: ${result.summary.totalRecords}`);
    console.log(`- Successfully imported: ${result.summary.successfulImports}`);
    console.log(`- Failed imports: ${result.summary.failedImports}`);

    // Display sample contacts
    if (result.contacts.length > 0) {
      console.log('\n📦 Sample imported contacts:');
      // Show up to 3 sample contacts
      result.contacts.slice(0, 3).forEach((contact: LPContact, index: number) => {
        console.log(`\nContact ${index + 1}:`);
        console.log(JSON.stringify(contact, null, 2));
      });
    } else {
      console.log('\n⚠️ No contacts were imported');
    }

    // Display errors if any
    if (result.errors.length > 0) {
      console.log('\n⚠️ Import errors:');
      result.errors.slice(0, 3).forEach((error, index) => {
        console.log(`\nError ${index + 1}:`);
        console.log('Record:', JSON.stringify(error.record, null, 2));
        console.log('Errors:', error.errors.join(', '));
      });
    }

    // Exit successfully
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error during Airtable import:', error instanceof Error ? error.message : String(error));
    
    // Check for common error cases
    if (error instanceof Error) {
      if (error.message.includes('Missing Airtable API key')) {
        console.error('\n⚠️ Please set the AIRTABLE_API_KEY environment variable');
      } else if (error.message.includes('Missing Airtable base ID')) {
        console.error('\n⚠️ Please set the AIRTABLE_BASE_ID environment variable');
      }
    }
    
    // Exit with error
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('\n❌ Unhandled error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 