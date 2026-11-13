import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { computeBudget, formatMoney, useApp } from '@manage-expenses/core';
import { resizeImageToDataUrl } from '../image';
import { BackupPanel } from '../components/BackupPanel';
import { errorMessage } from '../utils/errors';

function ProfileDetails() {
  const { user, updateProfile, updateAvatar, changePassword } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState('');

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    try {
      await updateAvatar(await resizeImageToDataUrl(file));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload picture');
    }
  };
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [income, setIncome] = useState(String(user.monthlyIncome));
  const [taxRate, setTaxRate] = useState(String(user.taxRate));
  const [savingsRate, setSavingsRate] = useState(String(user.savingsRate));
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const budget = computeBudget({
    monthlyIncome: Number(income) || 0,
    taxRate: Number(taxRate) || 0,
    savingsRate: Number(savingsRate) || 0,
  });

  const handleProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        firstName,
        lastName,
        monthlyIncome: Number(income),
        taxRate: Number(taxRate),
        savingsRate: Number(savingsRate),
      });
      setProfileMsg({ ok: true, text: 'Profile saved' });
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' });
    }
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setPwMsg({ ok: true, text: 'Password changed' });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to change password' });
    }
  };

  return (
    <>
      <h1>Profile</h1>
      <section className="card row">
        {user.avatar ? (
          <img className="avatar-lg" src={user.avatar} alt="Profile" />
        ) : (
          <div className="avatar-lg" aria-hidden="true">{`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()}</div>
        )}
        <div>
          <h2>Profile picture</h2>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />
          <button type="button" onClick={() => fileRef.current?.click()}>Upload picture</button>
          {user.avatar && <button type="button" className="link danger" onClick={() => { setAvatarError(''); updateAvatar(null).catch((err: unknown) => setAvatarError(errorMessage(err, 'Failed to remove picture'))); }}>Remove</button>}
          {avatarError && <p role="alert" className="error">{avatarError}</p>}
        </div>
      </section>
      <form className="card" onSubmit={handleProfile}>
        <h2>Details & income</h2>
        <div className="row">
          <label>First name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label>
          <label>Last name<input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label>
          <label>Username<input value={user.username} disabled /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label>Monthly income<input type="number" min="0" step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} /></label>
          <label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></label>
          <label>Savings (% of net)<input type="number" min="0" max="100" step="0.01" value={savingsRate} onChange={(e) => setSavingsRate(e.target.value)} /></label>
          <button>Save profile</button>
        </div>
        {profileMsg && <p role="status" className={profileMsg.ok ? 'success' : 'error'}>{profileMsg.text}</p>}
      </form>

      <section className="card">
        <h2>Tax & spending calculator</h2>
        <p className="muted">Updates live from the income, tax and savings values above.</p>
        <table><tbody>
          <tr><td>Gross income</td><td>{formatMoney(budget.gross)}</td></tr>
          <tr><td>Tax ({Number(taxRate) || 0}%)</td><td>&minus; {formatMoney(budget.tax)}</td></tr>
          <tr><td>Net income</td><td>{formatMoney(budget.net)}</td></tr>
          <tr><td>Savings ({Number(savingsRate) || 0}% of net)</td><td>&minus; {formatMoney(budget.savings)}</td></tr>
          <tr><th>Recommended spending per month</th><th>{formatMoney(budget.spendLimit)}</th></tr>
        </tbody></table>
      </section>

      <form className="card row" onSubmit={handlePassword}>
        <h2 style={{ width: '100%' }}>Change password</h2>
        <label>Current password<input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" required /></label>
        <label>New password<input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" required /></label>
        <button>Change password</button>
        {pwMsg && <p role="status" className={pwMsg.ok ? 'success' : 'error'}>{pwMsg.text}</p>}
      </form>
    </>
  );
}

/** Restoring a backup replaces the profile, so the details form is remounted with the restored values. */
export function ProfilePage() {
  const [restoreCount, setRestoreCount] = useState(0);
  return (
    <>
      <ProfileDetails key={restoreCount} />
      <BackupPanel onRestored={() => setRestoreCount((n) => n + 1)} />
    </>
  );
}
