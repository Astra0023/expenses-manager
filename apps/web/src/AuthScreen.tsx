import { Fragment, useState } from 'react';
import type { FormEvent } from 'react';
import type { Account, AuthService } from '@manage-expenses/core';
import { Logo } from './components/Logo';
import { errorMessage } from './utils/errors';

interface AuthScreenProps {
  auth: AuthService;
  initialMode?: 'signin' | 'register';
  onAuthenticated: (user: Account, isNewAccount: boolean) => void;
  onBack?: () => void;
}

export function AuthScreen({ auth, initialMode = 'signin', onAuthenticated, onBack }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      const user = isRegister
        ? await auth.register({ firstName, lastName, username, password })
        : await auth.login(username, password);
      onAuthenticated(user, isRegister);
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong'));
      setIsBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="card auth" onSubmit={handleSubmit} aria-labelledby="auth-title">
        <Logo />
        <h1 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">
          {isRegister
            ? 'Your account is stored only in this browser. There is no password reset, so choose a password you will remember.'
            : 'Sign in to the account stored in this browser.'}
        </p>
        {isRegister && (
          <Fragment>
            <label>First name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required /></label>
            <label>Last name<input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required /></label>
          </Fragment>
        )}
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button disabled={isBusy}>{isBusy ? 'Please wait\u2026' : isRegister ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="link" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
          {isRegister ? 'Have an account? Sign in' : 'No account? Register'}
        </button>
        {onBack && <button type="button" className="link" onClick={onBack}>&larr; Back to home</button>}
      </form>
    </main>
  );
}