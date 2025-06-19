import { describe, it, expect } from 'vitest';
import { scorePath, scoreAndSortPaths } from '../score_paths';
import type { GraphNode, GraphRelationship } from '@/types';

interface Path {
  segments: Array<{
    startNode: GraphNode;
    relationship: GraphRelationship;
    endNode: GraphNode;
  }>;
}

describe('Path Scoring', () => {
  // Mock data
  const mockPerson1: GraphNode = {
    id: '1',
    labels: ['Person'],
    properties: {
      name: 'John Smith',
      confidence: 0.9
    }
  };

  const mockPerson2: GraphNode = {
    id: '2',
    labels: ['Person'],
    properties: {
      name: 'Jane Doe',
      confidence: 0.95
    }
  };

  const mockFirm: GraphNode = {
    id: '3',
    labels: ['Firm'],
    properties: {
      name: 'Acme Corp',
      confidence: 1.0
    }
  };

  const mockWorkedAt: GraphRelationship = {
    id: '4',
    type: 'WORKED_AT',
    fromId: '1',
    toId: '3',
    properties: {
      isCurrent: true,
      source: {
        type: 'linkedin',
        confidence: 0.9
      }
    }
  };

  const mockAttendedSchool: GraphRelationship = {
    id: '5',
    type: 'ATTENDED_SCHOOL',
    fromId: '2',
    toId: '3',
    properties: {
      endYear: new Date().getFullYear() - 1,
      source: {
        type: 'manual',
        confidence: 0.8
      }
    }
  };

  it('should score a path with current work relationship higher', () => {
    const path = [mockPerson1, mockWorkedAt, mockFirm];
    const result = scorePath(path);

    expect(result.score).toBeGreaterThan(0.8); // High score due to current position
    expect(result.metadata.sourceTypes).toContain('linkedin');
    expect(result.metadata.strongestLink).toContain('WORKED_AT');
    expect(result.metadata.notes).toContain('Current position boost: 1.2x');
  });

  it('should score a path with school relationship lower', () => {
    const path = [mockPerson2, mockAttendedSchool, mockFirm];
    const result = scorePath(path);

    expect(result.score).toBeLessThan(0.8); // Lower score due to school relationship
    expect(result.metadata.sourceTypes).toContain('manual');
    expect(result.metadata.strongestLink).toContain('ATTENDED_SCHOOL');
  });

  it('should sort paths by score', () => {
    const paths = [
      [mockPerson2, mockAttendedSchool, mockFirm],
      [mockPerson1, mockWorkedAt, mockFirm]
    ];

    const results = scoreAndSortPaths(paths);

    // Work relationship should be first due to higher score
    const firstPath = results[0].path;
    const secondPath = results[1].path;
    const firstRelationship = firstPath[1] as GraphRelationship;
    const secondRelationship = secondPath[1] as GraphRelationship;

    expect(firstRelationship.type).toBe('WORKED_AT');
    expect(secondRelationship.type).toBe('ATTENDED_SCHOOL');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('should handle paths with missing confidence values', () => {
    const path = [
      { ...mockPerson1, properties: { name: 'John Smith' } },
      mockWorkedAt,
      mockFirm
    ];

    const result = scorePath(path);
    expect(result.score).toBeGreaterThan(0);
    expect(result.metadata.notes).not.toContain('Node confidence');
  });

  it('should score a path with multiple segments', () => {
    const path: Path = {
      segments: [
        {
          startNode: {
            id: '1',
            labels: ['Person'],
            properties: {
              name: 'Alice',
              confidence: 0.9,
            },
          },
          relationship: {
            id: '1_2_WORKED_AT',
            type: 'WORKED_AT',
            fromId: '1',
            toId: '2',
            properties: {
              startYear: 2010,
              endYear: 2015,
              isCurrent: false,
              sourceType: 'linkedin',
              sourceConfidence: 0.9,
            },
          },
          endNode: {
            id: '2',
            labels: ['Company'],
            properties: {
              name: 'Acme Corp',
              confidence: 0.8,
            },
          },
        },
        {
          startNode: {
            id: '2',
            labels: ['Company'],
            properties: {
              name: 'Acme Corp',
              confidence: 0.8,
            },
          },
          relationship: {
            id: '2_3_HAS_EMPLOYEE',
            type: 'HAS_EMPLOYEE',
            fromId: '2',
            toId: '3',
            properties: {
              startYear: 2015,
              isCurrent: true,
              sourceType: 'linkedin',
              sourceConfidence: 0.9,
            },
          },
          endNode: {
            id: '3',
            labels: ['Person'],
            properties: {
              name: 'Bob',
              confidence: 0.9,
            },
          },
        },
      ],
    };

    const result = scorePath(path.segments.flatMap(s => [s.startNode, s.relationship, s.endNode]));

    expect(result.score).toBeGreaterThan(0);
    expect(result.metadata).toEqual({
      segmentScores: expect.arrayContaining([
        expect.objectContaining({
          score: expect.any(Number),
          factors: expect.objectContaining({
            nodeConfidence: expect.any(Number),
            relationshipType: expect.any(Number),
            recency: expect.any(Number),
          }),
        }),
      ]),
      totalSegments: 2,
      averageConfidence: expect.any(Number),
    });
  });

  it('should sort paths by score', () => {
    const paths: Path[] = [
      {
        segments: [
          {
            startNode: {
              id: '1',
              labels: ['Person'],
              properties: { name: 'Alice', confidence: 0.9 },
            },
            relationship: {
              id: '1_2_WORKED_AT',
              type: 'WORKED_AT',
              fromId: '1',
              toId: '2',
              properties: {
                startYear: 2010,
                endYear: 2015,
                isCurrent: false,
                sourceType: 'linkedin',
                sourceConfidence: 0.9,
              },
            },
            endNode: {
              id: '2',
              labels: ['Company'],
              properties: { name: 'Acme Corp', confidence: 0.8 },
            },
          },
        ],
      },
      {
        segments: [
          {
            startNode: {
              id: '1',
              labels: ['Person'],
              properties: { name: 'Alice', confidence: 0.9 },
            },
            relationship: {
              id: '1_3_ATTENDED_SCHOOL',
              type: 'ATTENDED_SCHOOL',
              fromId: '1',
              toId: '3',
              properties: {
                startYear: 2000,
                endYear: 2004,
                isCurrent: false,
                sourceType: 'linkedin',
                sourceConfidence: 0.9,
              },
            },
            endNode: {
              id: '3',
              labels: ['School'],
              properties: { name: 'Harvard', confidence: 0.9 },
            },
          },
        ],
      },
    ];

    const result = scoreAndSortPaths(paths.map(p => p.segments.flatMap(s => [s.startNode, s.relationship, s.endNode])));

    expect(result).toHaveLength(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it('should handle paths with no segments', () => {
    const path: Path = {
      segments: [],
    };

    const result = scorePath(path.segments.flatMap(s => [s.startNode, s.relationship, s.endNode]));

    expect(result.score).toBe(0);
    expect(result.metadata).toEqual({
      segmentScores: [],
      totalSegments: 0,
      averageConfidence: 0,
    });
  });

  it('should handle paths with missing properties', () => {
    const path: Path = {
      segments: [
        {
          startNode: {
            id: '1',
            labels: ['Person'],
            properties: { name: 'Alice' },
          },
          relationship: {
            id: '1_2_WORKED_AT',
            type: 'WORKED_AT',
            fromId: '1',
            toId: '2',
            properties: {},
          },
          endNode: {
            id: '2',
            labels: ['Company'],
            properties: { name: 'Acme Corp' },
          },
        },
      ],
    };

    const result = scorePath(path.segments.flatMap(s => [s.startNode, s.relationship, s.endNode]));

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.metadata).toEqual({
      segmentScores: expect.arrayContaining([
        expect.objectContaining({
          score: expect.any(Number),
          factors: expect.objectContaining({
            nodeConfidence: expect.any(Number),
            relationshipType: expect.any(Number),
            recency: expect.any(Number),
          }),
        }),
      ]),
      totalSegments: 1,
      averageConfidence: expect.any(Number),
    });
  });
}); 