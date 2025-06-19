import axios from 'axios';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { LPContact } from '../types';
import { normalizeRow } from '../normalization/normalizeRow';
import { preprocessRecord } from '../normalization/utils/preprocessRecord';

// Load environment variables
dotenv.config();

// Configurable parameters (from env vars or function params)
interface AirtableConfig {
  apiKey: string;
  baseId: string;
  tableName: string;
  debug?: boolean;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface ImportResult {
  contacts: LPContact[];
  errors: { record: Record<string, string>; errors: string[] }[];
  summary: {
    totalRecords: number;
    successfulImports: number;
    failedImports: number;
  };
}

/**
 * Fetch records from Airtable
 * 
 * @param config - Airtable configuration
 * @returns Promise resolving to array of records
 */
export async function fetchAirtableRecords(config: AirtableConfig): Promise<Record<string, string>[]> {
  const allRecords: Record<string, string>[] = [];
  let offset: string | undefined;

  do {
    try {
      const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`;
      const response = await axios.get<AirtableResponse>(url, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          offset,
          maxRecords: 100 // Airtable's maximum per request
        }
      });

      const { records, offset: nextOffset } = response.data;
      
      // Flatten each record's fields into a simple object
      const flattenedRecords = records.map(record => {
        const flatRecord: Record<string, string> = {};
        
        // Convert all field values to strings
        for (const [key, value] of Object.entries(record.fields)) {
          // Handle arrays (like multi-select fields)
          if (Array.isArray(value)) {
            flatRecord[key] = value.join(', ');
          } 
          // Handle attachments
          else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value) && value[0]?.url) {
              // It's an attachment
              flatRecord[key] = value[0].url;
            } else {
              // It's some other object, stringify it
              flatRecord[key] = JSON.stringify(value);
            }
          } 
          // Handle simple values
          else if (value !== null && value !== undefined) {
            flatRecord[key] = String(value);
          }
        }
        
        // Add record ID as a field
        flatRecord['Airtable Record ID'] = record.id;
        
        return flatRecord;
      });
      
      allRecords.push(...flattenedRecords);
      offset = nextOffset;

      console.log(`[AirtableImport] Fetched ${records.length} records${offset ? ' (more to come)' : ''}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('[AirtableImport] Error fetching records:', error.response?.data || error.message);
      } else {
        console.error('[AirtableImport] Unexpected error:', error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  } while (offset);

  return allRecords;
}

/**
 * Main function to import data from Airtable
 * 
 * @param config - Optional Airtable configuration (falls back to env vars)
 * @returns Promise resolving to ImportResult containing contacts, errors, and summary
 */
export async function importFromAirtable(
  config?: Partial<AirtableConfig>
): Promise<ImportResult> {
  // Use provided config or fall back to env vars
  const airtableConfig: AirtableConfig = {
    apiKey: config?.apiKey || process.env.AIRTABLE_API_KEY || '',
    baseId: config?.baseId || process.env.AIRTABLE_BASE_ID || '',
    tableName: config?.tableName || process.env.AIRTABLE_TABLE_NAME || 'LP Network',
    debug: config?.debug || false
  };
  
  // Validate config
  if (!airtableConfig.apiKey) {
    throw new Error('Missing Airtable API key');
  }
  if (!airtableConfig.baseId) {
    throw new Error('Missing Airtable base ID');
  }
  
  console.log(`[AirtableImport] Importing from table "${airtableConfig.tableName}" in base "${airtableConfig.baseId}"`);
  
  // Fetch records from Airtable
  const records = await fetchAirtableRecords(airtableConfig);
  console.log(`[AirtableImport] Successfully fetched ${records.length} total records`);
  
  // Normalize records using the new normalization module
  const contacts: LPContact[] = [];
  const errors: { record: Record<string, string>; errors: string[] }[] = [];
  
  for (const record of records) {
    try {
      if (airtableConfig.debug) {
        console.log(`[Debug] Raw record: ${JSON.stringify(record, null, 2)}`);
      }

      // Preprocess the record first
      const preprocessed = preprocessRecord(record, { 
        debug: airtableConfig.debug,
        source: {
          type: 'airtable',
          filename: airtableConfig.tableName
        }
      });

      const result = normalizeRow(preprocessed, {
        source: {
          type: 'airtable',
          filename: airtableConfig.tableName,
          sourceName: preprocessed['firm'] || preprocessed['name'] || 'Unknown'
        },
        debug: airtableConfig.debug
      });
      
      if (airtableConfig.debug) {
        console.log(`[Debug] Normalized: ${JSON.stringify(result.contact, null, 2)}`);
      }
      
      // Check for required fields
      if (!result.contact.name || !result.contact.firm) {
        errors.push({
          record,
          errors: result.logs.filter(log => log.startsWith('ERROR'))
        });
        continue;
      }
      
      contacts.push(result.contact);
    } catch (error) {
      errors.push({
        record,
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }
  
  console.log(`[AirtableImport] Successfully normalized ${contacts.length} contacts`);
  if (errors.length > 0) {
    console.warn(`[AirtableImport] Failed to normalize ${errors.length} records`);
  }
  
  return {
    contacts,
    errors,
    summary: {
      totalRecords: records.length,
      successfulImports: contacts.length,
      failedImports: errors.length
    }
  };
}

/**
 * Test function to demonstrate the Airtable import with sample data
 */
export function testWithSampleData(): void {
  // Sample data that would come from Airtable
  const sampleRecords: Record<string, string>[] = [
    {
      'Name': 'John Smith',
      'Firm': 'Acme Capital',
      'Email': 'john@acmecapital.com',
      'Role': 'Managing Director',
      'LinkedIn': 'https://www.linkedin.com/in/johnsmith/',
      'Location': 'New York, NY',
      'Notes': 'Met at conference in 2022'
    },
    {
      'Name': 'Jane Doe',
      'Company': 'Blue Ventures',
      'Email Address': 'jane@blueventures.com',
      'Position': 'Partner',
      'LinkedIn URL': 'https://www.linkedin.com/in/janedoe/',
      'City': 'San Francisco, CA',
      'Description': 'Interested in AI startups'
    }
  ];
  
  console.log('[Test] Processing sample data...');
  
  // Process each record through the normalization pipeline
  const contacts: LPContact[] = [];
  const errors: string[] = [];
  
  for (const record of sampleRecords) {
    try {
      const result = normalizeRow(record, {
        source: {
          type: 'test',
          filename: 'sample_data'
        },
        debug: true
      });
      
      contacts.push(result.contact);
      console.log(`[Test] Processed record: ${result.contact.name}`);
      console.log(`[Test] Confidence scores: ${JSON.stringify(result.confidence)}`);
      console.log(`[Test] Logs: ${result.logs.join(', ')}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      console.error('[Test] Error processing record:', error);
    }
  }
  
  console.log(`[Test] Successfully processed ${contacts.length} contacts`);
  if (errors.length > 0) {
    console.warn(`[Test] Failed to process ${errors.length} records`);
  }
  
  // Display a sample contact
  if (contacts.length > 0) {
    console.log('[Test] Sample normalized contact:');
    console.log(JSON.stringify(contacts[0], null, 2));
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testWithSampleData();
}
