import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@manage-expenses/core';
import { Logo } from './components/Logo';
import { useReminders } from './reminders/ReminderProvider';
import { errorMessage } from './utils/errors';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/expenses', label: 'Manage Expenses' },
  { to: '/payments', label: 'Payments' },
  { to: '/reports', label: 'Reports' },
  { to: '/categories', label: 'Category' },
  { to: '/about', label: 'About' },
];

function ProfileMenu() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || '?';

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setError('');
    try {
      await logout();
    } catch (err) {
      setError(errorMessage(err, 'Logout failed'));
    }
  };

  return (
    <div className="profile-menu" ref={ref}>
      <button
        className="avatar"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Account menu"
        onClick={() => setIsOpen(!isOpen)}
      >
        {user.avatar ? <img src={user.avatar} alt="" /> : initials}
      </button>
      {isOpen && (
        <div className="dropdown" role="menu">
          <div className="dropdown-header">
            <strong>{user.firstName} {user.lastName}</strong>
            <p className="muted">@{user.username}</p>
          </div>
          <button role="menuitem" onClick={() => { setIsOpen(false); navigate('/profile'); }}>Profile &amp; backup</button>
          <button role="menuitem" onClick={handleLogout}>Logout</button>
          {error && <p role="alert" className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ReminderBanner() {
  const { activeReminders } = useReminders();
  const location = useLocation();
  const [dismissedCount, setDismissedCount] = useState<number | null>(null);
  const count = activeReminders.length;
  if (count === 0 || location.pathname === '/payments' || dismissedCount === count) return null;
  return (
    <div className="reminder-banner" role="status">
      <span>
        <strong>{count === 1 ? '1 payment needs' : `${count} payments need`} attention</strong> &mdash; due soon or overdue and not yet marked paid.
      </span>
      <span className="row">
        <Link className="button-link" to="/payments">Review payments</Link>
        <button type="button" className="link" onClick={() => setDismissedCount(count)}>Dismiss</button>
      </span>
    </div>
  );
}

export function Layout() {
  const { isLoading, error: loadError, reload } = useApp();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === 'me:accounts' || event.key === null)) {
        void reload().catch(() => undefined);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [reload]);

  useEffect(() => {
    setIsNavOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isNavOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node) && !toggleRef.current?.contains(event.target as Node)) setIsNavOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavOpen(false);
        toggleRef.current?.focus();
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) setIsNavOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleResize);
    };
  }, [isNavOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <nav className="nav" aria-label="Primary">
        <Link to="/" className="brand-link" aria-label="Expenses Manager home"><Logo /></Link>
        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-controls="primary-navigation"
          aria-expanded={isNavOpen}
          aria-label={isNavOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsNavOpen((open) => !open)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {isNavOpen ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
        <div id="primary-navigation" ref={navRef} className={`nav-links${isNavOpen ? ' nav-links-open' : ''}`}>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} onClick={() => setIsNavOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </div>
        <ProfileMenu />
      </nav>
      <ReminderBanner />
      <main id="main" ref={mainRef} tabIndex={-1}>
        {isLoading ? <p role="status">Loading&hellip;</p> : loadError ? (
          <section className="card" role="alert">
            <h1>Your data could not be loaded</h1>
            <p className="error">{loadError}</p>
            <p>To protect your data, changes are blocked until it loads correctly. Reload the page, or sign out and sign in again.</p>
            <button type="button" onClick={() => window.location.reload()}>Reload</button>
          </section>
        ) : <Outlet />}
      </main>
    </div>
  );
}