import { PathResult } from '../query/pathfinder';

interface ResultsPageProps {
  results: PathResult[];
  isLoading?: boolean;
  error?: string;
}

export function ResultsPage({ results, isLoading = false, error }: ResultsPageProps) {
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Finding connection paths...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-600">
          No connection paths found.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4">Top Connection Paths</h2>
      <div className="space-y-4">
        {results.slice(0, 3).map((result, index) => (
          <div
            key={index}
            className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Path {index + 1}</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  Confidence: {Math.round(result.confidence * 100)}%
                </span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {result.sources.join(', ')}
                </span>
              </div>
            </div>
            <p className="text-gray-600 mb-3">{result.recommendedAction}</p>
            <div className="text-sm text-gray-500">
              <details>
                <summary className="cursor-pointer hover:text-gray-700">
                  View Path Details
                </summary>
                <div className="mt-2 pl-4 border-l-2 border-gray-200">
                  {result.path.map((item, i) => (
                    <div key={i} className="mb-1">
                      {!('type' in item) ? (
                        <span className="font-medium">{item.properties.name}</span>
                      ) : (
                        <span className="text-gray-500">
                          {item.type} ({item.properties.role})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
