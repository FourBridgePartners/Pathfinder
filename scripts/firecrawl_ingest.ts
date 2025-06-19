import dotenv from 'dotenv';
import { fetchFromFirecrawl } from '../ingestion/firecrawl_webfetch';
import { GraphConstructor } from '../graph/construct_graph';
import { LPContact } from '../types';

// Load environment variables
dotenv.config();

/**
 * Main function to run the Firecrawl ingestion process
 */
async function main() {
  const entityName = process.argv[2];

  if (!entityName) {
    console.error('❌ Please provide an entity name as a command-line argument.');
    console.error('Example: bun run scripts/firecrawl_ingest.ts "Benchmark Capital"');
    process.exit(1);
  }

  console.log(`\n🔍 Starting Firecrawl ingestion for: ${entityName}\n`);

  try {
    const result = await fetchFromFirecrawl({
      entityName,
      apiKey: process.env.FIRECRAWL_API_KEY || '',
      debug: true,
      useStructuredBlocks: true, // Enable structured block processing
      maxRetries: 3,            // Retry failed requests up to 3 times
      maxConcurrent: 2          // Process 2 URLs at a time
    });

    // Log summary
    console.log('\n✅ Ingestion complete. Summary:');
    console.log(`- Entity queried: ${result.summary.entityQueried}`);
    console.log(`- Total URLs fetched: ${result.summary.totalUrlsFetched}`);
    console.log(`- Successfully normalized: ${result.summary.successfulNormalizations}`);

    // Display sample contact if available
    if (result.contacts.length > 0) {
      console.log('\n📦 Sample normalized contact:');
      console.log(JSON.stringify(result.contacts[0], null, 2));

      // Optional: Push to Neo4j
      if (process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD) {
        try {
          console.log('\n🧠 Pushing normalized contacts to Neo4j...');
          const graphConstructor = new GraphConstructor();
          await graphConstructor.constructGraph(result.contacts, [], { debug: true });
          await graphConstructor.close();
          console.log('✅ Successfully pushed to Neo4j');
        } catch (err) {
          console.error('⚠️ Failed to push to Neo4j:', err instanceof Error ? err.message : String(err));
        }
      } else {
        console.log('\nℹ️ Skipping Neo4j push (missing environment variables)');
      }
    } else {
      console.log('\n⚠️ No contacts were successfully normalized');
    }

    // Log any errors
    if (result.errors.length > 0) {
      console.warn(`\n⚠️ ${result.errors.length} URLs failed during processing:`);
      result.errors.forEach(error => {
        console.warn(`  - ${error.url}: ${error.reason}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error during ingestion:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('\n❌ Unhandled error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 