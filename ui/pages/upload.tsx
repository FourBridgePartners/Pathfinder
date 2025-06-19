import { useState } from 'react';

function parseInputList(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => !!line);
}

export default function UploadBulkDiscoveryPage() {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setInput(text);
      setRows(parseInputList(text));
    };
    reader.readAsText(file);
  };

  const handlePreview = () => {
    setRows(parseInputList(input));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setProgress(0);
    setSummary(null);
    const allResults: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const target = rows[i];
      try {
        const res = await fetch(`/api/pathways?target=${encodeURIComponent(target)}`);
        const data = await res.json();
        allResults.push({ target, data });
      } catch (err: any) {
        allResults.push({ target, error: err.message || 'Fetch error' });
      }
      setProgress(i + 1);
    }
    setResults(allResults);
    setLoading(false);
    setSummary({
      total: rows.length,
      processed: allResults.length,
      withPeople: allResults.filter(r => Array.isArray(r.data) && r.data.length > 0).length,
      errors: allResults.filter(r => r.error).length
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Bulk Discovery Upload</h1>
        <div className="mb-6 flex flex-col gap-4">
          <label className="font-medium">Paste firm names (one per line):</label>
          <textarea
            className="w-full border border-gray-300 rounded p-2 min-h-[120px]"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Firm A\nFirm B\nFirm C"
            disabled={loading}
          />
          <div className="flex items-center gap-4">
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} disabled={loading} />
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={handlePreview}
              disabled={loading}
            >
              Preview
            </button>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">Preview ({rows.length} rows):</h2>
            <table className="min-w-full bg-white rounded shadow">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Firm Name</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-4 py-2">{row}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="mt-4 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Run Bulk Discovery'}
            </button>
          </div>
        )}
        {loading && (
          <div className="mb-4 text-blue-700 font-medium text-center">
            Processing {progress} of {rows.length}...
          </div>
        )}
        {summary && (
          <div className="mb-6 text-center">
            <div className="font-semibold">Summary</div>
            <div>Total: {summary.total}</div>
            <div>Processed: {summary.processed}</div>
            <div>With People: {summary.withPeople}</div>
            <div>Errors: {summary.errors}</div>
          </div>
        )}
        {results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded shadow">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Firm</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"># People</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"># Mutuals</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-4 py-2">{r.target}</td>
                    <td className="px-4 py-2 text-center">{Array.isArray(r.data) ? r.data.length : '-'}</td>
                    <td className="px-4 py-2 text-center">{Array.isArray(r.data) ? r.data.reduce((acc: number, row: any) => acc + (row.mutualCount || 0), 0) : '-'}</td>
                    <td className="px-4 py-2 text-red-600">{r.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="text-red-600 text-center mt-4">{error}</div>}
      </div>
    </div>
  );
} 