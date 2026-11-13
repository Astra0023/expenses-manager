import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className={`card stat-card tone-${tone}`}>
      <p className="muted">{label}</p>
      <p className="stat">{value}</p>
      {hint && <p className="muted">{hint}</p>}
    </div>
  );
}