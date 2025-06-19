import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSession } from '../hooks/useSession';

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  if (!loading && session) {
    if (typeof window !== 'undefined') router.replace('/search');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setSubmitting(false);
    } else {
      router.replace('/search');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, border: '1px solid #eee', borderRadius: 8 }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12 }}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12 }}
        />
        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
} 