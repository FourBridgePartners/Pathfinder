import { useSession } from '../hooks/useSession';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { usePathways } from '../hooks/usePathways';

function PathSummary({ nodes }: { nodes: any[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {nodes.map((n, idx) => {
        const name = n.properties?.name || n.name;
        const linkedin = n.properties?.linkedinUrl || n.linkedinUrl;
        const isLast = idx === nodes.length - 1;
        return (
          <span key={idx} className="flex items-center">
            {linkedin ? (
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline hover:text-blue-900"
              >
                {name}
              </a>
            ) : (
              <span>{name}</span>
            )}
            {!isLast && <span className="mx-1 text-gray-400">→</span>}
          </span>
        );
      })}
    </span>
  );
}

export default function SearchPage() {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();
  const [input, setInput] = useState('');
  const { loading, data, error, fetchPathways } = usePathways();
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace('/login');
    }
  }, [user, sessionLoading, router]);

  if (sessionLoading) return <div>Loading...</div>;
  if (!user) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    fetchPathways(input.trim());
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-8">
        <h1 className="text-3xl font-bold text-center mb-6">Pathway Discovery</h1>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <input
            type="text"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter a name or LinkedIn profile URL"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 disabled:opacity-50"
            disabled={loading || !input.trim()}
          >
            Search
          </button>
        </form>
        {loading && (
          <div className="flex flex-col items-center mt-8">
            <div className="mb-2 text-blue-700 font-medium text-center">
              Discovering teammates, resolving mutuals, and ranking paths…
            </div>
            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        )}
        {error && (
          <div className="text-red-600 text-center mt-4">{error}</div>
        )}
        {submitted && !loading && data && data.length === 0 && !error && (
          <div className="text-gray-500 text-center mt-8">
            <p>No connection paths found to your target.<br />Try a different name or LinkedIn URL.</p>
          </div>
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto mt-8">
            <table className="min-w-full bg-white rounded-lg shadow">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Path Summary</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strength Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Discovered Via</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => {
                  const isTop = idx === 0;
                  const score = row.score || 0;
                  let scoreColor = 'text-gray-700';
                  if (score >= 0.85) scoreColor = 'text-green-600 font-bold';
                  else if (score >= 0.7) scoreColor = 'text-yellow-600 font-semibold';
                  else if (score >= 0.5) scoreColor = 'text-orange-600';
                  return (
                    <tr
                      key={idx}
                      className={`border-t ${isTop ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-4 py-2 font-semibold text-center">
                        {isTop && <span title="Top Path" className="mr-1 text-yellow-500">★</span>}
                        {row.rank}
                      </td>
                      <td className="px-4 py-2">
                        <PathSummary nodes={row.nodes} />
                      </td>
                      <td className={`px-4 py-2 text-center ${scoreColor}`}>{score.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">{Array.isArray(row.via) ? row.via.join(', ') : row.via}</td>
                      <td className="px-4 py-2 flex gap-2 justify-center">
                        <button
                          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-xs"
                          onClick={() => navigator.clipboard.writeText(row.summary)}
                          title="Copy Path"
                        >
                          Copy Path
                        </button>
                        {/* Expand CTA could show more details in a modal or drawer in the future */}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
} 