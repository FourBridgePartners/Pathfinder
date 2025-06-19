import React, { useState } from 'react';
import { ConnectionSearchForm } from '../components/ConnectionSearchForm';
import { ConnectionResultsList } from '../components/ConnectionResultsList';
import { findConnectionPaths } from '../utils/api';
import { PathResult } from '../../types/path';

export const ConnectionPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PathResult[]>([]);
  const [queryTime, setQueryTime] = useState<number | null>(null);

  const handleSearch = async (sourceId: string, targetId: string) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    setQueryTime(null);

    try {
      const { paths, requestTime } = await findConnectionPaths(sourceId, targetId);
      setResults(paths);
      setQueryTime(requestTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Find Connection Paths</h1>
      
      <div className="mb-8">
        <ConnectionSearchForm 
          onSubmit={handleSearch}
          isLoading={isLoading}
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="max-h-[600px] overflow-y-auto">
        <ConnectionResultsList 
          results={results}
          queryTime={queryTime ?? undefined}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}; 