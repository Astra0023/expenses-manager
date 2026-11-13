import { formatMoney } from '@manage-expenses/core';

export interface ChartSlice {
  id: string;
  label: string;
  amount: number;
}

interface CategoryChartProps {
  slices: ChartSlice[];
  emptyText?: string;
}

export const CHART_COLORS = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#db2777', '#0891b2', '#65a30d', '#64748b'];
const MAX_SLICES = 6;
const OTHER_ID = '__other__';

function groupSlices(slices: ChartSlice[]): ChartSlice[] {
  const sorted = slices.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
  if (sorted.length <= MAX_SLICES) return sorted;
  const rest = sorted.slice(MAX_SLICES - 1).reduce((sum, s) => sum + s.amount, 0);
  return [...sorted.slice(0, MAX_SLICES - 1), { id: OTHER_ID, label: 'Other categories', amount: rest }];
}

/** Donut chart with a visible legend that doubles as the text alternative. */
export function CategoryChart({ slices, emptyText = 'No spending yet this month.' }: CategoryChartProps) {
  const items = groupSlices(slices);
  const total = items.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) return <p className="empty">{emptyText}</p>;

  let offset = 0;
  const arcs = items.map((s, index) => {
    const percent = (s.amount / total) * 100;
    // r = 15.9155 gives a circumference of 100, so dash lengths are percentages.
    const arc = { ...s, percent, color: CHART_COLORS[index % CHART_COLORS.length], dashOffset: 25 - offset };
    offset += percent;
    return arc;
  });

  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 42 42" aria-hidden="true" focusable="false">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface-muted)" strokeWidth="6" />
        {arcs.map((a) => (
          <circle
            key={a.id}
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            stroke={a.color}
            strokeWidth="6"
            strokeDasharray={`${a.percent} ${100 - a.percent}`}
            strokeDashoffset={a.dashOffset}
          />
        ))}
        <text x="21" y="20" textAnchor="middle" className="donut-label">Total</text>
        <text x="21" y="25" textAnchor="middle" className="donut-total">{formatMoney(total)}</text>
      </svg>
      <ul className="legend" aria-label="Spending by category">
        {arcs.map((a) => (
          <li key={a.id}>
            <span className="swatch" style={{ background: a.color }} aria-hidden="true" />
            <span className="legend-name">{a.label}</span>
            <span className="legend-value">{formatMoney(a.amount)} <span className="muted">({Math.round(a.percent)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}