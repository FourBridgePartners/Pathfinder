import React from 'react';
import { PathResult, ConnectionStep, ConnectionEdge } from '../../types/path';

interface ConnectionResultsListProps {
  results: PathResult[];
  queryTime?: number;
  isLoading?: boolean;
}

export const ConnectionResultsList: React.FC<ConnectionResultsListProps> = ({ 
  results = [],
  queryTime,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div data-testid="loading-indicator" className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Finding connections...</p>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div data-testid="no-results-message" className="text-center py-8 text-gray-500">
        No connection paths found
      </div>
    );
  }

  const renderPathElement = (element: ConnectionStep | ConnectionEdge, index: number) => {
    if ('type' in element) {
      // It's a ConnectionEdge
      return (
        <div key={index} className="flex items-center text-gray-600">
          <span className="mx-2">→</span>
          <span className="font-medium">{element.type}</span>
          {element.properties && Object.keys(element.properties).length > 0 && (
            <span className="ml-2 text-sm text-gray-500">
              ({Object.entries(element.properties).map(([key, value]) => 
                `${key}: ${value}`
              ).join(', ')})
            </span>
          )}
        </div>
      );
    } else {
      // It's a ConnectionStep
      return (
        <div key={index} className="flex items-center">
          <span className="font-medium">{element.properties.name}</span>
          <span className="ml-2 text-sm text-gray-500">
            ({element.labels.join(', ')})
          </span>
        </div>
      );
    }
  };

  return (
    <div data-testid="connection-results" className="space-y-6">
      {queryTime && (
        <div className="text-sm text-gray-500">
          Query completed in {queryTime}ms
        </div>
      )}
      
      {results.map((result, index) => (
        <div key={index} className="bg-white rounded-lg shadow p-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-indigo-600">
              Recommended Action
            </h3>
            <p data-testid="recommended-action" className="mt-1">{result.recommendedAction}</p>
          </div>

          <div className="mb-4">
            <div className="flex items-center text-sm text-gray-500">
              <span className="font-medium">Confidence:</span>
              <span data-testid="confidence-score" className="ml-2">
                {Math.round(result.confidence * 100)}%
              </span>
            </div>
            <div className="flex items-center text-sm text-gray-500">
              <span className="font-medium">Sources:</span>
              <span data-testid="sources-list" className="ml-2">
                {result.sources.join(', ')}
              </span>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Connection Path:</h4>
            <div data-testid="path-display" className="space-y-2">
              {result.path.map((element, pathIndex) => renderPathElement(element, pathIndex))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}; 