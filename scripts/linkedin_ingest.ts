import dotenv from 'dotenv';
import { importFromLinkedIn } from '../ingestion/linkedin_scraper';
import { GraphConstructor } from '../graph/construct_graph';

// Load environment variables
dotenv.config();

/**
 * Main function to run the LinkedIn ingestion process
 */
async function main() {
  console.log('\n🔄 Starting LinkedIn ingestion process...\n');

  try {
    // Get input from command line
    const input = process.argv[2];
    if (!input) {
      throw new Error('Please provide a person name or LinkedIn profile URL as a command-line argument');
    }

    // Determine if input is a URL or name
    const isUrl = input.includes('linkedin.com/in/');
    console.log(`📊 Input type: ${isUrl ? 'LinkedIn URL' : 'Person name'}`);
    console.log(`🔍 Query: ${input}`);

    // Import from LinkedIn
    const result = await importFromLinkedIn({
      personName: isUrl ? undefined : input,
      linkedinUrl: isUrl ? input : undefined,
      debug: true
    });

    // Log results
    console.log('\n✅ LinkedIn ingestion complete. Summary:');
    console.log(`- Total records: ${result.summary.totalRecords}`);
    console.log(`- Successfully imported: ${result.summary.successfulImports}`);
    console.log(`- Failed imports: ${result.summary.failedImports}`);

    // Display sample contacts
    if (result.contacts.length > 0) {
      console.log('\n📦 Sample imported contacts:');
      // Show up to 3 sample contacts
      result.contacts.slice(0, 3).forEach((contact, index) => {
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

    // Push to Neo4j if credentials are present
    const neo4jUri = process.env.NEO4J_URI;
    const neo4jUsername = process.env.NEO4J_USERNAME;
    const neo4jPassword = process.env.NEO4J_PASSWORD;

    if (neo4jUri && neo4jUsername && neo4jPassword) {
      console.log('\n🔄 Pushing contacts to Neo4j...');
      
      const graphConstructor = new GraphConstructor();

      try {
        await graphConstructor.constructGraph(result.contacts, []);
        console.log('✅ Successfully pushed contacts to Neo4j');
      } catch (error) {
        console.error('❌ Error pushing to Neo4j:', error instanceof Error ? error.message : String(error));
      }
    } else {
      console.log('\nℹ️ Skipping Neo4j push (credentials not found)');
      console.log('   Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD to enable Neo4j integration');
    }

    // Exit successfully
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error during LinkedIn ingestion:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('\n❌ Unhandled error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 