import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { buildInsights, computeBudget, currentMonth, filterExpenses, formatMoney, monthRange, todayISO, type Payment } from '@manage-expenses/core';
import { Logo } from '../components/Logo';
import { StatCard } from '../components/StatCard';
import { CategoryChart } from '../components/CategoryChart';
import { BudgetAlerts } from '../components/BudgetAlerts';
import { PaymentList } from '../components/PaymentList';
import { ExpenseTable } from '../components/ExpenseTable';
import { createDemoData } from '../demo/sampleData';
import { categoryBudgetStatuses, totalsByCategory } from '../utils/budgets';
import { formatMonth } from '../utils/dates';
import { nextDueDate, sortByDueDate } from '../utils/payments';

interface DemoPageProps {
  onExit: () => void;
  onGetStarted: () => void;
}

/**
 * Self-contained demo. It never touches AuthService, AppProvider or browser storage:
 * every change lives in component state and disappears when the demo is closed.
 */
export function DemoPage({ onExit, onGetStarted }: DemoPageProps) {
  const [data, setData] = useState(() => createDemoData());
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(data.categories[0].id);
  const [notice, setNotice] = useState('');
  const today = todayISO();
  const month = currentMonth();

  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Unknown';
  const monthExpenses = useMemo(() => filterExpenses(data.expenses, monthRange(month)), [data.expenses, month]);
  const spent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const budget = computeBudget(data.profile);
  const slices = [...totalsByCategory(monthExpenses)].map(([id, value]) => ({ id, label: categoryName(id), amount: value }));
  const statuses = categoryBudgetStatuses(monthExpenses, data.categoryBudgets);
  const insights = buildInsights(data.expenses, data.categories, data.profile, month);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) {
      setNotice('Enter an amount greater than zero.');
      return;
    }
    setData((d) => ({ ...d, expenses: [{ id: `demo-${Date.now()}`, amount: value, categoryId, date: today, note: 'Demo expense' }, ...d.expenses] }));
    setAmount('');
    setNotice(`Added ${formatMoney(value)} to ${categoryName(categoryId)} (demo only, not saved).`);
  };

  const handleMarkPaid = (p: Payment) => {
    const next = nextDueDate(p);
    setData((d) => ({
      ...d,
      expenses: [{ id: `demo-paid-${Date.now()}`, amount: p.amount, categoryId: p.categoryId, date: today, note: p.title }, ...d.expenses],
      payments: next ? d.payments.map((x) => (x.id === p.id ? { ...x, dueDate: next } : x)) : d.payments.filter((x) => x.id !== p.id),
    }));
    setNotice(`Marked ${p.title} as paid and recorded it as an expense (demo only, not saved).`);
  };

  return (
    <div className="demo">
      <a className="skip-link" href="#demo-main">Skip to content</a>
      <div className="demo-banner" role="note">
        <span><strong>Demo mode.</strong> You are viewing fictional sample data. Nothing here is saved or linked to any account.</span>
        <span className="row">
          <button type="button" onClick={onGetStarted}>Create account</button>
          <button type="button" className="secondary" onClick={onExit}>Exit demo</button>
        </span>
      </div>
      <nav className="nav" aria-label="Demo">
        <Logo />
        <span className="muted">Signed in as Alex Sample (demo)</span>
      </nav>
      <main id="demo-main" tabIndex={-1}>
        <div className="page-head">
          <div>
            <h1>Welcome, {data.profile.firstName}</h1>
            <p className="muted">{formatMonth(month)} overview</p>
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{notice}</p>
        {notice && <p className="notice" aria-hidden="true">{notice}</p>}

        <div className="grid">
          <StatCard label="Spent this month" value={formatMoney(spent)} />
          <StatCard label="Spending limit" value={formatMoney(budget.spendLimit)} />
          <StatCard label="Remaining" value={formatMoney(budget.spendLimit - spent)} tone={spent > budget.spendLimit ? 'danger' : 'good'} />
          <StatCard label="Upcoming payments" value={data.payments.length} />
        </div>

        <form className="card row" onSubmit={handleAdd} aria-label="Add a demo expense">
          <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label>Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button>Add demo expense</button>
        </form>

        <div className="grid grid-2">
          <section className="card"><h2>Spending by category</h2><CategoryChart slices={slices} /></section>
          <section className="card"><h2>Category budgets</h2><BudgetAlerts statuses={statuses} categoryName={categoryName} /></section>
        </div>

        <div className="grid grid-2">
          <section className="card">
            <h2>Upcoming payments</h2>
            {data.payments.length === 0 ? <p className="empty">All demo payments are settled.</p> : (
              <PaymentList payments={sortByDueDate(data.payments)} today={today} categoryName={categoryName} onMarkPaid={handleMarkPaid} />
            )}
          </section>
          <section className="card">
            <h2>Suggestions</h2>
            {insights.map((i) => <div key={i.text} className={`insight ${i.level}`}>{i.text}</div>)}
          </section>
        </div>

        <section className="card">
          <h2>Recent expenses</h2>
          <ExpenseTable expenses={data.expenses.slice(0, 8)} categoryName={categoryName} caption="Recent demo expenses" />
        </section>
      </main>
    </div>
  );
}