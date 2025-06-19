import React, { useState } from 'react';
import { ConnectionSearchForm } from '../components/ConnectionSearchForm';
import { ConnectionResultsList } from '../components/ConnectionResultsList';
import { PathResult } from '../../types/path';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PathResult[]>([]);
  const [queryTime, setQueryTime] = useState<number>();

  const handleSearch = async (sourceId: string, targetId: string) => {
    setIsLoading(true);
    try {
      const startTime = Date.now();
      const response = await fetch('/api/query-paths', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceId, targetId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch results');
      }

      const data = await response.json();
      setResults(data.paths);
      setQueryTime(data.requestTime || (Date.now() - startTime));
    } catch (error) {
      console.error('Error fetching results:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="relative px-4 py-10 bg-white mx-8 md:mx-0 shadow rounded-3xl sm:p-10">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <h1 className="text-2xl font-bold text-gray-900 mb-8">Find Connections</h1>
                <ConnectionSearchForm onSubmit={handleSearch} isLoading={isLoading} />
                <div className="mt-8">
                  <ConnectionResultsList 
                    results={results} 
                    queryTime={queryTime}
                    isLoading={isLoading}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 