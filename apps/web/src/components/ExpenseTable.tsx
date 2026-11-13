import type { ReactNode } from 'react';
import { formatMoney, type Expense } from '@manage-expenses/core';
import { formatDate } from '../utils/dates';

interface ExpenseTableProps {
  expenses: Expense[];
  categoryName: (id: string) => string;
  caption: string;
  showNote?: boolean;
  renderActions?: (expense: Expense) => ReactNode;
}

/** Table on wide screens; each row collapses into a labelled card on small screens. */
export function ExpenseTable({ expenses, categoryName, caption, showNote = true, renderActions }: ExpenseTableProps) {
  return (
    <table className="responsive">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Category</th>
          {showNote && <th scope="col">Note</th>}
          <th scope="col" className="num">Amount</th>
          {renderActions && <th scope="col"><span className="sr-only">Actions</span></th>}
        </tr>
      </thead>
      <tbody>
        {expenses.map((e) => (
          <tr key={e.id}>
            <td data-label="Date">{formatDate(e.date)}</td>
            <td data-label="Category">{categoryName(e.categoryId)}</td>
            {showNote && <td data-label="Note">{e.note || <span className="muted">&mdash;</span>}</td>}
            <td data-label="Amount" className="num">{formatMoney(e.amount)}</td>
            {renderActions && <td className="actions">{renderActions(e)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}