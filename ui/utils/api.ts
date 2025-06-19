import { PathResult } from '../../types/path';

interface ConnectionResponse {
  success: boolean;
  paths: PathResult[];
  requestTime: number;
}

export async function findConnectionPaths(sourceId: string, targetId: string): Promise<{ paths: PathResult[]; requestTime: number }> {
  const res = await fetch('/api/find-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceId, targetId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.details || 'Failed to find connection paths');
  }

  const data = await res.json() as ConnectionResponse;
  return {
    paths: data.paths,
    requestTime: data.requestTime
  };
} 