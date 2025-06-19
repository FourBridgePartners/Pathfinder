import { useSession } from '../hooks/useSession';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

interface MutualConnection {
  name: string;
  title?: string;
  profileUrl?: string;
  discoveredBy?: string;
  via?: string;
}

export default function AccountsPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState<{
    connected: boolean;
    profileName?: string | null;
    lastSynced?: string | null;
  } | null>(null);
  const [mutualsLoading, setMutualsLoading] = useState(false);
  const [mutuals, setMutuals] = useState<MutualConnection[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
    if (user) {
      setStatusLoading(true);
      fetch('/api/linkedin/status')
        .then(res => res.json())
        .then(data => {
          setStatus(data);
          setStatusLoading(false);
        })
        .catch(() => setStatusLoading(false));
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (status?.connected) {
      setMutualsLoading(true);
      fetch('/api/linkedin/mutuals')
        .then(res => res.json())
        .then(data => {
          setMutuals(data);
          setMutualsLoading(false);
        })
        .catch(() => setMutualsLoading(false));
    } else {
      setMutuals([]);
    }
  }, [status]);

  if (loading || statusLoading) return <div>Loading...</div>;
  if (!user) return null;

  const handleConnectLinkedIn = () => {
    setConnecting(true);
    window.location.href = '/api/linkedin/oauth/start';
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24 }}>
      <h1>Accounts</h1>
      <div style={{ marginTop: 32 }}>
        <h3>LinkedIn</h3>
        {status?.connected ? (
          <div style={{ color: 'green', marginBottom: 12 }}>
            Connected as <b>{status.profileName || 'LinkedIn User'}</b>
            {status.lastSynced && (
              <span> · Last synced: {new Date(status.lastSynced).toLocaleString()}</span>
            )}
          </div>
        ) : (
          <button onClick={handleConnectLinkedIn} disabled={connecting} style={{ padding: '8px 20px', borderRadius: 4, background: '#0077b5', color: 'white', border: 'none', fontWeight: 600 }}>
            {connecting ? 'Redirecting...' : 'Connect LinkedIn'}
          </button>
        )}
      </div>
      {status?.connected && (
        <div style={{ marginTop: 40 }}>
          <h3>Recent Mutual Connections</h3>
          {mutualsLoading ? (
            <div>Loading mutuals...</div>
          ) : mutuals.length === 0 ? (
            <div>No recent mutual connections found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Name</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Title</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Profile</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Discovered Via</th>
                </tr>
              </thead>
              <tbody>
                {mutuals.map((m, i) => (
                  <tr key={i}>
                    <td style={{ padding: 6 }}>{m.name}</td>
                    <td style={{ padding: 6 }}>{m.title || ''}</td>
                    <td style={{ padding: 6 }}>
                      {m.profileUrl ? (
                        <a href={m.profileUrl} target="_blank" rel="noopener noreferrer">Profile</a>
                      ) : ''}
                    </td>
                    <td style={{ padding: 6 }}>{m.via || m.discoveredBy || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
} 