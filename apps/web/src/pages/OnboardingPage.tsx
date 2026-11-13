import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeBudget, todayISO, useApp, useMoney } from '@manage-expenses/core';
import { errorMessage } from '../utils/errors';
import { markOnboarded } from '../utils/onboarding';

const STEPS = ['Monthly budget', 'Categories', 'First expense'] as const;

export function OnboardingPage() {
  const { user, categories, categoryBudgets, updateProfile, addCategory, setCategoryActive, setCategoryBudget, addExpense } = useApp();
  const money = useMoney();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const [income, setIncome] = useState(user.monthlyIncome ? String(user.monthlyIncome) : '');
  const [taxRate, setTaxRate] = useState(String(user.taxRate));
  const [savingsRate, setSavingsRate] = useState(String(user.savingsRate));

  const [newCategory, setNewCategory] = useState('');
  const [limits, setLimits] = useState<Record<string, string>>({});

  const activeCategories = categories.filter((c) => c.status === 'active');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const selectedCategory = activeCategories.some((c) => c.id === categoryId) ? categoryId : activeCategories[0]?.id ?? '';

  const preview = computeBudget({ monthlyIncome: Number(income) || 0, taxRate: Number(taxRate) || 0, savingsRate: Number(savingsRate) || 0 });

  const run = async (action: () => Promise<void>) => {
    setError('');
    setIsBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsBusy(false);
    }
  };

  const finish = () => {
    markOnboarded(user.id);
    navigate('/', { replace: true });
  };

  const handleBudget = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await updateProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        currency: user.currency,
        monthlyIncome: Number(income) || 0,
        taxRate: Number(taxRate) || 0,
        savingsRate: Number(savingsRate) || 0,
      });
      setStep(1);
    });
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    void run(async () => {
      await addCategory(newCategory.trim());
      setNewCategory('');
    });
  };

  const handleToggle = (id: string, isActive: boolean) => {
    if (!isActive && activeCategories.length <= 1) {
      setError('Keep at least one category active so you can record expenses.');
      return;
    }
    void run(() => setCategoryActive(id, isActive));
  };

  const handleCategories = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      for (const [id, raw] of Object.entries(limits)) {
        const value = raw.trim() === '' ? 0 : Number(raw);
        if (!Number.isFinite(value) || value < 0) throw new Error('Category limits must be zero or a positive amount.');
        if (value !== (categoryBudgets[id] ?? 0)) await setCategoryBudget(id, value);
      }
      setStep(2);
    });
  };

  const handleExpense = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await addExpense({ amount: Number(amount), categoryId: selectedCategory, date, note: note.trim() });
      finish();
    });
  };

  return (
    <div className="onboarding">
      <h1>Set up Expenses Manager</h1>
      <ol className="stepper" aria-label="Setup progress">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'current' : index < step ? 'done' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="step-num" aria-hidden="true">{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="error">{error}</p>}

      {step === 0 && (
        <form className="card" onSubmit={handleBudget} aria-labelledby="step-budget">
          <h2 id="step-budget">What&rsquo;s your monthly budget?</h2>
          <p className="muted">We use your income, tax and savings goal to suggest a monthly spending limit. You can change these later in Profile.</p>
          <div className="row">
            <label>Monthly income<input type="number" min="0" step="0.01" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} /></label>
            <label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></label>
            <label>Savings (% of net)<input type="number" min="0" max="100" step="0.01" value={savingsRate} onChange={(e) => setSavingsRate(e.target.value)} /></label>
          </div>
          <p className="callout" aria-live="polite">Suggested spending limit: <strong>{money(preview.spendLimit)}</strong> per month</p>
          <div className="row">
            <button disabled={isBusy}>{isBusy ? 'Saving\u2026' : 'Save and continue'}</button>
            <button type="button" className="link" onClick={() => setStep(1)}>Skip this step</button>
          </div>
        </form>
      )}

      {step === 1 && (
        <form className="card" onSubmit={handleCategories} aria-labelledby="step-categories">
          <h2 id="step-categories">Choose your categories</h2>
          <p className="muted">Untick categories you don&rsquo;t need. Optionally set a monthly limit to get an alert at 80% and when you go over.</p>
          <ul className="check-list">
            {categories.map((c) => (
              <li key={c.id}>
                <label className="inline">
                  <input type="checkbox" checked={c.status === 'active'} disabled={isBusy} onChange={(e) => handleToggle(c.id, e.target.checked)} />
                  {c.name}
                </label>
                {c.status === 'active' && (
                  <label className="inline">
                    <span className="sr-only">Monthly limit for {c.name}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="No limit"
                      value={limits[c.id] ?? (categoryBudgets[c.id] ? String(categoryBudgets[c.id]) : '')}
                      onChange={(e) => setLimits((l) => ({ ...l, [c.id]: e.target.value }))}
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
          <div className="row">
            <label>New category<input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={40} /></label>
            <button type="button" className="secondary" disabled={isBusy || !newCategory.trim()} onClick={handleAddCategory}>Add category</button>
          </div>
          <div className="row step-actions">
            <button type="button" className="link" onClick={() => setStep(0)}>Back</button>
            <button disabled={isBusy}>{isBusy ? 'Saving\u2026' : 'Save and continue'}</button>
            <button type="button" className="link" onClick={() => setStep(2)}>Skip this step</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="card" onSubmit={handleExpense} aria-labelledby="step-expense">
          <h2 id="step-expense">Add your first expense</h2>
          <div className="row">
            <label>Amount<input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
            <label>Category
              <select value={selectedCategory} onChange={(e) => setCategoryId(e.target.value)} required>
                {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
            <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} /></label>
          </div>
          <div className="row step-actions">
            <button type="button" className="link" onClick={() => setStep(1)}>Back</button>
            <button disabled={isBusy || !selectedCategory}>{isBusy ? 'Saving\u2026' : 'Add expense and finish'}</button>
            <button type="button" className="link" onClick={finish}>Skip and go to dashboard</button>
          </div>
        </form>
      )}
    </div>
  );
}