/**
 * Represents a node in a connection path
 */
export interface ConnectionStep {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

/**
 * Represents an edge/relationship in a connection path
 */
export interface ConnectionEdge {
  type: string;
  properties: Record<string, any>;
}

/**
 * Represents a complete path result with confidence and metadata
 */
export interface PathResult {
  path: (ConnectionStep | ConnectionEdge)[];
  confidence: number;
  sources: string[];
  recommendedAction: string;
}

export interface ScoringWeights {
  maxHops: number;
  minScore: number;
  pathLengthWeight: number;
  connectionTypeWeight: number;
  connectionStrengthWeight: number;
  mutualTiesWeight: number;
}

export interface PathNode {
  id: string;
  type: 'Person' | 'Firm' | 'School';
  name: string;
  source?: string;
  confidence?: number;
  isFourBridge?: boolean;
  sharedFirm?: boolean;
}

export interface PathConnection {
  type: string;
  strength: number;
  direction: 'OUT' | 'IN' | 'BIDIRECTIONAL';
  properties?: Record<string, any>;
}

export interface ScoredPath {
  path: (PathNode | PathConnection)[];
  score: number;
  normalizedScore?: number;  // Score normalized to [0,1] range
  metadata: {
    pathLength: number;
    connectionTypes: string[];
    mutualTies: string[];
    minScore?: number;  // Minimum score in the result set
    maxScore?: number;  // Maximum score in the result set
  };
} 