import { config } from 'dotenv';
import { CSVParser } from '../ingestion/csv_parser';
import { normalizeRow } from '../normalization/normalizeRow';
import { LPContact } from '../types';
import { preprocessRecord } from '../normalization/utils/preprocessRecord';

// Load environment variables
config();

interface IngestResult {
  totalRows: number;
  successful: number;
  failed: number;
  errors: { row: number; errors: string[] }[];
  unmappedColumns: string[];
  missingRequiredColumns: string[];
  sampleContacts: LPContact[];
}

async function main() {
  try {
    // Get file path from command line args or use default test file
    const filePath = process.argv[2] || 'data/airtable_sample.csv';
    console.log(`\n📊 Starting Phase 6.1 CSV ingestion test from: ${filePath}\n`);

    // Initialize parser and parse file
    const parser = new CSVParser();
    const parseResult = await parser.parseFile(filePath);

    // Process each contact
    const contacts: LPContact[] = [];
    const errors: { row: number; errors: string[] }[] = [];

    for (const contact of parseResult.contacts) {
      try {
        // Preprocess the contact record
        const preprocessed = preprocessRecord(contact, {
          debug: true,
          source: {
            type: 'csv',
            filename: filePath,
          },
        });

        // Normalize the preprocessed record
        const result = normalizeRow(preprocessed, {
          source: {
            type: 'csv',
            filename: filePath,
          },
          debug: true,
        });

        // For Phase 6.1, we require at least a firm name
        if (!result.contact.firm) {
          errors.push({
            row: contacts.length + 1,
            errors: ['Missing required field: firm'],
          });
          continue;
        }

        contacts.push(result.contact);
      } catch (error) {
        errors.push({
          row: contacts.length + 1,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    // Create summary
    const result: IngestResult = {
      totalRows: parseResult.diagnostics.totalRows,
      successful: contacts.length,
      failed: errors.length,
      errors,
      unmappedColumns: parseResult.diagnostics.unmappedColumns,
      missingRequiredColumns: parseResult.diagnostics.missingRequiredColumns,
      sampleContacts: contacts.slice(0, 3),
    };

    // Log results
    console.log('\n✅ Phase 6.1 CSV ingestion test complete. Summary:');
    console.log(`- File: ${filePath}`);
    console.log(`- Total rows: ${result.totalRows}`);
    console.log(`- Successfully normalized: ${result.successful}`);
    console.log(`- Failed normalizations: ${result.failed}`);

    if (result.unmappedColumns.length > 0) {
      console.log('\n⚠️ Unmapped columns:');
      result.unmappedColumns.forEach(col => console.log(`  - ${col}`));
    }

    if (result.missingRequiredColumns.length > 0) {
      console.log('\n❌ Missing required columns:');
      result.missingRequiredColumns.forEach(col => console.log(`  - ${col}`));
    }

    if (result.sampleContacts.length > 0) {
      console.log('\n📦 Sample normalized contacts:\n');
      result.sampleContacts.forEach((contact, index) => {
        console.log(`Contact ${index + 1}:`);
        console.log(JSON.stringify(contact, null, 2));
        console.log();
      });
    }

    if (result.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      result.errors.forEach(({ row, errors }) => {
        console.log(`Row ${row}:`);
        errors.forEach(error => console.log(`  - ${error}`));
      });
    }

    // Exit with appropriate code
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Error during Phase 6.1 CSV ingestion test:', error);
    process.exit(1);
  }
}

main(); 