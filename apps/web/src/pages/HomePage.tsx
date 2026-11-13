import { Link } from 'react-router-dom';
import { buildInsights, computeBudget, currentMonth, filterExpenses, formatMoney, monthRange, useApp } from '@manage-expenses/core';
import { StatCard } from '../components/StatCard';
import { CategoryChart } from '../components/CategoryChart';
import { BudgetAlerts } from '../components/BudgetAlerts';
import { PaymentList } from '../components/PaymentList';
import { ExpenseTable } from '../components/ExpenseTable';
import { useReminders } from '../reminders/ReminderProvider';
import { categoryBudgetStatuses, totalsByCategory } from '../utils/budgets';
import { formatMonth } from '../utils/dates';
import { isOnboarded } from '../utils/onboarding';
import { sortByDueDate } from '../utils/payments';

const UPCOMING_LIMIT = 4;
const RECENT_LIMIT = 5;

export function HomePage() {
  const { user, expenses, categories, categoryName, payments, categoryBudgets } = useApp();
  const { today, activeReminders } = useReminders();
  const month = currentMonth();
  const monthExpenses = filterExpenses(expenses, monthRange(month));
  const spent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const budget = computeBudget(user);
  const hasIncome = user.monthlyIncome > 0;
  const percent = budget.spendLimit > 0 ? (spent / budget.spendLimit) * 100 : spent > 0 ? 100 : 0;
  const barClass = percent > 100 ? 'danger' : percent >= 80 ? 'warn' : '';
  const remaining = budget.spendLimit - spent;

  const slices = [...totalsByCategory(monthExpenses)].map(([id, amount]) => ({ id, label: categoryName(id), amount }));
  const budgetStatuses = categoryBudgetStatuses(monthExpenses, categoryBudgets);
  const flaggedBudgets = budgetStatuses.filter((s) => s.level !== 'ok').length;
  const upcoming = sortByDueDate(payments).slice(0, UPCOMING_LIMIT);
  const insights = buildInsights(expenses, categories, user, month);
  const showSetup = !isOnboarded(user.id) && expenses.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {user.firstName}</h1>
          <p className="muted">{formatMonth(month)} overview</p>
        </div>
        <div className="row">
          <Link className="button-link" to="/expenses">+ Add expense</Link>
          <Link className="button-link secondary" to="/payments">Schedule payment</Link>
        </div>
      </div>

      {showSetup && (
        <section className="card setup-card" aria-labelledby="setup-title">
          <div>
            <h2 id="setup-title">Let&rsquo;s set up your budget</h2>
            <p>Three quick steps: monthly budget, categories and your first expense.</p>
          </div>
          <Link className="button-link" to="/welcome">Start setup</Link>
        </section>
      )}

      <div className="grid">
        <StatCard label="Spent this month" value={formatMoney(spent)} hint={`${monthExpenses.length} transaction${monthExpenses.length === 1 ? '' : 's'}`} />
        <StatCard label="Spending limit" value={hasIncome ? formatMoney(budget.spendLimit) : '\u2014'} hint={hasIncome ? 'after tax and savings' : <Link to="/profile">Set your income</Link>} />
        <StatCard
          label="Remaining"
          value={hasIncome ? formatMoney(remaining) : '\u2014'}
          tone={!hasIncome ? 'default' : remaining < 0 ? 'danger' : percent >= 80 ? 'warn' : 'good'}
        />
        <StatCard
          label="Payments needing attention"
          value={activeReminders.length}
          tone={activeReminders.length > 0 ? 'warn' : 'default'}
          hint={<Link to="/payments">View payments</Link>}
        />
      </div>

      <section className="card">
        <h2>Monthly budget</h2>
        {hasIncome ? (
          <>
            <div
              className={`bar ${barClass}`}
              role="progressbar"
              aria-label="Monthly budget used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(Math.round(percent), 100)}
              aria-valuetext={`${Math.round(percent)}% used`}
            >
              <div style={{ width: `${Math.min(percent, 100)}%` }} />
            </div>
            <p className="muted">
              {Math.round(percent)}% of {formatMoney(budget.spendLimit)} used (income {formatMoney(budget.gross)} &minus; tax {formatMoney(budget.tax)} &minus; savings {formatMoney(budget.savings)})
            </p>
          </>
        ) : (
          <p>Set your monthly income in <Link to="/profile">Profile</Link> to see how much you should spend.</p>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2>Spending by category</h2>
          <CategoryChart slices={slices} emptyText="No expenses this month yet." />
          {slices.length === 0 && <Link className="button-link" to="/expenses">Add your first expense</Link>}
        </section>
        <section className="card">
          <h2>Category budgets {flaggedBudgets > 0 && <span className="badge level-warn">{flaggedBudgets} need attention</span>}</h2>
          {budgetStatuses.length === 0 ? (
            <p className="empty">No category limits yet. <Link to="/categories">Set monthly limits</Link> to get alerts as you approach them.</p>
          ) : (
            <BudgetAlerts statuses={budgetStatuses} categoryName={categoryName} />
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>Upcoming payments</h2>
          {upcoming.length === 0 ? (
            <p className="empty">No scheduled payments. <Link to="/payments">Add a bill or subscription</Link>.</p>
          ) : (
            <PaymentList payments={upcoming} today={today} categoryName={categoryName} />
          )}
        </section>
        <section className="card">
          <h2>Suggestions</h2>
          {insights.map((i) => <div key={i.text} className={`insight ${i.level}`}>{i.text}</div>)}
        </section>
      </div>

      <section className="card">
        <h2>Recent expenses</h2>
        {monthExpenses.length === 0 ? <p className="empty">Nothing yet. <Link to="/expenses">Add an expense</Link>.</p> : (
          <ExpenseTable expenses={monthExpenses.slice(0, RECENT_LIMIT)} categoryName={categoryName} caption="Recent expenses this month" />
        )}
      </section>
    </>
  );
}