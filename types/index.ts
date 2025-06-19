import { GraphNode, GraphRelationship } from './graph';

export interface Connection {
  name: string;
  currentRole?: string;
  currentCompany?: string;
  mutualConnections?: number;
  direction?: 'incoming' | 'outgoing' | 'mutual';
  connectionStrength?: number;
  lastSeen?: string;
  notes?: string;
  source?: string;
}

// Graph Types
export type { GraphNode, GraphRelationship } from './graph';

export interface LPContact {
  id?: string | null;
  name: string;
  email?: string | null;
  firm?: string | null;
  firmSlug?: string | null;
  role?: string | null;
  title?: string | null;
  school?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  location?: string | null;
  jobHistoryRaw?: string | null;
  educationRaw?: string | null;
  website?: string | null;
  notes?: string | null;
  personalConnections?: Connection[] | string | null;
  interests?: string | null;
  source?: {
    type: string;
    filename?: string;
    importedAt?: string;
  };
  degree?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  confidence?: {
    overall: number;
    [key: string]: number;
  };
  rawContent?: string; // Raw content from source for debugging/audit
}

export interface JobHistory {
  company: string;
  title: string;
  startYear: number;
  endYear?: number;
  isCurrent?: boolean;
  source: {
    type: 'linkedin' | 'press' | 'bio';
    confidence: number;
    url?: string;
  };
}

export interface JobHistoryResponse {
  person: string;
  jobs: Array<{
    company: string;
    title?: string;
    startYear?: number;
    endYear?: number;
  }>;
}

export interface GraphBatch {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}
