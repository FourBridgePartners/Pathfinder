import { LPContact } from '../../types';

// Header mapping for fuzzy matching
export const headerMap: Record<string, string[]> = {
  'name': ['name', 'contact', 'person', 'individual'],
  'firm': ['firm', 'company', 'organization', 'org', 'fund', 'investment firm', 'family office', 'capital', 'partners', 'management', 'advisory', 'holdings', 'family office'],
  'location': ['location', 'city', 'hq', 'place', 'region', 'area', 'geography', 'headquarters', 'office', 'base'],
  'linkedin': ['linkedin', 'linkedin url', 'linkedin profile', 'li', 'linkedin.com'],
  'website': ['website', 'url', 'web', 'site', 'homepage', 'web address'],
  'aum': ['aum', 'assets', 'fund size', 'assets under management', 'capital under management', 'total assets', 'assets managed', 'fund assets'],
  'notes': ['description', 'summary', 'about', 'overview', 'details', 'information', 'profile', 'notes'],
  'personalConnections': ['connections', 'connection count', 'conns', 'network size', 'network', 'connections count', 'total connections', 'network connections', '1st tier', '2nd tier', '3rd tier'],
  'email': ['email', 'email address', 'contact email'],
  'role': ['role', 'title', 'position', 'job title'],
  'twitter': ['twitter', 'twitter url', 'twitter profile', 'twitter.com'],
  'interests': ['interests', 'hobbies', 'likes', 'topics'],
  'school': ['school', 'education', 'university', 'college', 'alma mater', 'academic'],
};

/**
 * Normalize headers by matching against known patterns and aliases
 */
export function normalizeHeaders(headers: string[]): string[] {
  return headers.map(h => {
    const cleaned = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for URL-like headers
    if (h.match(/^https?:\/\//)) {
      if (h.includes('linkedin.com')) return 'linkedin';
      return 'website';
    }

    // Check for firm-like headers
    if (h.match(/(?:capital|partners|management|holdings|group|fund|investments|ventures|advisors|advisory)/i)) {
      return 'firm';
    }

    // Check headerMap
    for (const [key, aliases] of Object.entries(headerMap)) {
      if (aliases.some(alias => cleaned.includes(alias))) {
        return key;
      }
    }

    // Check for location-like headers
    if (h.match(/(?:city|location|region|area|hq|headquarters|office|base)/i)) {
      return 'location';
    }

    return cleaned;
  });
}

/**
 * Infer field type from value content using regex and pattern matching
 */
export function inferFieldFromValue(value: string): keyof LPContact | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();

  // Patterns for websites
  if (/^https?:\/\/[^ ]+\.(com|org|net|io|ai|co|vc|xyz)/.test(v)) {
    if (v.includes('linkedin.com')) {
      return 'linkedin';
    }
    if (v.includes('twitter.com')) {
      return 'twitter';
    }
    return 'website';
  }

  // Email detection
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)) {
    return 'email';
  }

  // Location detection
  const locationTerms = ['nyc', 'new york', 'san francisco', 'london', 'boston', 'la', 'chicago', 'austin', 'singapore', 'hong kong', 'dubai', 'tokyo', 'paris', 'berlin', 'miami', 'los angeles', 'seattle', 'toronto', 'vancouver', 'sydney', 'melbourne'];
  if (locationTerms.some(term => v.includes(term)) || /[a-z]+,\s*[a-z]{2}/i.test(v)) {
    return 'location';
  }

  // AUM detection
  if (/\$[\d,]+(\.\d{2})?/.test(v) || /\d+ ?(mm|m|b|bn)/.test(v)) {
    return 'aum' as keyof LPContact;
  }

  // Personal connections detection
  if (v.includes('1st tier') || v.includes('connection') || v.includes('family office') || 
      v.includes('introduced') || v.includes('connected') || v.includes('knows') || 
      v.includes('met') || v.includes('introduction') || v.includes('referral')) {
    return 'personalConnections';
  }

  // Notes fallback for longer text
  if (v.length > 20 && /\s/.test(v)) {
    return 'notes';
  }

  return null;
}

/**
 * Calculate string similarity for fuzzy matching
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = cleanStringForComparison(str1);
  const s2 = cleanStringForComparison(str2);
  const distance = editDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return maxLength > 0 ? 1 - distance / maxLength : 1;
}

/**
 * Clean string for comparison by removing non-alphanumeric characters and converting to lowercase
 */
export function cleanStringForComparison(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculate edit distance between two strings
 */
export function editDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Match a field from a header based on similarity
 */
export function matchFieldFromHeader(header: string): keyof LPContact | null {
  const cleaned = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Special case for Family Office column
  if (cleaned === 'familyoffice') {
    return 'firm';
  }
  
  let bestMatch: keyof LPContact | null = null;
  let bestScore = 0;

  for (const [key, aliases] of Object.entries(headerMap)) {
    for (const alias of aliases) {
      const score = calculateSimilarity(cleaned, alias);
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = key as keyof LPContact;
      }
    }
  }

  return bestMatch;
}

/**
 * Extract LinkedIn URL from text
 */
export function extractLinkedInURL(text: string): string | null {
  const match = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+(?:\/)?/);
  return match ? match[0] : null;
}

/**
 * Clean amount string to number
 */
export function cleanAmountStringToNumber(amountStr: string): number | null {
  // Remove non-numeric characters except for decimal points
  const cleaned = amountStr.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract text from between parentheses
 */
export function extractFromText(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

/**
 * Validate if string is a valid email
 */
export function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

/**
 * Validate if string is a valid LinkedIn URL
 */
export function isValidLinkedInUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+(?:\/)?/.test(url);
}

/**
 * Validate if string is a valid website URL
 */
export function isValidWebsiteUrl(url: string): boolean {
  return /^https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}/.test(url);
}

/**
 * Create a slug from a string
 */
export function createSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Normalize firm name
 */
export function normalizeFirmName(value: string): string {
  return value.trim()
    .replace(/\s+/g, ' ')
    .replace(/,\s*LLC$|,\s*LP$|,\s*Inc\.?$|,\s*Ltd\.?$/i, '');
}

/**
 * Normalize person name
 */
export function normalizePersonName(value: string): string {
  return value.trim()
    .replace(/\s+/g, ' ')
    .replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s+/, '');
}

/**
 * Normalize email
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normalize role/title
 */
export function normalizeRole(value: string): string {
  return value.trim()
    .replace(/\s+/g, ' ')
    .replace(/^(The|A|An)\s+/i, '');
}

/**
 * Normalize location
 */
export function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize AUM value
 */
export function normalizeAUM(value: string): string {
  return value.trim()
    .replace(/\s+/g, ' ')
    .replace(/^(AUM|Assets|Assets Under Management|Fund Size):\s*/i, '');
}

/**
 * Normalize LinkedIn URL
 */
export function normalizeLinkedIn(value: string): string {
  const extracted = extractLinkedInURL(value);
  if (extracted) return extracted;
  
  // Handle cases where only the username is provided
  if (value.trim().match(/^[a-zA-Z0-9_-]+$/) && !value.includes('/')) {
    return `https://www.linkedin.com/in/${value.trim()}/`;
  }
  
  return value.trim();
}

/**
 * Normalize website URL
 */
export function normalizeWebsite(value: string): string {
  let url = value.trim();
  
  // Add https:// if missing
  if (url && !url.startsWith('http')) {
    url = `https://${url}`;
  }
  
  return url;
} 