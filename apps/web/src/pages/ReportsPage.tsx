import { useState } from 'react';
import {
  XLSX_MIME,
  availableYears,
  buildReport,
  buildReportWorkbook,
  reportFileName,
  reportMonthLabel,
  summarizeReport,
  useApp,
  useMoney,
  type ReportPeriod,
} from '@manage-expenses/core';
import { downloadBlob } from '../utils/download';
import { errorMessage } from '../utils/errors';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly comparison' },
];
const MAX_BARS = 12;

function downloadFile(bytes: Uint8Array, fileName: string) {
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), fileName);
}

export function ReportsPage() {
  const { expenses, categories, categoryName } = useApp();
  const money = useMoney();
  const [period, setPeriod] = useState<ReportPeriod>('yearly');
  const [categoryId, setCategoryId] = useState('All');
  const [year, setYear] = useState('All');

  const years = availableYears(expenses);
  const currentYear = String(new Date().getFullYear());
  const yearlyYears = [...new Set([currentYear, ...years.filter((y) => y <= currentYear)])].sort().reverse();
  const reportYear = period === 'yearly' && !yearlyYears.includes(year) ? currentYear : year;
  const options = { period, categoryId, year: period === 'yearly' ? reportYear : year };
  const rows = buildReport(expenses, options);
  const summary = summarizeReport(rows);
  const periodLabel = PERIODS.find((p) => p.value === period)!.label;
  const chartRows = rows.slice(0, MAX_BARS).reverse();
  const maxTotal = Math.max(...chartRows.map((r) => r.total), 1);

  const [exportError, setExportError] = useState('');
  const handleExport = () => {
    setExportError('');
    try {
      downloadFile(buildReportWorkbook(expenses, categories, options), reportFileName(period));
    } catch (err) {
      setExportError(errorMessage(err, 'Export failed.'));
    }
  };

  return (
    <>
      <h1>Reports</h1>
      <section className="card row">
        <label>Report
          <select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label>Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="All">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'inactive' ? ' (inactive)' : ''}</option>)}
          </select>
        </label>
        <label>Year
          <select value={period === 'yearly' ? reportYear : year} onChange={(e) => setYear(e.target.value)}>
            {period !== 'yearly' && <option value="All">All years</option>}
            {(period === 'yearly' ? yearlyYears : years).map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <button onClick={handleExport} disabled={period === 'yearly' ? rows.length === 0 : summary.count === 0}>Export to Excel</button>
      </section>

      <div className="grid">
        <div className="card"><p className="muted">Total</p><p className="stat">{money(summary.total)}</p></div>
        <div className="card"><p className="muted">Transactions</p><p className="stat">{summary.count}</p></div>
        <div className="card"><p className="muted">Average per {period === 'quarterly' ? 'quarter' : period === 'yearly' || period === 'monthly' ? 'month' : 'year'}</p><p className="stat">{money(summary.average)}</p></div>
        <div className="card">
          <p className="muted">Highest period</p>
          <p className="stat">{summary.highest ? summary.highest.label : '\u2014'}</p>
          {summary.highest && <p className="muted">{money(summary.highest.total)}</p>}
        </div>
      </div>

      {(period === 'yearly' ? rows.length === 0 : summary.count === 0) ? (
        <section className="card"><p>No data for this selection.</p></section>
      ) : (
        <>
          <section className="card">
            <h2>{period === 'yearly' ? `Yearly spending in ${reportYear}` : `${periodLabel} spending${rows.length > MAX_BARS ? ` (latest ${MAX_BARS})` : ''}`}</h2>
            <div className={period === 'yearly' ? 'chart chart-yearly' : 'chart'} role="img" aria-label={`${periodLabel} spending chart`}>
              {chartRows.map((r) => (
                <div key={r.key} className="chart-col" title={`${r.label}: ${money(r.total)}`}>
                  <span className="chart-value">{money(r.total)}</span>
                  <div className="chart-bar" style={{ height: `${(r.total / maxTotal) * 100}%`, minHeight: r.total === 0 ? 0 : undefined }} />
                  <span className="chart-label">{period === 'yearly' ? reportMonthLabel(r.key) : r.label}</span>
                </div>
              ))}
            </div>
          </section>

          {summary.categories.length > 0 && <section className="card">
            <h2>By category</h2>
            {summary.categories.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{categoryName(c.id)}</span>
                  <span>{money(c.amount)} ({Math.round(c.percent)}%)</span>
                </div>
                <div className="bar"><div style={{ width: `${c.percent}%` }} /></div>
              </div>
            ))}
          </section>}

          <section className="card">
            <h2>{period === 'yearly' ? `${reportYear} yearly report` : `${periodLabel} report`}</h2>
            <table className="responsive">
              <thead><tr><th scope="col">{period === 'yearly' ? 'Month' : 'Period'}</th><th scope="col">Count</th><th scope="col">Total</th><th scope="col">By category</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td data-label={period === 'yearly' ? 'Month' : 'Period'}>{period === 'yearly' ? reportMonthLabel(r.key) : r.label}</td><td data-label="Count">{r.count}</td><td data-label="Total">{money(r.total)}</td>
                    <td data-label="By category">{Object.entries(r.byCategory).map(([id, v]) => `${categoryName(id)}: ${money(v)}`).join(' \u00b7 ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
