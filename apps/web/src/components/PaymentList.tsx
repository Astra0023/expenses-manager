import { useMoney, type Payment } from '@manage-expenses/core';
import { formatDate } from '../utils/dates';
import { RECURRENCE_LABELS, STATUS_LABELS, describeDue, paymentStatus } from '../utils/payments';

interface PaymentListProps {
  payments: Payment[];
  today: string;
  categoryName: (id: string) => string;
  busyId?: string | null;
  onMarkPaid?: (payment: Payment) => void;
  onRemove?: (payment: Payment) => void;
}

export function PaymentList({ payments, today, categoryName, busyId, onMarkPaid, onRemove }: PaymentListProps) {
  const money = useMoney();
  return (
    <ul className="payment-list">
      {payments.map((p) => {
        const status = paymentStatus(p, today);
        const isBusy = busyId === p.id;
        return (
          <li key={p.id} className={`payment status-${status}`}>
            <div className="payment-main">
              <strong>{p.title}</strong>
              <span className="muted">
                {categoryName(p.categoryId)} &middot; {RECURRENCE_LABELS[p.recurrence]} &middot; due {formatDate(p.dueDate)}
              </span>
            </div>
            <div className="payment-meta">
              <span className="payment-amount">{money(p.amount)}</span>
              <span className={`badge status-${status}`} title={STATUS_LABELS[status]}>{describeDue(p, today)}</span>
            </div>
            {(onMarkPaid || onRemove) && (
              <div className="payment-actions">
                {onMarkPaid && (
                  <button type="button" className="secondary" disabled={isBusy} onClick={() => onMarkPaid(p)} aria-label={`Mark ${p.title} as paid and record it as an expense`}>
                    Mark paid
                  </button>
                )}
                {onRemove && (
                  <button type="button" className="link danger" disabled={isBusy} onClick={() => onRemove(p)} aria-label={`Delete ${p.title}`}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}