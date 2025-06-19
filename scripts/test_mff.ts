import { CSVParser } from '../ingestion/csv_parser';
import { GraphConstructor } from '../graph/construct_graph';
import { join } from 'path';

async function main() {
  try {
    // Initialize parser and graph constructor
    const parser = new CSVParser();
    const graphConstructor = new GraphConstructor();

    // Parse CSV file
    const csvPath = join(process.cwd(), 'tests', 'assets', 'Airtable Export.xlsx - Unit-Test.csv');
    console.log('Reading CSV file from:', csvPath);
    
    const { contacts, errors } = await parser.parseFile(csvPath);

    // Log parsing results
    console.log('\nParsing Results:');
    console.log('----------------');
    console.log(`Total valid contacts: ${contacts.length}`);
    
    if (errors.length > 0) {
      console.log(`\nFound ${errors.length} records with errors:`);
      errors.forEach(({ row, errors }) => {
        console.log(`Row ${row}: ${errors.join(', ')}`);
      });
    }

    // Log field statistics
    const stats = {
      withEmail: contacts.filter(c => c.email).length,
      withLinkedIn: contacts.filter(c => c.linkedin).length,
      withJobHistory: contacts.filter(c => c.jobHistoryRaw).length,
      withEducation: contacts.filter(c => c.educationRaw).length,
      withLocation: contacts.filter(c => c.location).length,
      withWebsite: contacts.filter(c => c.website).length,
    };

    console.log('\nField Statistics:');
    console.log('----------------');
    console.log(`Contacts with email: ${stats.withEmail}/${contacts.length}`);
    console.log(`Contacts with LinkedIn: ${stats.withLinkedIn}/${contacts.length}`);
    console.log(`Contacts with job history: ${stats.withJobHistory}/${contacts.length}`);
    console.log(`Contacts with education: ${stats.withEducation}/${contacts.length}`);
    console.log(`Contacts with location: ${stats.withLocation}/${contacts.length}`);
    console.log(`Contacts with website: ${stats.withWebsite}/${contacts.length}`);

    // Construct graph
    console.log('\nConstructing graph...');
    await graphConstructor.constructGraph(contacts, []);
    console.log('Successfully constructed graph');

    // Clean up
    await graphConstructor.close();
  } catch (error) {
    console.error('Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main(); 