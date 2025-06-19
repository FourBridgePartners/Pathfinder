import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabaseClient';

export default function Navbar() {
  const { user, loading } = useSession();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <nav style={{ display: 'flex', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid #eee', marginBottom: 24 }}>
      <Link href="/search" style={{ fontWeight: 600, fontSize: 20, marginRight: 24 }}>LP Discovery</Link>
      <div style={{ flex: 1 }} />
      {loading ? null : user ? (
        <>
          <span style={{ marginRight: 16, color: '#555' }}>{user.email}</span>
          <button onClick={handleLogout} style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid #ccc', background: '#fafafa', cursor: 'pointer' }}>
            Logout
          </button>
        </>
      ) : (
        <Link href="/login" style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid #ccc', background: '#fafafa', cursor: 'pointer' }}>
          Login
        </Link>
      )}
    </nav>
  );
} 