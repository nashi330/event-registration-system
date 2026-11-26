import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, User } from 'lucide-react';
import type { UserProfile } from './types/database';
import { supabase, fetchUserProfile, isSupabaseConfigured } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import RegisterPage from './pages/RegisterPage';
import ScannerPage from './pages/ScannerPage';
import AdminPage from './pages/AdminPage';

function navigateTo(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured) {
      setInitializing(false);
      return;
    }

    const hydrate = async (userId: string) => {
      const profile = await fetchUserProfile(userId);
      if (!cancelled) setCurrentUser(profile);
    };

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) await hydrate(data.session.user.id);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (!cancelled) setCurrentUser(null);
        return;
      }
      if (event === 'SIGNED_IN' && session?.user) {
        const userId = session.user.id;
        setTimeout(() => {
          void hydrate(userId);
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleAuthSuccess = (profile: UserProfile) => {
    setCurrentUser(profile);
    if (profile.role === 'admin') {
      navigateTo('/admin');
      return;
    }
    const intended = window.location.pathname;
    navigateTo(
      intended === '/register' || intended.startsWith('/register/') ? intended : '/register',
    );
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    navigateTo('/');
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="pastel-mesh-bg min-h-screen flex items-center justify-center p-4">
        <div className="liquid-glass w-full max-w-lg rounded-[2rem] p-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Supabase configuration required</h1>
          <p className="mt-3 text-sm text-slate-600">
            Add <code className="rounded bg-white/70 px-1.5 py-0.5">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-white/70 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code> to{' '}
            <code className="rounded bg-white/70 px-1.5 py-0.5">.env.local</code>, then restart Vite.
          </p>
        </div>
      </div>
    );
  }

  if (path === '/scanner' || path.startsWith('/scanner/')) {
    return <ScannerPage />;
  }

  if (initializing) {
    return (
      <div className="pastel-mesh-bg min-h-screen flex items-center justify-center p-4">
        <div className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-slate-700 animate-pulse">
          Loading…
        </div>
      </div>
    );
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!currentUser || currentUser.role !== 'admin') {
      return <AuthPage onAuthSuccess={handleAuthSuccess} />;
    }
    return <AdminPage user={currentUser} onSignOut={handleSignOut} />;
  }

  if (path === '/register' || path.startsWith('/register/')) {
    if (!currentUser) {
      return <AuthPage onAuthSuccess={handleAuthSuccess} />;
    }
    return (
      <div className="relative">
        <div className="fixed right-4 top-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-white/75 bg-white/55 px-3 py-1.5 text-xs font-semibold text-[#18181B] shadow-sm backdrop-blur-xl">
          <User size={14} className="shrink-0 text-violet-600" />
          <span className="max-w-[110px] truncate sm:max-w-[160px]">{currentUser.email}</span>
          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={() => navigateTo('/admin')}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:opacity-90"
            >
              <ArrowLeft size={12} />
              Dashboard
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="ml-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#18181B] px-2.5 py-1 text-[11px] font-bold text-white transition hover:opacity-90"
          >
            <LogOut size={12} />
            Sign Out
          </button>
        </div>
        <RegisterPage />
      </div>
    );
  }

  if (currentUser) {
    return currentUser.role === 'admin' ? (
      <AdminPage user={currentUser} onSignOut={handleSignOut} />
    ) : (
      <div className="relative">
        <div className="fixed right-4 top-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-white/75 bg-white/55 px-3 py-1.5 text-xs font-semibold text-[#18181B] shadow-sm backdrop-blur-xl">
          <User size={14} className="shrink-0 text-violet-600" />
          <span className="max-w-[110px] truncate sm:max-w-[160px]">{currentUser.email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="ml-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#18181B] px-2.5 py-1 text-[11px] font-bold text-white transition hover:opacity-90"
          >
            <LogOut size={12} />
            Sign Out
          </button>
        </div>
        <RegisterPage />
      </div>
    );
  }

  return <AuthPage onAuthSuccess={handleAuthSuccess} />;
}