export const COLUMN_ALIASES: Record<string, string[]> = {
  // Core fields
  name: ['name', 'full name', 'contact name', 'person', 'individual', 'contact'],
  firm: ['firm', 'company', 'organization', 'org', 'fund', 'investment firm', 'family office', 'capital', 'partners', 'management', 'advisory', 'holdings', 'company name'],
  role: ['role', 'title', 'position', 'job title', 'job', 'occupation'],
  email: ['email', 'email address', 'contact email', 'e-mail'],
  location: ['location', 'city', 'hq', 'place', 'region', 'area', 'geography', 'headquarters', 'office', 'base'],
  
  // Additional fields
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile', 'li', 'linkedin.com'],
  website: ['website', 'url', 'web', 'site', 'homepage', 'web address'],
  aum: ['aum', 'assets', 'fund size', 'assets under management', 'capital under management', 'total assets', 'assets managed', 'fund assets'],
  notes: ['description', 'summary', 'about', 'overview', 'details', 'information', 'profile', 'notes'],
  personalConnections: ['connections', 'connection count', 'conns', 'network size', 'network', 'connections count', 'total connections', 'network connections', '1st tier', '2nd tier', '3rd tier'],
} as const;

export const AUM_PATTERNS = {
  // Patterns to detect AUM-related fields
  fieldNames: ['aum', 'assets', 'fund size', 'capital'],
  valuePatterns: [
    /^\$[\d,]+(\.\d{2})?$/,  // $500,000.00
    /^[\d,]+(\.\d{2})?$/,    // 500,000.00
    /^\d+ ?(mm|m|b|bn)$/i,   // 500m, 1b
  ],
  // Patterns to detect split AUM values
  splitPatterns: [
    /^\$[\d,]+$/,            // $500
    /^[\d,]+$/,              // 000
    /^\.\d{2}$/,             // .00
  ],
} as const;

export const LOCATION_TERMS = [
  'nyc', 'new york', 'san francisco', 'london', 'boston', 'la', 'chicago', 
  'austin', 'singapore', 'hong kong', 'dubai', 'tokyo', 'paris', 'berlin', 
  'miami', 'los angeles', 'seattle', 'toronto', 'vancouver', 'sydney', 'melbourne'
] as const;

export const REQUIRED_FIELDS = ['name', 'firm'] as const; 