import { useSession } from '../hooks/useSession';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useDiscoveryHistory } from '../hooks/useDiscoveryHistory';
import { useState } from 'react';

export default function PathwaysPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) return <div>Loading...</div>;
  if (!user) return null;

  // ...existing pathways page content...
  return (
    <div>
      {/* Pathways page content here */}
      <h1>Pathways</h1>
    </div>
  );
}

const columns = [
  { key: 'input', label: 'Input' },
  { key: 'input_type', label: 'Type' },
  { key: 'total_people', label: '# People' },
  { key: 'total_mutuals', label: '# Mutuals' },
  { key: 'methods', label: 'Methods' },
  { key: 'created_at', label: 'Date' }
];

export function PathwaysHistoryPage() {
  const { data, loading, error } = useDiscoveryHistory();
  const [sortKey, setSortKey] = useState('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const router = useRouter();

  const sortedData = (data || []).slice().sort((a, b) => {
    if (sortKey === 'created_at') {
      return sortAsc
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (typeof a[sortKey] === 'number' && typeof b[sortKey] === 'number') {
      return sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey];
    }
    return sortAsc
      ? String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''))
      : String(b[sortKey] || '').localeCompare(String(a[sortKey] || ''));
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Discovery History</h1>
        {loading && <div className="text-center">Loading...</div>}
        {error && <div className="text-red-600 text-center">{error}</div>}
        {data && data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none"
                      onClick={() => {
                        if (sortKey === col.key) setSortAsc(!sortAsc);
                        else { setSortKey(col.key); setSortAsc(false); }
                      }}
                    >
                      {col.label}
                      {sortKey === col.key && (sortAsc ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, idx) => (
                  <tr key={row.id || idx} className="border-t">
                    <td className="px-4 py-2">{row.input}</td>
                    <td className="px-4 py-2">{row.input_type}</td>
                    <td className="px-4 py-2 text-center">{row.total_people}</td>
                    <td className="px-4 py-2 text-center">{row.total_mutuals}</td>
                    <td className="px-4 py-2 text-center">{Array.isArray(row.methods) ? row.methods.join(', ') : String(row.methods)}</td>
                    <td className="px-4 py-2 text-center">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                        onClick={() => router.push(`/search?target=${encodeURIComponent(row.input)}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <div className="text-gray-500 text-center">No discovery runs found.</div>
        )}
      </div>
    </div>
  );
} 