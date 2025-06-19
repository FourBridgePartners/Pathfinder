import type { NextApiRequest, NextApiResponse } from 'next';
import { PathResult } from '../../../types/path';

// Mock data for testing
const mockPaths: PathResult[] = [
  {
    confidence: 0.92,
    recommendedAction: "Reach out directly through LinkedIn",
    sources: ["LinkedIn", "Company Website"],
    path: [
      {
        id: "1",
        labels: ["Person"],
        properties: { name: "Alice" }
      },
      {
        type: "WORKED_AT",
        properties: { role: "Software Engineer" }
      },
      {
        id: "2",
        labels: ["Company"],
        properties: { name: "Acme Corp" }
      },
      {
        type: "CONNECTED_TO",
        properties: { strength: "Strong" }
      },
      {
        id: "3",
        labels: ["Person"],
        properties: { name: "Charlie" }
      }
    ]
  }
];

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { sourceId, targetId } = req.body || {};

  // Artificial delay for loading indicator
  await delay(500);

  // Only return mock data for specific known IDs
  if (sourceId === 'source123' && targetId === 'target456') {
    return res.status(200).json({ paths: mockPaths, requestTime: 42 });
  }

  // Otherwise, return no results
  return res.status(200).json({ paths: [], requestTime: 42 });
} 