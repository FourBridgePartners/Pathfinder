import { COLUMN_ALIASES, AUM_PATTERNS, LOCATION_TERMS, REQUIRED_FIELDS } from './constants';

interface PreprocessOptions {
  debug?: boolean;
  source?: {
    type: string;
    filename?: string;
  };
}

/**
 * Preprocesses a raw record from any ingestion source to prepare it for normalization.
 * Handles common data formatting issues like split numeric fields, header normalization,
 * and data inference.
 */
export function preprocessRecord(
  record: Record<string, any>,
  options: { debug?: boolean; source?: { type: string; filename?: string } } = {}
): Record<string, string | undefined> {
  const { debug = false, source } = options;
  const log = debug ? console.log : () => {};

  // Helper to clean string values
  function cleanValue(value: any): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    const str = String(value);
    return str
      .trim()
      .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ');
  }

  // Helper to normalize field names
  const normalizeFieldName = (key: string): string => {
    const cleaned = key.toLowerCase().trim();
    for (const [standardKey, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(cleaned)) return standardKey;
    }
    for (const [standardKey, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some(alias => cleaned.includes(alias))) return standardKey;
    }
    if (cleaned.includes('linkedin')) return 'linkedin';
    if (cleaned.includes('website') || cleaned.includes('http')) return 'website';
    if (LOCATION_TERMS.some(term => cleaned.includes(term))) return 'location';
    return cleaned;
  };

  // Collect all values for notes fields and all location fields
  const notesFields = ['notes', 'description', 'summary', 'about'];
  const notesValues: string[] = [];
  let firstLocation: string | undefined;

  // Track which fields were present in the original input (case-insensitive)
  const inputKeys = Object.keys(record).map(k => normalizeFieldName(k));
  const inputKeysRaw = Object.keys(record).map(k => k.toLowerCase());

  // First pass: Clean and normalize all values
  const cleanedRecord: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!key || !key.trim()) continue;
    const normalizedKey = normalizeFieldName(key);
    const cleanedVal = cleanValue(value);
    if (cleanedVal !== undefined) {
      if (notesFields.includes(normalizedKey)) {
        notesValues.push(cleanedVal);
      } else if (normalizedKey === 'location' && !firstLocation) {
        firstLocation = cleanedVal;
      } else {
        cleanedRecord[normalizedKey] = cleanedVal;
      }
    }
  }

  // Handle notes fields
  if (notesValues.length > 0) {
    cleanedRecord.notes = notesValues.join('\n');
  }

  // Handle location
  if (firstLocation) {
    cleanedRecord.location = firstLocation;
  }

  // Handle split AUM values
  const aumParts = Object.entries(record)
    .filter(([key]) => key.toLowerCase().includes('aum'))
    .map(([_, value]) => cleanValue(value))
    .filter((value): value is string => value !== undefined);

  if (aumParts.length > 0) {
    const hasDollarSign = aumParts.some(part => part.includes('$'));
    const combinedAUM = aumParts
      .map(part => part.replace(/[^0-9.]/g, ''))
      .join('');
    
    cleanedRecord.aum = hasDollarSign ? `$${combinedAUM}` : combinedAUM;
  }

  // Only add fallback fields if not present in normalized record or original input (case-insensitive)
  const hasName = inputKeys.includes('name') || inputKeysRaw.includes('name') || cleanedRecord.name;
  const hasFirm = inputKeys.includes('firm') || inputKeysRaw.includes('firm') || cleanedRecord.firm;
  
  // Only add fallbacks if the field is missing AND we have a value to use
  // AND the field wasn't in the original input
  if (!hasName && hasFirm && !inputKeys.includes('name') && !inputKeysRaw.includes('name')) {
    cleanedRecord.name = cleanedRecord.firm;
  } else if (!hasFirm && hasName && !inputKeys.includes('firm') && !inputKeysRaw.includes('firm')) {
    cleanedRecord.firm = cleanedRecord.name;
  }

  // URLs
  const urls = { linkedin: '', website: '' };
  for (const [key, value] of Object.entries(cleanedRecord)) {
    if (value && value.toLowerCase().includes('linkedin.com')) {
      urls.linkedin = value;
      delete cleanedRecord[key];
    } else if (value && value.toLowerCase().includes('http')) {
      urls.website = value;
      delete cleanedRecord[key];
    }
  }
  if (urls.linkedin) cleanedRecord.linkedin = urls.linkedin;
  if (urls.website) cleanedRecord.website = urls.website;

  // Location casing
  if (cleanedRecord.location) {
    // Extract just the city name (first part before any comma)
    const cityName = cleanedRecord.location.split(',')[0].trim();
    cleanedRecord.location = cityName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Firm name cleanup
  if (cleanedRecord.firm) {
    // Only clean up if it's a URL or has special characters
    if (cleanedRecord.firm.includes('http') || /[<>]/.test(cleanedRecord.firm)) {
      const firmName = cleanedRecord.firm.split('.')[0].trim();
      if (firmName.length < cleanedRecord.firm.length) cleanedRecord.firm = firmName;
    }
  }

  // Add source information if provided
  if (source) {
    cleanedRecord['source_type'] = source.type;
    if (source.filename) cleanedRecord['source_filename'] = source.filename;
  }

  // Remove empty string values
  Object.keys(cleanedRecord).forEach(key => {
    if (cleanedRecord[key] === '') delete cleanedRecord[key];
  });

  return cleanedRecord;
} 