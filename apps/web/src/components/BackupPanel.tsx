import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { todayISO, useApp } from '@manage-expenses/core';
import { downloadBlob } from '../utils/download';
import { errorMessage } from '../utils/errors';

const MIN_BACKUP_PASSWORD = 12;
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const CONFIRM_PHRASE = 'REPLACE';

type Message = { ok: boolean; text: string } | null;

function CreateBackupForm() {
  const { createBackup } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isDistinct, setIsDistinct] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (password.length < MIN_BACKUP_PASSWORD) return setMessage({ ok: false, text: `Use at least ${MIN_BACKUP_PASSWORD} characters for the backup password.` });
    if (password !== confirm) return setMessage({ ok: false, text: 'The backup passwords do not match.' });
    if (!isDistinct) return setMessage({ ok: false, text: 'Confirm that the backup password is different from your account password.' });
    setIsBusy(true);
    try {
      const data = await createBackup(password);
      downloadBlob(new Blob([data], { type: 'application/octet-stream' }), `expenses-backup-${todayISO()}.mebackup`);
      setPassword('');
      setConfirm('');
      setIsDistinct(false);
      setMessage({ ok: true, text: 'Encrypted backup downloaded. Store the file and its password separately; the password cannot be recovered.' });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, 'Could not create the backup.') });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-labelledby="backup-create-title" noValidate>
      <h3 id="backup-create-title">Create encrypted backup</h3>
      <p className="muted">
        The backup file is encrypted with the password you choose here. Use a separate password from the one you sign in with,
        so a leaked backup password doesn&rsquo;t expose your account (and vice versa).
      </p>
      <div className="row">
        <label>Backup password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={MIN_BACKUP_PASSWORD} required /></label>
        <label>Confirm backup password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
      </div>
      <label className="inline check">
        <input type="checkbox" checked={isDistinct} onChange={(e) => setIsDistinct(e.target.checked)} />
        This password is different from my account password
      </label>
      <button disabled={isBusy}>{isBusy ? 'Encrypting\u2026' : 'Download encrypted backup'}</button>
      <div role="status" aria-live="polite">{message && <p className={message.ok ? 'success' : 'error'}>{message.text}</p>}</div>
    </form>
  );
}

function RestoreBackupForm({ onRestored }: { onRestored?: () => void }) {
  const { restoreBackup } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isUnderstood, setIsUnderstood] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const canRestore = Boolean(file) && password.length > 0 && isUnderstood && phrase === CONFIRM_PHRASE && !isBusy;

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    setMessage(null);
    const chosen = e.target.files?.[0] ?? null;
    if (chosen && chosen.size > MAX_BACKUP_BYTES) {
      setFile(null);
      e.target.value = '';
      setMessage({ ok: false, text: 'That file is too large to be an Expenses Manager backup.' });
      return;
    }
    setFile(chosen);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canRestore) return;
    setMessage(null);
    setIsBusy(true);
    try {
      const data = await file.text();
      await restoreBackup(data, password);
      setFile(null);
      setPassword('');
      setPhrase('');
      setIsUnderstood(false);
      if (fileRef.current) fileRef.current.value = '';
      onRestored?.();
      setMessage({ ok: true, text: 'Backup restored. Your profile and data have been replaced with the backup contents.' });
    } catch (err) {
      setMessage({ ok: false, text: `Restore failed: ${errorMessage(err, 'the file or password may be wrong.')}` });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-labelledby="backup-restore-title" className="danger-zone">
      <h3 id="backup-restore-title">Restore from backup</h3>
      <p className="warning-text" id="restore-warning">
        <strong>This replaces everything in this account</strong> &mdash; your profile details (name, income, tax, savings, picture)
        and all expenses, categories, budgets and payments &mdash; with the contents of the backup. Your username and sign-in password stay the same. It cannot be undone. Download a fresh backup first if you might need your current data.
      </p>
      <div className="row">
        <label>Backup file<input ref={fileRef} type="file" accept=".mebackup,.json,.txt,application/octet-stream,text/plain" onChange={handleFile} required /></label>
        <label>Backup password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required /></label>
      </div>
      <label className="inline check">
        <input type="checkbox" checked={isUnderstood} onChange={(e) => setIsUnderstood(e.target.checked)} aria-describedby="restore-warning" />
        I understand my current profile and data in this account will be replaced
      </label>
      <label>
        Type {CONFIRM_PHRASE} to confirm
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="restore-warning" />
      </label>
      <button className="danger-button" disabled={!canRestore}>{isBusy ? 'Restoring\u2026' : 'Replace my data with this backup'}</button>
      <div role="status" aria-live="polite">{message && <p className={message.ok ? 'success' : 'error'}>{message.text}</p>}</div>
    </form>
  );
}

export function BackupPanel({ onRestored }: { onRestored?: () => void }) {
  return (
    <section className="card backup" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup &amp; restore</h2>
      <p className="muted">
        Your data lives only in this browser. Clearing site data, losing the device or forgetting your password will lose it,
        so keep an encrypted backup somewhere safe.
      </p>
      <CreateBackupForm />
      <hr />
      <RestoreBackupForm onRestored={onRestored} />
    </section>
  );
}