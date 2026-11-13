import { useState } from 'react';
import type { FormEvent } from 'react';
import { currentMonth, filterExpenses, formatMoney, monthRange, useApp, type Category } from '@manage-expenses/core';
import { budgetLevel, totalsByCategory } from '../utils/budgets';
import { errorMessage } from '../utils/errors';

interface BudgetCellProps {
  category: Category;
  budget: number;
  spent: number;
  onSave: (amount: number) => Promise<void>;
}

function BudgetCell({ category, budget, spent, onSave }: BudgetCellProps) {
  const [value, setValue] = useState(budget > 0 ? String(budget) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const amount = value.trim() === '' ? 0 : Number(value);
  const isDirty = amount !== budget;
  const level = budget > 0 ? budgetLevel((spent / budget) * 100) : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter zero or a positive amount.');
    setIsSaving(true);
    try {
      await onSave(amount);
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the limit.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="budget-cell" onSubmit={handleSubmit}>
      <label className="inline">
        <span className="sr-only">Monthly limit for {category.name}</span>
        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="No limit" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="secondary" disabled={isSaving || !isDirty} aria-label={`Save monthly limit for ${category.name}`}>{isSaving ? 'Saving\u2026' : 'Save'}</button>
      {level && level !== 'ok' && <span className={`badge level-${level}`}>{level === 'over' ? 'Over budget' : 'Near limit'}</span>}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

export function CategoriesPage() {
  const { categories, expenses, categoryBudgets, addCategory, renameCategory, setCategoryActive, setCategoryBudget } = useApp();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const spentThisMonth = totalsByCategory(filterExpenses(expenses, monthRange(currentMonth())));

  const reset = () => {
    setName('');
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) await renameCategory(editingId, name);
      else await addCategory(name);
      reset();
    } catch (err) {
      setError(errorMessage(err, 'Failed to save'));
    }
  };

  const handleStatus = async (id: string, isActive: boolean) => {
    setListError('');
    try {
      await setCategoryActive(id, isActive);
    } catch (err) {
      setListError(errorMessage(err, 'Failed to update the category.'));
    }
  };

  return (
    <>
      <h1>Category</h1>
      <form className="card row" onSubmit={handleSubmit} aria-label={editingId ? 'Rename category' : 'Add category'}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required /></label>
        <button>{editingId ? 'Save changes' : 'Add category'}</button>
        {editingId && <button type="button" className="link" onClick={reset}>Cancel</button>}
        {error && <p role="alert" className="error">{error}</p>}
      </form>

      <section className="card">
        <p className="muted">
          Deleting a category sets it to inactive. It disappears from the expense form but past expenses keep it.
          Set an optional monthly limit to get alerts at 80% and when you go over; leave it empty (or 0) to remove the limit.
        </p>
        {listError && <p role="alert" className="error">{listError}</p>}
        <table className="responsive">
          <caption className="sr-only">Categories and monthly limits</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">This month</th><th scope="col">Monthly limit</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td data-label="Name">{c.name}</td>
                <td data-label="Status"><span className={`badge ${c.status}`}>{c.status}</span></td>
                <td data-label="This month">{formatMoney(spentThisMonth.get(c.id) ?? 0)}</td>
                <td data-label="Monthly limit">
                  <BudgetCell
                    key={`${c.id}:${categoryBudgets[c.id] ?? 0}`}
                    category={c}
                    budget={categoryBudgets[c.id] ?? 0}
                    spent={spentThisMonth.get(c.id) ?? 0}
                    onSave={(amount) => setCategoryBudget(c.id, amount)}
                  />
                </td>
                <td className="actions">
                  <button type="button" className="link" onClick={() => { setEditingId(c.id); setName(c.name); setError(''); }} aria-label={`Rename ${c.name}`}>Edit</button>
                  {c.status === 'active' ? (
                    <button type="button" className="link danger" onClick={() => void handleStatus(c.id, false)} aria-label={`Delete ${c.name}`}>Delete</button>
                  ) : (
                    <button type="button" className="link" onClick={() => void handleStatus(c.id, true)} aria-label={`Reactivate ${c.name}`}>Reactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}