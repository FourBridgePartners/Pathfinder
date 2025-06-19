import { v4 as uuidv4 } from 'uuid';
import { LPContact } from '../types';
import * as inferField from './utils/inferField';

interface NormalizationOptions {
  source: {
    type: string;
    filename: string;
    sourceName?: string;
  };
  debug?: boolean;
}

interface NormalizationResult {
  contact: LPContact;
  confidence: {
    [key: string]: number;
  };
  logs: string[];
}

/**
 * Normalize a raw data row into a structured LPContact object
 * 
 * @param row - Raw data row as key-value pairs
 * @param options - Normalization options including source information
 * @returns Normalized LPContact object with confidence scores and logs
 */
export function normalizeRow(
  row: Record<string, string | undefined>,
  options: NormalizationOptions
): NormalizationResult {
  const logs: string[] = [];
  const confidence: Record<string, number> = {};
  
  // Create a base contact object with required fields
  const contact: Partial<LPContact> = {
    id: uuidv4(),
    source: {
      type: options.source.type,
      filename: options.source.filename,
      importedAt: new Date().toISOString()
    },
    // Initialize optional fields with null
    email: null,
    role: null,
    school: null,
    linkedin: null,
    twitter: null,
    location: null,
    jobHistoryRaw: null,
    educationRaw: null,
    website: null,
    notes: null,
    personalConnections: null,
    interests: null
  };

  // Normalize header keys
  const normalizedRow: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null || value === '') continue;
    
    // Try to match the header to a known field
    const normalizedKey = inferField.matchFieldFromHeader(key);
    if (normalizedKey) {
      if (options.debug) {
        logs.push(`Mapped header "${key}" → "${normalizedKey}" (confidence: high)`);
      }
      normalizedRow[normalizedKey] = value;
      confidence[normalizedKey] = 0.9;
    } else {
      // If we can't match the header, keep the original key
      normalizedRow[key] = value;
      if (options.debug) {
        logs.push(`Unmapped header: "${key}"`);
      }
    }
  }

  // Process each field in the normalized row
  for (const [key, value] of Object.entries(normalizedRow)) {
    if (!value) continue;
    
    // Try to infer the field type from the value if the key is unknown
    const fieldKey = inferField.headerMap[key] ? key : inferField.inferFieldFromValue(value);
    
    if (fieldKey) {
      processField(contact, fieldKey as keyof LPContact, value, confidence, logs, options.debug);
    } else {
      // If we can't determine the field type, add it to notes
      appendToNotes(contact, `${key}: ${value}`);
      if (options.debug) {
        logs.push(`Added unknown field "${key}" to notes`);
      }
    }
  }

  // Apply fallbacks if required fields are missing
  applyFallbacks(contact, logs, options.debug);

  // Validate required fields
  if (!contact.name) {
    logs.push('ERROR: Missing required field "name"');
  }
  
  if (!contact.firm) {
    logs.push('ERROR: Missing required field "firm"');
  }

  // Generate firmSlug if firm is present
  if (contact.firm) {
    contact.firmSlug = inferField.createSlug(contact.firm);
  }

  return {
    contact: contact as LPContact,
    confidence,
    logs
  };
}

/**
 * Process a field and apply appropriate normalization
 */
function processField(
  contact: Partial<LPContact>,
  fieldKey: keyof LPContact,
  value: string,
  confidence: Record<string, number>,
  logs: string[],
  debug?: boolean
): void {
  switch (fieldKey) {
    case 'name':
      contact.name = inferField.normalizePersonName(value);
      confidence.name = 0.9;
      if (debug) logs.push(`Set name: "${contact.name}"`);
      break;
      
    case 'firm':
      contact.firm = inferField.normalizeFirmName(value);
      confidence.firm = 0.9;
      if (debug) logs.push(`Set firm: "${contact.firm}"`);
      break;
      
    case 'email':
      if (inferField.isValidEmail(value)) {
        contact.email = inferField.normalizeEmail(value);
        confidence.email = 0.95;
        if (debug) logs.push(`Set email: "${contact.email}"`);
      } else {
        appendToNotes(contact, `Possible email: ${value}`);
        if (debug) logs.push(`Invalid email format: "${value}"`);
      }
      break;
      
    case 'role':
      contact.role = inferField.normalizeRole(value);
      confidence.role = 0.8;
      if (debug) logs.push(`Set role: "${contact.role}"`);
      break;
      
    case 'linkedin':
      const linkedinUrl = inferField.normalizeLinkedIn(value);
      if (inferField.isValidLinkedInUrl(linkedinUrl)) {
        contact.linkedin = linkedinUrl;
        confidence.linkedin = 0.95;
        if (debug) logs.push(`Set LinkedIn: "${contact.linkedin}"`);
      } else {
        appendToNotes(contact, `Possible LinkedIn: ${value}`);
        if (debug) logs.push(`Invalid LinkedIn format: "${value}"`);
      }
      break;
      
    case 'twitter':
      contact.twitter = value.trim();
      confidence.twitter = 0.8;
      if (debug) logs.push(`Set Twitter: "${contact.twitter}"`);
      break;
      
    case 'website':
      const websiteUrl = inferField.normalizeWebsite(value);
      if (inferField.isValidWebsiteUrl(websiteUrl)) {
        contact.website = websiteUrl;
        confidence.website = 0.9;
        if (debug) logs.push(`Set website: "${contact.website}"`);
      } else {
        appendToNotes(contact, `Possible website: ${value}`);
        if (debug) logs.push(`Invalid website format: "${value}"`);
      }
      break;
      
    case 'location':
      contact.location = inferField.normalizeLocation(value);
      confidence.location = 0.8;
      if (debug) logs.push(`Set location: "${contact.location}"`);
      break;
      
    case 'school':
      contact.school = value.trim();
      confidence.school = 0.8;
      if (debug) logs.push(`Set school: "${contact.school}"`);
      break;
      
    case 'notes':
      appendToNotes(contact, value);
      confidence.notes = 0.7;
      if (debug) logs.push(`Added to notes: "${value.substring(0, 30)}..."`);
      break;
      
    case 'personalConnections':
      contact.personalConnections = value.trim();
      confidence.personalConnections = 0.7;
      if (debug) logs.push(`Set personal connections: "${contact.personalConnections}"`);
      break;
      
    case 'interests':
      contact.interests = value.trim();
      confidence.interests = 0.7;
      if (debug) logs.push(`Set interests: "${contact.interests}"`);
      break;
      
    default:
      // For any other fields, add to notes
      appendToNotes(contact, `${fieldKey}: ${value}`);
      if (debug) logs.push(`Added unknown field "${fieldKey}" to notes`);
      break;
  }
}

/**
 * Apply fallbacks for missing required fields
 */
function applyFallbacks(contact: Partial<LPContact>, logs: string[], debug?: boolean): void {
  // If we have a firm name but no contact name, use the firm name as the contact name
  if (contact.firm && !contact.name) {
    contact.name = contact.firm;
    if (debug) logs.push(`Using firm name "${contact.firm}" as contact name`);
  }

  // If we have a name but no firm, use the name as the firm
  if (contact.name && !contact.firm) {
    contact.firm = contact.name;
    if (debug) logs.push(`Using contact name "${contact.name}" as firm name`);
  }
}

/**
 * Helper function to append text to the notes field
 */
function appendToNotes(contact: Partial<LPContact>, text: string): void {
  if (!text) return;
  
  if (!contact.notes) {
    contact.notes = text;
  } else {
    contact.notes += '\n' + text;
  }
}

/**
 * Test function to demonstrate normalization
 */
export function testNormalization(): void {
  const testRow = {
    'Name': 'John Smith',
    'Company': 'Acme Capital',
    'Email Address': 'john@acmecapital.com',
    'Position': 'Managing Director',
    'LinkedIn Profile': 'https://www.linkedin.com/in/johnsmith/',
    'Location': 'New York, NY',
    'Notes': 'Met at conference in 2022. Interested in fintech investments.'
  };
  
  const result = normalizeRow(testRow, {
    source: {
      type: 'test',
      filename: 'test_data.csv'
    },
    debug: true
  });
  
  console.log('Normalized Contact:');
  console.log(JSON.stringify(result.contact, null, 2));
  console.log('\nConfidence Scores:');
  console.log(result.confidence);
  console.log('\nLogs:');
  console.log(result.logs.join('\n'));
}

// Uncomment to run the test
testNormalization(); 