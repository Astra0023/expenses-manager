import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { filterExpenses, formatMoney, monthRange, todayISO, useApp, type Expense } from '@manage-expenses/core';
import { ExpenseTable } from '../components/ExpenseTable';
import { categoryBudgetStatuses } from '../utils/budgets';
import { formatDate } from '../utils/dates';
import { errorMessage } from '../utils/errors';

export function ExpensesPage() {
  const { expenses, categories, activeCategories, categoryName, categoryBudgets, addExpense, updateExpense, removeExpense } = useApp();
  const amountRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [month, setMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');

  const selectedCategory = categoryId || activeCategories[0]?.id || '';
  // While editing, keep the expense's current category selectable even if it has been deactivated.
  const formCategories = categories.filter((c) => c.status === 'active' || c.id === selectedCategory);

  const reset = () => {
    setEditingId(null);
    setAmount('');
    setNote('');
    setCategoryId('');
    setDate(todayISO());
    setError('');
  };

  const budgetNotice = (catId: string, expenseDate: string, extra: number): string => {
    const monthKey = expenseDate.slice(0, 7);
    const monthExpenses = filterExpenses(expenses, monthRange(monthKey)).filter((e) => e.id !== editingId);
    const status = categoryBudgetStatuses([...monthExpenses, { id: 'pending', amount: extra, categoryId: catId, date: expenseDate, note: '' }], categoryBudgets)
      .find((s) => s.categoryId === catId);
    if (!status || status.level === 'ok') return '';
    return status.level === 'over'
      ? ` ${categoryName(catId)} is now ${formatMoney(status.spent - status.budget)} over its ${formatMoney(status.budget)} monthly limit.`
      : ` ${categoryName(catId)} has used ${Math.round(status.percent)}% of its monthly limit.`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage(null);
    const input = { amount: Number(amount), categoryId: selectedCategory, date, note: note.trim() };
    setIsSaving(true);
    try {
      const notice = budgetNotice(input.categoryId, input.date, input.amount);
      if (editingId) await updateExpense(editingId, input);
      else await addExpense(input);
      setMessage({ ok: true, text: `${editingId ? 'Saved changes' : `Added ${formatMoney(input.amount)}`}.${notice}` });
      reset();
      amountRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err, 'Failed to save'));
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setAmount(String(e.amount));
    setCategoryId(e.categoryId);
    setDate(e.date);
    setNote(e.note);
    setMessage(null);
    window.scrollTo({ top: 0 });
    amountRef.current?.focus();
  };

  const handleDelete = async (e: Expense) => {
    if (!window.confirm(`Delete ${formatMoney(e.amount)} on ${formatDate(e.date)}?`)) return;
    setMessage(null);
    try {
      await removeExpense(e.id);
      if (editingId === e.id) reset();
      setMessage({ ok: true, text: 'Expense deleted.' });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, 'Failed to delete the expense.') });
    }
  };

  const range = month ? monthRange(month) : {};
  const visible = filterExpenses(expenses, { ...range, categoryId: filterCategory });
  const total = visible.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <h1>Manage Expenses</h1>
      <form className="card" onSubmit={handleSubmit} aria-labelledby="expense-form-title">
        <h2 id="expense-form-title">{editingId ? 'Edit expense' : 'Add an expense'}</h2>
        <div className="row">
          <label>Amount<input ref={amountRef} type="number" step="0.01" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label>Category
            <select value={selectedCategory} onChange={(e) => setCategoryId(e.target.value)} required>
              {formCategories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'inactive' ? ' (inactive)' : ''}</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} /></label>
          <button disabled={!selectedCategory || isSaving}>{isSaving ? 'Saving\u2026' : editingId ? 'Save changes' : 'Add expense'}</button>
          {editingId && <button type="button" className="link" onClick={reset}>Cancel</button>}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <div role="status" aria-live="polite">
        {message && <p className={message.ok ? 'success notice' : 'error notice'}>{message.text}</p>}
      </div>

      <section className="card row" aria-label="Filter expenses">
        <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label>Category
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="All">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="button" className="link" onClick={() => { setMonth(''); setFilterCategory('All'); }}>Clear</button>
      </section>

      <section className="card">
        <h2>Expenses &mdash; total {formatMoney(total)}</h2>
        {visible.length === 0 ? <p className="empty">No expenses found.</p> : (
          <ExpenseTable
            expenses={visible}
            categoryName={categoryName}
            caption="Expenses matching the current filters"
            renderActions={(e) => (
              <>
                <button type="button" className="link" onClick={() => startEdit(e)} aria-label={`Edit ${formatMoney(e.amount)} on ${formatDate(e.date)}`}>Edit</button>
                <button type="button" className="link danger" onClick={() => void handleDelete(e)} aria-label={`Delete ${formatMoney(e.amount)} on ${formatDate(e.date)}`}>Delete</button>
              </>
            )}
          />
        )}
      </section>
    </>
  );
}