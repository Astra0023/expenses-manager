import { useCallback, useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, createAuthService, navigatorLocks, type Account } from '@manage-expenses/core';
import { randomBytes, SESSION_KEY, webSessionStorage, webStorage } from './platform';
import { AuthScreen } from './AuthScreen';
import { Layout } from './Layout';
import { ReminderProvider } from './reminders/ReminderProvider';
import { errorMessage } from './utils/errors';
import { LandingPage } from './pages/LandingPage';
import { DemoPage } from './pages/DemoPage';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ProfilePage } from './pages/ProfilePage';
import { AboutPage } from './pages/AboutPage';

type PublicView = 'landing' | 'signin' | 'register' | 'demo';

const PUBLIC_HASHES: Record<PublicView, string> = {
  landing: '',
  signin: '#/login',
  register: '#/register',
  demo: '#/demo',
};

function viewFromHash(): PublicView {
  const match = (Object.keys(PUBLIC_HASHES) as PublicView[]).find((v) => v !== 'landing' && PUBLIC_HASHES[v] === window.location.hash);
  return match ?? 'landing';
}

export function App() {
  const auth = useMemo(() => createAuthService(webStorage, randomBytes, webSessionStorage, { lock: navigatorLocks() ?? undefined }), []);
  const [user, setUser] = useState<Account | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [view, setView] = useState<PublicView>(viewFromHash);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const syncSession = async () => {
      const current = ++generation;
      try {
        const account = await auth.currentUser();
        if (!active || current !== generation) return;
        setSessionError('');
        setUser((previous) => previous?.id === account?.id && account ? previous : account);
      } catch (error) {
        if (!active || current !== generation) return;
        setUser(null);
        setSessionError(errorMessage(error, 'Unable to restore the session.'));
      } finally {
        if (active && current === generation) setIsReady(true);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === SESSION_KEY || event.key === null)) void syncSession();
    };
    const onFocus = () => { void syncSession(); };
    void syncSession();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [auth]);

  useEffect(() => {
    if (!user) return;
    const expiresAt = auth.sessionExpiresAt();
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => {
      auth.currentUser().then((account) => {
        setUser(account);
      }).catch((error: unknown) => {
        setUser(null);
        setSessionError(errorMessage(error, 'Unable to restore the session.'));
      });
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [auth, user]);

  // Public (signed-out) views are reflected in the URL hash so Back/Forward and deep links work.
  useEffect(() => {
    if (user) return;
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [user]);

  const go = useCallback((next: PublicView) => {
    setView(next);
    const hash = PUBLIC_HASHES[next];
    if (window.location.hash !== hash) {
      if (hash) window.location.hash = hash;
      else window.history.pushState(null, '', window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0 });
  }, []);

  const handleAuthenticated = useCallback((account: Account, isNewAccount: boolean) => {
    window.location.hash = isNewAccount ? '/welcome' : '/';
    setUser(account);
  }, []);

  if (!isReady) return <p className="boot" role="status">Loading&hellip;</p>;
  if (sessionError) return (
    <main className="auth-page">
      <div className="card auth">
        <p className="error" role="alert">{sessionError}</p>
        <button onClick={() => {
          try {
            webSessionStorage.clear();
            setSessionError('');
          } catch (error) {
            setSessionError(errorMessage(error, 'Unable to clear the session.'));
          }
        }}>Clear session and sign in</button>
      </div>
    </main>
  );

  if (!user) {
    if (view === 'demo') return <DemoPage onExit={() => go('landing')} onGetStarted={() => go('register')} />;
    if (view === 'signin' || view === 'register') {
      return <AuthScreen key={view} auth={auth} initialMode={view} onAuthenticated={handleAuthenticated} onBack={() => go('landing')} />;
    }
    return <LandingPage onGetStarted={() => go('register')} onSignIn={() => go('signin')} onTryDemo={() => go('demo')} />;
  }

  return (
    <AppProvider key={user.id} auth={auth} storage={webStorage} randomBytes={randomBytes} user={user} onLogout={() => { window.location.hash = ''; setView('landing'); setUser(null); }}>
      <ReminderProvider>
        {auth.lockScope !== 'cross-context' && (
          <div className="reminder-banner" role="alert">
            This browser cannot safely coordinate changes across tabs. Use only one tab to avoid losing changes.
          </div>
        )}
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="welcome" element={<OnboardingPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </ReminderProvider>
    </AppProvider>
  );
}