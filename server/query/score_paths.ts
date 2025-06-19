import { GraphNode, GraphRelationship } from '../../types';
import type { ConnectionStep, ConnectionEdge } from '../../types/path';

interface ScoredPath {
  path: (GraphNode | GraphRelationship)[];
  score: number;
  metadata: {
    sourceTypes: string[];
    strongestLink?: string;
    notes?: string[];
  };
}

// Relationship type weights
const RELATIONSHIP_WEIGHTS: Record<string, number> = {
  'WORKED_AT': 1.0,
  'ATTENDED_SCHOOL': 0.7,
  'INVESTED_IN': 0.8,
  'BOARD_MEMBER': 0.9,
  'FOUNDED': 0.95,
  'KNOWS': 0.85
};

// Default weight for unknown relationship types
const DEFAULT_RELATIONSHIP_WEIGHT = 0.5;

/**
 * Score a single segment (node + relationship) in the path
 */
function scoreSegment(
  node: GraphNode,
  relationship: GraphRelationship | null,
  nextNode: GraphNode | null
): { score: number; sourceType?: string; notes: string[] } {
  let score = 1.0;
  const notes: string[] = [];
  let sourceType: string | undefined;

  // Check node confidence if available
  if (node.properties.confidence) {
    score *= node.properties.confidence;
    notes.push(`Node confidence: ${node.properties.confidence}`);
  }

  // Score relationship if present
  if (relationship) {
    // Base score from relationship type
    const typeWeight = RELATIONSHIP_WEIGHTS[relationship.type] || DEFAULT_RELATIONSHIP_WEIGHT;
    score *= typeWeight;
    notes.push(`Relationship type ${relationship.type}: ${typeWeight}`);

    // Check relationship properties
    if (relationship.properties) {
      // Boost for current positions
      if (relationship.properties.isCurrent) {
        score *= 1.2;
        notes.push('Current position boost: 1.2x');
      }

      // Boost for recent end dates
      if (relationship.properties.endYear) {
        const endYear = typeof relationship.properties.endYear === 'object' && 'toNumber' in relationship.properties.endYear
          ? relationship.properties.endYear.toNumber()
          : Number(relationship.properties.endYear);
        const yearsAgo = new Date().getFullYear() - endYear;
        if (yearsAgo <= 2) {
          score *= 1.1;
          notes.push('Recent end date boost: 1.1x');
        }
      }

      // Use source confidence if available
      if (relationship.properties.sourceConfidence) {
        score *= relationship.properties.sourceConfidence;
        sourceType = relationship.properties.sourceType;
        notes.push(`Source confidence: ${relationship.properties.sourceConfidence}`);
      }
    }
  }

  return { score, sourceType, notes };
}

/**
 * Score an entire path and return a ScoredPath object
 */
export function scorePath(path: (GraphNode | GraphRelationship)[]): ScoredPath {
  const sourceTypes = new Set<string>();
  const allNotes: string[] = [];
  let totalScore = 0;
  let segmentCount = 0;
  let strongestLink: string | undefined;
  let strongestScore = 0;

  // Process each segment (node + relationship)
  for (let i = 0; i < path.length - 1; i += 2) {
    const node = path[i] as GraphNode;
    const relationship = path[i + 1] as GraphRelationship;
    const nextNode = i + 2 < path.length ? path[i + 2] as GraphNode : null;

    const { score, sourceType, notes } = scoreSegment(node, relationship, nextNode);
    
    totalScore += score;
    segmentCount++;
    allNotes.push(...notes);

    if (sourceType) {
      sourceTypes.add(sourceType);
    }

    // Track strongest link
    if (score > strongestScore) {
      strongestScore = score;
      strongestLink = `${node.properties.name} → ${relationship.type} → ${nextNode?.properties.name}`;
    }
  }

  // Calculate average score
  const averageScore = segmentCount > 0 ? totalScore / segmentCount : 0;

  return {
    path,
    score: averageScore,
    metadata: {
      sourceTypes: Array.from(sourceTypes),
      strongestLink,
      notes: allNotes
    }
  };
}

/**
 * Score and sort multiple paths
 */
export function scoreAndSortPaths(paths: (GraphNode | GraphRelationship)[][]): ScoredPath[] {
  return paths
    .map(scorePath)
    .sort((a, b) => b.score - a.score);
}

// Helper to extract sources from a path
function extractSources(path: (ConnectionStep | ConnectionEdge)[]): string[] {
  const sources = new Set<string>();
  for (const item of path) {
    if (item.properties?.sourceType) {
      sources.add(item.properties.sourceType);
    }
  }
  return Array.from(sources);
} 