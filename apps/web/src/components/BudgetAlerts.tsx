import { formatMoney } from '@manage-expenses/core';
import type { CategoryBudgetStatus } from '../utils/budgets';

interface BudgetAlertsProps {
  statuses: CategoryBudgetStatus[];
  categoryName: (id: string) => string;
}

const LEVEL_TEXT = { ok: 'On track', warn: 'Close to limit', over: 'Over budget' } as const;

export function BudgetAlerts({ statuses, categoryName }: BudgetAlertsProps) {
  return (
    <ul className="budget-list">
      {statuses.map((s) => (
        <li key={s.categoryId} className={`budget-item level-${s.level}`}>
          <div className="budget-head">
            <strong>{categoryName(s.categoryId)}</strong>
            <span className={`badge level-${s.level}`}>{LEVEL_TEXT[s.level]}</span>
          </div>
          <div
            className={`bar ${s.level === 'over' ? 'danger' : s.level === 'warn' ? 'warn' : ''}`}
            role="progressbar"
            aria-label={`${categoryName(s.categoryId)} budget used`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.round(s.percent), 100)}
            aria-valuetext={`${Math.round(s.percent)}% used`}
          >
            <div style={{ width: `${Math.min(s.percent, 100)}%` }} />
          </div>
          <p className="muted">
            {formatMoney(s.spent)} of {formatMoney(s.budget)}
            {s.level === 'over' ? ` \u2014 ${formatMoney(s.spent - s.budget)} over` : ` \u2014 ${formatMoney(s.budget - s.spent)} left`}
          </p>
        </li>
      ))}
    </ul>
  );
}