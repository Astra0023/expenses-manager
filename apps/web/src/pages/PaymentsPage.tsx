import { useState } from 'react';
import type { FormEvent } from 'react';
import { formatMoney, todayISO, useApp, type Payment } from '@manage-expenses/core';
import { PaymentList } from '../components/PaymentList';
import { useReminders } from '../reminders/ReminderProvider';
import { errorMessage } from '../utils/errors';
import { DEFAULT_REMINDER_DAYS, MAX_REMINDER_DAYS, RECURRENCE_LABELS, needsAttention, sortByDueDate } from '../utils/payments';

const RECURRENCES = Object.keys(RECURRENCE_LABELS) as Payment['recurrence'][];

function NotificationSettings() {
  const { permission, isEnabled, isRequesting, error, enable, disable, clearError } = useReminders();
  const statusText = permission === 'unsupported'
    ? 'Not supported in this browser'
    : isEnabled ? 'On' : permission === 'denied' ? 'Blocked by the browser' : 'Off';

  return (
    <section className="card" aria-labelledby="notify-title">
      <h2 id="notify-title">Browser notifications</h2>
      <p>
        Status: <strong>{statusText}</strong>
      </p>
      <p className="muted">
        Reminders always appear inside the app. Browser notifications are optional and only work while this site is open in a
        tab and you are signed in &mdash; nothing is sent when the site is closed. Each reminder is shown once per due date in
        this tab. Notification text includes the payment name and amount and may be visible on your lock screen.
      </p>
      <div className="row">
        {isEnabled ? (
          <button type="button" className="secondary" onClick={disable}>Turn off notifications</button>
        ) : (
          <button type="button" onClick={() => void enable()} disabled={isRequesting || permission === 'unsupported'}>
            {isRequesting ? 'Waiting for permission\u2026' : 'Enable browser notifications'}
          </button>
        )}
      </div>
      {error && (
        <div className="error-box" role="alert">
          <p className="error">{error}</p>
          <button type="button" className="link" onClick={clearError}>Dismiss</button>
        </div>
      )}
    </section>
  );
}

export function PaymentsPage() {
  const { payments, activeCategories, categories, categoryName, addPayment, removePayment, markPaymentPaid } = useApp();
  const { today } = useReminders();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState(todayISO());
  const [recurrence, setRecurrence] = useState<Payment['recurrence']>('monthly');
  const [reminderDays, setReminderDays] = useState(String(DEFAULT_REMINDER_DAYS));
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedCategory = activeCategories.some((c) => c.id === categoryId) ? categoryId : activeCategories[0]?.id ?? '';
  const sorted = sortByDueDate(payments);
  const attention = sorted.filter((p) => needsAttention(p, today));
  const later = sorted.filter((p) => !needsAttention(p, today));
  const monthlyCommitted = payments.reduce((sum, p) => sum + (p.recurrence === 'monthly' ? p.amount : p.recurrence === 'yearly' ? p.amount / 12 : 0), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const value = Number(amount);
    const days = Number(reminderDays);
    if (!title.trim()) return setFormError('Enter a name for the payment.');
    if (!(value > 0)) return setFormError('Enter an amount greater than zero.');
    if (!dueDate) return setFormError('Choose a due date.');
    if (!Number.isInteger(days) || days < 0 || days > MAX_REMINDER_DAYS) {
      return setFormError(`Reminder days must be a whole number from 0 to ${MAX_REMINDER_DAYS}.`);
    }
    setIsSaving(true);
    try {
      await addPayment({ title: title.trim(), amount: value, categoryId: selectedCategory, dueDate, recurrence, reminderDays: days });
      setTitle('');
      setAmount('');
      setListMessage({ ok: true, text: `Scheduled \u201c${title.trim()}\u201d.` });
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save the payment.'));
    } finally {
      setIsSaving(false);
    }
  };

  const runOnPayment = async (p: Payment, action: () => Promise<void>, success: string) => {
    setListMessage(null);
    setBusyId(p.id);
    try {
      await action();
      setListMessage({ ok: true, text: success });
    } catch (err) {
      setListMessage({ ok: false, text: errorMessage(err, 'The change could not be saved.') });
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkPaid = (p: Payment) => {
    void runOnPayment(p, () => markPaymentPaid(p.id), p.recurrence === 'none'
      ? `Marked \u201c${p.title}\u201d as paid and recorded ${formatMoney(p.amount)} as an expense today.`
      : `Marked \u201c${p.title}\u201d as paid, recorded ${formatMoney(p.amount)} as an expense today and moved it to the next due date.`);
  };

  const handleRemove = (p: Payment) => {
    if (!window.confirm(`Delete the scheduled payment \u201c${p.title}\u201d (${formatMoney(p.amount)})? This cannot be undone.`)) return;
    void runOnPayment(p, () => removePayment(p.id), `Deleted \u201c${p.title}\u201d.`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="muted">Bills and subscriptions you plan to pay. Nothing is paid automatically &mdash; mark each one paid once you&rsquo;ve paid it. Marking paid records an expense dated today; recurring payments then move to their next due date and one-time payments are removed.</p>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit} aria-labelledby="new-payment-title" noValidate>
        <h2 id="new-payment-title">Schedule a payment</h2>
        <div className="row">
          <label>Name<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required placeholder="e.g. Rent" /></label>
          <label>Amount<input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label>Category
            <select value={selectedCategory} onChange={(e) => setCategoryId(e.target.value)} required>
              {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required /></label>
          <label>Repeats
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Payment['recurrence'])}>
              {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>)}
            </select>
          </label>
          <label>Remind me (days before)
            <input type="number" min="0" max={MAX_REMINDER_DAYS} step="1" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} aria-describedby="reminder-help" />
          </label>
          <button disabled={isSaving || !selectedCategory}>{isSaving ? 'Saving\u2026' : 'Add payment'}</button>
        </div>
        <p id="reminder-help" className="muted">0 means remind on the due date only.</p>
        {categories.length > 0 && activeCategories.length === 0 && <p className="error">Reactivate a category before scheduling payments.</p>}
        {formError && <p role="alert" className="error">{formError}</p>}
      </form>

      <NotificationSettings />

      <div role="status" aria-live="polite">
        {listMessage && <p className={listMessage.ok ? 'success notice' : 'error notice'}>{listMessage.text}</p>}
      </div>

      <section className="card" aria-labelledby="attention-title">
        <h2 id="attention-title">Needs attention ({attention.length})</h2>
        {attention.length === 0 ? <p className="empty">Nothing due soon. You&rsquo;re all caught up.</p> : (
          <PaymentList payments={attention} today={today} categoryName={categoryName} busyId={busyId} onMarkPaid={handleMarkPaid} onRemove={handleRemove} />
        )}
      </section>

      <section className="card" aria-labelledby="later-title">
        <h2 id="later-title">Scheduled</h2>
        {payments.length > 0 && <p className="muted">Recurring commitments average about {formatMoney(monthlyCommitted)} per month.</p>}
        {later.length === 0 ? <p className="empty">No other scheduled payments.</p> : (
          <PaymentList payments={later} today={today} categoryName={categoryName} busyId={busyId} onMarkPaid={handleMarkPaid} onRemove={handleRemove} />
        )}
      </section>
    </>
  );
}