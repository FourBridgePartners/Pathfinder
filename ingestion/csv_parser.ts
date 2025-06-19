import { parse } from 'csv-parse/sync';
import { LPContact } from '../types';
import { readFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { preprocessRecord } from '../normalization/utils/preprocessRecord';

interface RawLPRecord {
  'Firm': string;
  'Location': string;
  'AUM': string;
  'LinkedIn': string;
  'Website': string;
  'Connections': string;
  'City': string;
  'Notes': string;
  'Connection Type': string;
  'Name'?: string;
  'Email'?: string;
  'Role'?: string;
}

interface ParseResult {
  contacts: LPContact[];
  errors: { row: number; errors: string[] }[];
  diagnostics: {
    hasHeaders: boolean;
    unmappedColumns: string[];
    missingRequiredColumns: string[];
    columnMapping: Record<string, keyof RawLPRecord>;
    skippedRows: number;
    totalRows: number;
    fieldStats: {
      [key: string]: number;
    };
    mappingConfidence: Record<string, number>;
  };
}

interface ColumnMapping {
  key: keyof RawLPRecord;
  aliases: string[];
  required: boolean;
  normalize?: (value: string) => string;
}

interface ColumnMappingResult {
  mapping: Record<string, keyof RawLPRecord>;
  unmappedColumns: string[];
  missingRequiredColumns: string[];
}

const headerMap: Record<string, string[]> = {
  'name': ['name', 'contact', 'person', 'individual'],
  'firm': ['firm', 'company', 'organization', 'org', 'fund', 'investment firm', 'family office', 'capital', 'partners', 'management', 'advisory', 'holdings', 'family office'],
  'location': ['location', 'city', 'hq', 'place', 'region', 'area', 'geography', 'headquarters', 'office', 'base'],
  'linkedin': ['linkedin', 'linkedin url', 'linkedin profile', 'li', 'linkedin.com'],
  'website': ['website', 'url', 'web', 'site', 'homepage', 'web address'],
  'aum': ['aum', 'assets', 'fund size', 'assets under management', 'capital under management', 'total assets', 'assets managed', 'fund assets'],
  'notes': ['description', 'summary', 'about', 'overview', 'details', 'information', 'profile'],
  'personalConnections': ['connections', 'connection count', 'conns', 'network size', 'network', 'connections count', 'total connections', 'network connections', '1st tier', '2nd tier', '3rd tier'],
};

function normalizeHeaders(headers: string[]): string[] {
  return headers.map(h => {
    const cleaned = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Special case for Family Office column
    if (cleaned === 'familyoffice') {
      console.log(`[CSVParser] Mapped "Family Office" column to "firm"`);
      return 'firm';
    }
    
    // Check for URL-like headers
    if (h.match(/^https?:\/\//)) {
      console.log(`[CSVParser] Detected URL-like header: ${h}`);
      if (h.includes('linkedin.com')) return 'linkedin';
      return 'website';
    }

    // Check for firm-like headers
    if (h.match(/(?:capital|partners|management|holdings|group|fund|investments|ventures|advisors|advisory|family office)/i)) {
      console.log(`[CSVParser] Detected firm-like header: ${h}`);
      return 'firm';
    }

    // Check headerMap
    for (const [key, aliases] of Object.entries(headerMap)) {
      if (aliases.some(alias => cleaned.includes(alias))) {
        console.log(`[CSVParser] Mapped header "${h}" to "${key}" via headerMap`);
        return key;
      }
    }

    // Check for location-like headers
    if (h.match(/(?:city|location|region|area|hq|headquarters|office|base)/i)) {
      console.log(`[CSVParser] Detected location-like header: ${h}`);
      return 'location';
    }

    console.log(`[CSVParser] No mapping found for header: ${h}`);
    return cleaned;
  });
}

function inferFieldFromValue(value: string): keyof LPContact | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();

  // Patterns for websites
  if (/^https?:\/\/[^ ]+\.(com|org|net|io|ai|co|vc|xyz)/.test(v)) {
    if (v.includes('linkedin.com')) {
      console.log(`[CSVParser] Matched value: ${value} → field: linkedin via LinkedIn URL pattern`);
      return 'linkedin';
    }
    if (v.includes('twitter.com')) {
      console.log(`[CSVParser] Matched value: ${value} → field: twitter via Twitter URL pattern`);
      return 'twitter';
    }
    console.log(`[CSVParser] Matched value: ${value} → field: website via URL pattern`);
    return 'website';
  }

  // Location detection
  const locationTerms = ['nyc', 'new york', 'san francisco', 'london', 'boston', 'la', 'chicago', 'austin', 'singapore', 'hong kong', 'dubai', 'tokyo', 'paris', 'berlin', 'miami', 'los angeles', 'seattle', 'toronto', 'vancouver', 'sydney', 'melbourne'];
  if (locationTerms.some(term => v.includes(term))) {
    console.log(`[CSVParser] Matched value: ${value} → field: location via city pattern`);
    return 'location';
  }

  // AUM detection
  if (/\$[\d,]+(\.\d{2})?/.test(v) || /\d+ ?(mm|m|b|bn)/.test(v)) {
    console.log(`[CSVParser] Matched value: ${value} → field: aum via amount pattern`);
    return 'aum' as keyof LPContact;
  }

  // Notes fallback
  if (v.length > 20 && /\s/.test(v)) {
    console.log(`[CSVParser] Matched value: ${value.substring(0, 50)}... → field: notes via length and content`);
    return 'notes';
  }

  // Personal connections detection
  if (v.includes('1st tier') || v.includes('connection') || v.includes('family office') || 
      v.includes('introduced') || v.includes('connected') || v.includes('knows') || 
      v.includes('met') || v.includes('introduction') || v.includes('referral')) {
    console.log(`[CSVParser] Matched value: ${value} → field: personalConnections via connection pattern`);
    return 'personalConnections';
  }

  return null;
}

function sanitizeRow(headers: string[], row: string[]): Partial<LPContact> {
  const contact: Partial<LPContact> = {};
  let notesContent: string[] = [];
  let aumValue: string | null = null;

  for (let i = 0; i < row.length; i++) {
    const raw = row[i];
    if (!raw) continue;

    const key = headers[i] || inferFieldFromValue(raw) || `field${i}`;
    
    switch (key) {
      case 'firm':
        contact.firm = raw;
        // Fallback: Use firm as name if name is missing
        if (!contact.name) {
          contact.name = raw;
          console.log(`[CSVParser] Used firm "${raw}" as fallback for name`);
        }
        break;
      case 'aum':
        aumValue = raw;
        break;
      case 'website':
        contact.website = raw;
        break;
      case 'linkedin':
        contact.linkedin = raw;
        break;
      case 'location':
        contact.location = raw;
        break;
      case 'notes':
        notesContent.push(raw);
        break;
      case 'personalConnections':
        contact.personalConnections = raw;
        break;
      default:
        // Try to infer the field type
        const inferredField = inferFieldFromValue(raw);
        const simpleStringFields = ['name', 'firm', 'role', 'location', 'website', 'linkedin', 'notes', 'personalConnections'] as const;
        type ContactStringField = typeof simpleStringFields[number];
        if (inferredField && simpleStringFields.includes(inferredField as ContactStringField)) {
          contact[inferredField as ContactStringField] = raw;
        } else {
          notesContent.push(raw);
        }
    }
  }

  // Combine notes content
  if (notesContent.length > 0) {
    contact.notes = notesContent.join('\n');
  }

  // Add AUM to notes if present
  if (aumValue) {
    contact.notes = (contact.notes || '') + `\nAUM: ${aumValue}`;
  }

  return contact;
}

export class CSVParser {
  private readonly columnMappings: ColumnMapping[] = [
    { 
      key: 'Firm', 
      aliases: ['firm', 'company', 'firm name', 'organization', 'org', 'lp firm', 'fund', 'investment firm', 'family office', 'capital', 'partners', 'management', 'advisory', 'holdings'], 
      required: true,
      normalize: this.normalizeFirmName
    },
    { 
      key: 'Name', 
      aliases: ['name', 'full name', 'contact name', 'person', 'individual'], 
      required: false,
      normalize: this.normalizePersonName
    },
    { 
      key: 'Email', 
      aliases: ['email', 'email address', 'contact email'], 
      required: false,
      normalize: this.normalizeEmail
    },
    { 
      key: 'Role', 
      aliases: ['role', 'title', 'position', 'job title'], 
      required: false,
      normalize: this.normalizeRole
    },
    { 
      key: 'Location', 
      aliases: ['location', 'region', 'area', 'geography', 'hq', 'headquarters', 'office', 'base'], 
      required: false,
      normalize: this.normalizeLocation
    },
    { 
      key: 'AUM', 
      aliases: ['aum', 'assets under management', 'assets', 'fund size', 'capital under management', 'total assets', 'assets managed', 'fund assets'], 
      required: false,
      normalize: this.normalizeAUM
    },
    { 
      key: 'LinkedIn', 
      aliases: ['linkedin', 'linkedin url', 'linkedin profile', 'li', 'linkedin.com', 'linkedin profile url'], 
      required: false,
      normalize: this.normalizeLinkedIn
    },
    { 
      key: 'Website', 
      aliases: ['website', 'site', 'url', 'web', 'firm website', 'company website', 'homepage', 'web address'], 
      required: false,
      normalize: this.normalizeWebsite
    },
    { 
      key: 'Connections', 
      aliases: ['connections', 'connection count', 'conns', 'network size', 'network', 'connections count', 'total connections', 'network connections'], 
      required: false,
      normalize: this.normalizeText
    },
    { 
      key: 'City', 
      aliases: ['city', 'hq city', 'headquarters city', 'office location', 'primary location', 'main office', 'headquarters location'], 
      required: false,
      normalize: this.normalizeCity
    },
    { 
      key: 'Notes', 
      aliases: ['notes', 'comments', 'description', 'additional info', 'about', 'overview', 'summary', 'details', 'information', 'profile'], 
      required: false,
      normalize: this.normalizeText
    },
    { 
      key: 'Connection Type', 
      aliases: ['connection type', 'type', 'relationship', 'connection category', 'tier', 'connection tier', 'relationship type', 'connection level'], 
      required: false,
      normalize: this.normalizeText
    },
  ];

  // Normalization helper methods
  private normalizeFirmName(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b(LLC|Inc|Ltd|LP|LLP)\b/gi, match => match.toUpperCase())
      .replace(/\b([a-z])/g, match => match.toUpperCase());
  }

  private normalizePersonName(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b(Jr\.?|Sr\.?|II|III|IV)\b/gi, '') // remove suffixes
      .replace(/\b\w\.\s*/g, '') // remove middle initials like "A."
      .replace(/\b([a-z])/g, match => match.toUpperCase());
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeRole(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b([a-z])/g, match => match.toUpperCase());
  }

  private normalizeLocation(value: string): string {
    return value.trim().toLowerCase().replace(/new york city|nyc/g, 'new york');
  }

  private normalizeAUM(value: string): string {
    // Remove currency symbols, commas, and convert to standard format
    return value
      .trim()
      .replace(/[$,]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^0-9.]/g, ''); // Keep only numbers and decimal point
  }

  private normalizeLinkedIn(value: string): string {
    const url = value.trim().toLowerCase();
    if (!url) return '';
    
    // Handle various LinkedIn URL formats
    if (url.includes('linkedin.com')) {
      if (!url.startsWith('http')) return `https://${url}`;
      return url;
    }
    
    // If it's just a search URL, extract the search term
    if (url.includes('search/results')) {
      const searchTerm = url.match(/keywords=([^&]+)/)?.[1];
      if (searchTerm) {
        return `https://www.linkedin.com/search/results/all/?keywords=${searchTerm}`;
      }
    }
    
    return url;
  }

  private normalizeWebsite(value: string): string {
    const url = value.trim().toLowerCase();
    if (!url) return '';
    if (!url.startsWith('http')) return `https://${url}`;
    return url;
  }

  private normalizeText(value: string): string {
    return value.trim();
  }

  private normalizeCity(value: string): string {
    return value.trim().toLowerCase();
  }

  private createSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private detectHeaders(firstRow: string[]): boolean {
    const headerWords = ['name', 'firm', 'company', 'location', 'city', 'email', 'linkedin', 'website', 'aum', 'assets', 'fund', 'size', 'description', 'notes', 'connections', 'connection', 'type', 'role', 'title', 'position', 'job', 'contact', 'person', 'individual', 'organization', 'org', 'lp', 'investment', 'family', 'office', 'capital', 'partners', 'management', 'advisory', 'holdings', 'region', 'area', 'geography', 'hq', 'headquarters', 'base', 'url', 'web', 'site', 'homepage', 'address', 'comments', 'additional', 'info', 'about', 'overview', 'summary', 'details', 'information', 'profile', 'relationship', 'category', 'tier', 'level'];
    const hasHeaderWords = firstRow.some(cell => 
      headerWords.some(word => cell.toLowerCase().includes(word))
    );
    return hasHeaderWords;
  }

  private extractLinkedInURL(text: string): string | null {
    const linkedInRegex = /(https?:\/\/[^\s]*linkedin\.com\/[^\s]*)/i;
    const match = text.match(linkedInRegex);
    return match ? match[1] : null;
  }

  private createColumnMapping(headers: string[]): ColumnMappingResult {
    const mapping: Record<string, keyof RawLPRecord> = {};
    const unmappedColumns: string[] = [];
    const missingRequiredColumns: string[] = [];

    // If no headers are provided, create default mapping based on column position
    if (headers.length === 0 || headers.every(h => !h.trim())) {
      const defaultMapping: (keyof RawLPRecord)[] = ['Firm', 'Location', 'AUM', 'LinkedIn', 'Website', 'Connections', 'City', 'Notes', 'Connection Type'];
      headers.forEach((_, index) => {
        if (index < defaultMapping.length) {
          mapping[`Column ${index + 1}`] = defaultMapping[index];
          console.log(`[CSVParser] Mapped column ${index + 1} to "${defaultMapping[index]}" (default mapping)`);
        } else {
          unmappedColumns.push(`Column ${index + 1}`);
          console.log(`[CSVParser] Unmapped column ${index + 1} (no default mapping available)`);
        }
      });
    } else {
      headers.forEach((header) => {
        const normalizedHeader = header.toLowerCase().trim();
        let bestMatch: { key: keyof RawLPRecord; score: number } | null = null;

        // Find the best matching column mapping
        for (const columnMapping of this.columnMappings) {
          const score = columnMapping.aliases.reduce((maxScore, alias) => {
            const similarity = this.calculateSimilarity(normalizedHeader, alias.toLowerCase());
            return Math.max(maxScore, similarity);
          }, 0);

          if (score > 0.45 && (!bestMatch || score > bestMatch.score)) {
            console.log(`[CSVParser] Match candidate: "${header}" → "${columnMapping.key}" (alias score: ${score.toFixed(2)})`);
            bestMatch = { key: columnMapping.key, score };
          }
        }

        if (bestMatch) {
          mapping[header] = bestMatch.key;
          console.log(`[CSVParser] Mapped header "${header}" to "${bestMatch.key}" (confidence: ${Math.round(bestMatch.score * 100)}%)`);
        } else {
          unmappedColumns.push(header);
          console.log(`[CSVParser] Unmapped header: "${header}"`);
        }
      });

      // Fallback: Try to infer "Firm" from common fallback names if not mapped
      if (!Object.values(mapping).includes('Firm')) {
        const fallbackFirmHeader = headers.find(h =>
          ['company', 'fund', 'org', 'lp firm', 'firm name'].some(alias =>
            h.toLowerCase().includes(alias)
          )
        );
        if (fallbackFirmHeader) {
          mapping[fallbackFirmHeader] = 'Firm';
          console.warn(`[CSVParser] Fallback-mapped "${fallbackFirmHeader}" to "Firm"`);
        }
      }

      // Fallback: Map long text to 'Notes' if not already mapped
      if (!Object.values(mapping).includes('Notes')) {
        const longTextHeader = headers.find(h => h.length > 100);
        if (longTextHeader) {
          mapping[longTextHeader] = 'Notes';
          console.warn(`[CSVParser] Fallback-mapped long text "${longTextHeader}" to "Notes"`);
        }
      }
    }

    // Check for missing required columns
    this.columnMappings
      .filter(m => m.required)
      .forEach(m => {
        if (!Object.values(mapping).includes(m.key)) {
          missingRequiredColumns.push(m.key);
          console.log(`[CSVParser] Missing required column: "${m.key}"`);
        }
      });

    return { mapping, unmappedColumns, missingRequiredColumns };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = this.cleanStringForComparison(str1);
    const s2 = this.cleanStringForComparison(str2);
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    const distance = this.editDistance(s1, s2);
    return 1.0 - distance / maxLength;
  }

  private cleanStringForComparison(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private editDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1, // substitution
            dp[i - 1][j] + 1,     // deletion
            dp[i][j - 1] + 1      // insertion
          );
        }
      }
    }

    return dp[m][n];
  }

  private normalizeRecord(
    record: Record<string, string>, 
    columnMapping: Record<string, keyof RawLPRecord>
  ): RawLPRecord {
    // Preprocess the record first
    const preprocessed = preprocessRecord(record, { debug: true });
    
    const normalized: Partial<RawLPRecord> = {};
    for (const [header, value] of Object.entries(preprocessed)) {
      const key = columnMapping[header];
      if (key) {
        const mapping = this.columnMappings.find(m => m.key === key);
        if (mapping?.normalize && value !== undefined) {
          normalized[key] = mapping.normalize(value);
        } else {
          normalized[key] = value;
        }
      }
    }
    return normalized as RawLPRecord;
  }

  private validateRecord(record: Partial<RawLPRecord>): string[] {
    const errors: string[] = [];
    if (!record['Firm']?.trim()) errors.push('Firm is required');
    if (!record['Name']?.trim()) errors.push('Name is required');
    if (record['Email'] && !this.isValidEmail(record['Email'])) errors.push('Invalid email format');
    if (record['LinkedIn'] && !this.isValidLinkedInUrl(record['LinkedIn'])) errors.push('Invalid LinkedIn URL');
    if (record['Website'] && !this.isValidWebsiteUrl(record['Website'])) errors.push('Invalid website URL');
    return errors;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidLinkedInUrl(url: string): boolean {
    return url.includes('linkedin.com');
  }

  private isValidWebsiteUrl(url: string): boolean {
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(url);
  }

  private transformRecord(record: RawLPRecord, filename: string): LPContact {
    const firmName = record['Firm'].trim();
    const notes = record['Notes'] || '';
    let linkedin = record['LinkedIn'] || null;
    if (!linkedin && notes) {
      linkedin = this.extractLinkedInURL(notes);
    }
    return {
      id: uuidv4(),
      name: record['Name'] || firmName,
      email: record['Email'] || null,
      firm: firmName,
      firmSlug: this.createSlug(firmName),
      role: record['Role'] || null,
      linkedin: linkedin,
      twitter: null,
      location: record['City'] || record['Location'] ? this.normalizeLocation(record['City'] || record['Location']) : null,
      jobHistoryRaw: null,
      educationRaw: null,
      website: record['Website'] || null,
      notes: notes,
      personalConnections: record['Connections'] || null,
      interests: null,
      source: {
        type: 'airtable',
        filename,
        importedAt: new Date().toISOString()
      }
    };
  }

  private calculateFieldStats(contacts: LPContact[]): Record<string, number> {
    return {
      email: contacts.filter(c => c.email).length,
      linkedin: contacts.filter(c => c.linkedin).length,
      jobHistoryRaw: contacts.filter(c => c.jobHistoryRaw).length,
      educationRaw: contacts.filter(c => c.educationRaw).length,
      location: contacts.filter(c => c.location).length,
      website: contacts.filter(c => c.website).length,
      notes: contacts.filter(c => c.notes).length,
      personalConnections: contacts.filter(c => c.personalConnections).length,
    };
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    const errors: { row: number; errors: string[] }[] = [];
    const contacts: LPContact[] = [];
    const DEFAULT_CONTACT: Partial<LPContact> = {
      name: '',
      firm: '',
      email: null,
      linkedin: null,
      twitter: null,
      location: null,
      website: null,
      notes: null,
      personalConnections: null,
      interests: null,
    };

    try {
      const fileContent = await readFile(filePath, 'utf-8');
      const rows = fileContent.split('\n').map((row: string) => row.split(','));
      const headers = normalizeHeaders(rows[0]);
      const hasHeaders = this.detectHeaders(rows[0]);
      const columnMapping = this.createColumnMapping(headers);
      const mappingConfidence: Record<string, number> = {};

      console.log('Original headers:', rows[0]);
      console.log('Normalized headers:', headers);
      console.log('Column mapping:', columnMapping.mapping);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sanitizedRow = sanitizeRow(headers, row);
        const contact = { ...DEFAULT_CONTACT, ...sanitizedRow } as LPContact;
        if (!contact.name) {
          if (contact.firm) {
            contact.name = contact.firm;
            console.log(`[CSVParser] Used firm as name for row ${i}: ${contact.firm}`);
          } else {
            errors.push({ row: i, errors: ['Missing both Name and Firm'] });
            continue;
          }
        }
        contacts.push(contact);
      }

      const fieldStats = this.calculateFieldStats(contacts);
      return {
        contacts,
        errors,
        diagnostics: {
          hasHeaders,
          unmappedColumns: columnMapping.unmappedColumns,
          missingRequiredColumns: columnMapping.missingRequiredColumns,
          columnMapping: columnMapping.mapping,
          skippedRows: errors.length,
          totalRows: rows.length - 1,
          fieldStats,
          mappingConfidence,
        },
      };
    } catch (error) {
      console.error('Error parsing CSV:', error);
      errors.push({ row: 0, errors: ['Failed to parse CSV file'] });
      return {
        contacts,
        errors,
        diagnostics: {
          hasHeaders: false,
          unmappedColumns: [],
          missingRequiredColumns: [],
          columnMapping: {},
          skippedRows: errors.length,
          totalRows: 0,
          fieldStats: {},
          mappingConfidence: {},
        },
      };
    }
  }

  parseCSV(csvContent: string, filename: string): ParseResult {
    const errors: { row: number; errors: string[] }[] = [];
    const contacts: LPContact[] = [];
    const DEFAULT_CONTACT: Partial<LPContact> = {
      name: '',
      firm: '',
      email: null,
      linkedin: null,
      twitter: null,
      location: null,
      website: null,
      notes: null,
      personalConnections: null,
      interests: null,
    };

    try {
      const rows = csvContent.split('\n').map((row: string) => row.split(','));
      const headers = normalizeHeaders(rows[0]);
      const hasHeaders = this.detectHeaders(rows[0]);
      const columnMapping = this.createColumnMapping(headers);
      const mappingConfidence: Record<string, number> = {};

      console.log('Original headers:', rows[0]);
      console.log('Normalized headers:', headers);
      console.log('Column mapping:', columnMapping.mapping);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sanitizedRow = sanitizeRow(headers, row);
        const contact = { ...DEFAULT_CONTACT, ...sanitizedRow } as LPContact;
        if (!contact.name) {
          if (contact.firm) {
            contact.name = contact.firm;
            console.log(`[CSVParser] Used firm as name for row ${i}: ${contact.firm}`);
          } else {
            errors.push({ row: i, errors: ['Missing both Name and Firm'] });
            continue;
          }
        }
        contacts.push(contact);
      }

      const fieldStats = this.calculateFieldStats(contacts);
      return {
        contacts,
        errors,
        diagnostics: {
          hasHeaders,
          unmappedColumns: columnMapping.unmappedColumns,
          missingRequiredColumns: columnMapping.missingRequiredColumns,
          columnMapping: columnMapping.mapping,
          skippedRows: errors.length,
          totalRows: rows.length - 1,
          fieldStats,
          mappingConfidence,
        },
      };
    } catch (error) {
      console.error('Error parsing CSV:', error);
      errors.push({ row: 0, errors: ['Failed to parse CSV file'] });
      return {
        contacts,
        errors,
        diagnostics: {
          hasHeaders: false,
          unmappedColumns: [],
          missingRequiredColumns: [],
          columnMapping: {},
          skippedRows: errors.length,
          totalRows: 0,
          fieldStats: {},
          mappingConfidence: {},
        },
      };
    }
  }
}
