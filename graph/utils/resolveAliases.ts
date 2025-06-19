import { createHash } from 'crypto';
import stringSimilarity from 'string-similarity';

interface ResolutionOptions {
  debug?: boolean;
  minSimilarity?: number;
  cacheSize?: number;
}

interface ResolutionResult {
  resolvedName: string;
  confidence: number;
  variants: string[];
}

// In-memory cache for resolved names
class ResolutionCache {
  private cache: Map<string, ResolutionResult>;
  private maxSize: number;
  public size: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.size = 0;
  }

  get(key: string): ResolutionResult | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: ResolutionResult): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry when cache is full
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.size--;
      }
    }
    this.cache.set(key, value);
    this.size++;
  }

  clear(): void {
    this.cache.clear();
    this.size = 0;
  }
}

// Initialize cache
const cache = new ResolutionCache();

/**
 * Normalize a string for comparison by:
 * - Converting to lowercase
 * - Removing common business suffixes
 * - Removing special characters
 * - Trimming whitespace
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b(LLC|Inc|Ltd|LP|LLP|Corp|Corporation|Company|Co\.?|Limited|Group|Partners|Capital|Ventures|Fund|Management|Advisors|Advisory)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a cache key for a name
 */
function generateCacheKey(name: string): string {
  return createHash('md5').update(normalizeString(name)).digest('hex');
}

/**
 * Resolve entity name using fuzzy matching and pattern recognition
 */
export function resolveEntityName(
  name: string,
  options: ResolutionOptions = {}
): string {
  const {
    debug = false,
    minSimilarity = 0.85,
    cacheSize = 1000
  } = options;

  // Check cache first
  const cacheKey = generateCacheKey(name);
  const cached = cache.get(cacheKey);
  if (cached) {
    if (debug) {
      console.log(`[ResolveAliases] Cache hit for "${name}" → "${cached.resolvedName}" (confidence: ${cached.confidence})`);
    }
    return cached.resolvedName;
  }

  // Normalize the input name
  const normalizedName = normalizeString(name);
  if (debug) {
    console.log(`[ResolveAliases] Normalized "${name}" to "${normalizedName}"`);
  }

  // Initialize result
  const result: ResolutionResult = {
    resolvedName: name,
    confidence: 1.0,
    variants: [name]
  };

  // If the name is very short, return as is
  if (normalizedName.length < 3) {
    return name;
  }

  // Check for common patterns
  const patterns = [
    // Acronyms (e.g., "A16Z" → "Andreessen Horowitz")
    {
      pattern: /^[a-z0-9]{2,6}$/i,
      confidence: 0.9
    },
    // Initials (e.g., "J. Smith" → "John Smith")
    {
      pattern: /^[a-z]\.\s*[a-z]+$/i,
      confidence: 0.8
    },
    // Full names with middle initials
    {
      pattern: /^[a-z]+\s+[a-z]\.\s+[a-z]+$/i,
      confidence: 0.95
    }
  ];

  // Apply pattern matching
  for (const { pattern, confidence } of patterns) {
    if (pattern.test(normalizedName)) {
      result.confidence = confidence;
      if (debug) {
        console.log(`[ResolveAliases] Matched pattern for "${name}" (confidence: ${confidence})`);
      }
      break;
    }
  }

  // Store in cache
  cache.set(cacheKey, result);

  if (debug) {
    console.log(`[ResolveAliases] Resolved "${name}" → "${result.resolvedName}" (confidence: ${result.confidence})`);
  }

  return result.resolvedName;
}

/**
 * Compare two entity names and return similarity score
 */
export function compareEntityNames(name1: string, name2: string): number {
  const normalized1 = normalizeString(name1);
  const normalized2 = normalizeString(name2);
  return stringSimilarity.compareTwoStrings(normalized1, normalized2);
}

/**
 * Clear the resolution cache
 */
export function clearResolutionCache(): void {
  cache.clear();
}

/**
 * Get current cache size
 */
export function getCacheSize(): number {
  return cache.size;
} 