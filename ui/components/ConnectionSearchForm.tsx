import React, { useState } from 'react';

interface ConnectionSearchFormProps {
  onSubmit: (sourceId: string, targetId: string) => void;
  isLoading?: boolean;
}

export const ConnectionSearchForm: React.FC<ConnectionSearchFormProps> = ({ 
  onSubmit,
  isLoading = false
}) => {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceId && targetId) {
      onSubmit(sourceId, targetId);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white rounded-lg shadow">
      <div>
        <label htmlFor="sourceId" className="block text-sm font-medium text-gray-700">
          Source ID
        </label>
        <input
          type="text"
          id="sourceId"
          data-testid="source-input"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Enter source ID"
          required
        />
      </div>

      <div>
        <label htmlFor="targetId" className="block text-sm font-medium text-gray-700">
          Target ID
        </label>
        <input
          type="text"
          id="targetId"
          data-testid="target-input"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Enter target ID"
          required
        />
      </div>

      <button
        type="submit"
        data-testid="submit-button"
        disabled={isLoading || !sourceId || !targetId}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
      >
        {isLoading ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Searching...
          </span>
        ) : (
          'Find Connections'
        )}
      </button>
    </form>
  );
}; 