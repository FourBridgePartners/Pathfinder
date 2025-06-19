import { useState, useCallback } from 'react';

interface PathwayResult {
  rank: number;
  nodes: any[];
  summary: string;
  score: number;
  via: string[];
  mutualCount: number;
  distance: number;
  raw: any;
}

export function usePathways() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PathwayResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPathways = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/pathways?target=${encodeURIComponent(target)}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Unknown error');
        setLoading(false);
        return;
      }
      const results = await res.json();
      setData(results);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, data, error, fetchPathways };
} 