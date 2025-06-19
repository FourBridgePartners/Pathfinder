import { LPContact } from './index';
import { ScoredPath } from './path';

export type MatchType = 'exact' | 'fuzzy' | 'enriched' | 'unknown';

export interface ResolvedTarget {
  // If matched to existing node
  targetNodeId?: string;
  targetName?: string;
  targetType?: 'Person' | 'Firm';
  connectionPaths?: ScoredPath[];
  
  // If enriched from external source
  enrichedPerson?: LPContact;
  enrichedFirm?: {
    name: string;
    type: string;
    website?: string;
    linkedin?: string;
    location?: string;
    description?: string;
    source: {
      type: string;
      url?: string;
      timestamp: string;
    };
  };
  
  // Metadata about the resolution
  metadata: {
    matchType: MatchType;
    query: string;
    source: 'local' | 'external';
    confidence?: number;
    notes: string[];
  };
}

export interface ResolverOptions {
  debug?: boolean;
  minSimilarity?: number;
  enrichOnMiss?: boolean;
  findPaths?: boolean;
} 