import { useState, useEffect } from 'react';

export function useDiscoveryHistory() {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/discovery/history')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to fetch discovery history');
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
} 