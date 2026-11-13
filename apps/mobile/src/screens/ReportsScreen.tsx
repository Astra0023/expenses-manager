import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
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
import { Button, Select } from '../ui';
import { shareXlsx } from '../export';
import { styles } from '../styles';

const PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly comparison' },
];
const MAX_BARS = 8;
const CHART_HEIGHT = 120;

export function ReportsScreen() {
  const { expenses, categories, categoryName } = useApp();
  const money = useMoney();
  const [period, setPeriod] = useState<ReportPeriod>('yearly');
  const [categoryId, setCategoryId] = useState('All');
  const [year, setYear] = useState('All');
  const [error, setError] = useState('');

  const years = availableYears(expenses);
  const currentYear = String(new Date().getFullYear());
  const yearlyYears = [...new Set([currentYear, ...years.filter((y) => y <= currentYear)])].sort().reverse();
  const reportYear = period === 'yearly' && !yearlyYears.includes(year) ? currentYear : year;
  const options = { period, categoryId, year: period === 'yearly' ? reportYear : year };
  const rows = buildReport(expenses, options);
  const summary = summarizeReport(rows);
  const chartRows = rows.slice(0, period === 'yearly' ? 12 : MAX_BARS).reverse();
  const maxTotal = Math.max(...chartRows.map((r) => r.total), 1);
  const chart = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT + 36, gap: 6 }}>
      {chartRows.map((r) => (
        <View key={r.key} style={{ width: period === 'yearly' ? 64 : undefined, flex: period === 'yearly' ? undefined : 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: 9, color: '#6b7280' }} numberOfLines={1}>{money(r.total)}</Text>
          <View style={{ width: '70%', height: r.total === 0 ? 0 : Math.max((r.total / maxTotal) * CHART_HEIGHT, 2), backgroundColor: '#2563eb', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          <Text style={{ fontSize: 9, marginTop: 4 }} numberOfLines={1}>{period === 'yearly' ? reportMonthLabel(r.key) : r.label}</Text>
        </View>
      ))}
    </View>
  );

  const handleExport = async () => {
    setError('');
    try {
      await shareXlsx(buildReportWorkbook(expenses, categories, options), reportFileName(period));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <View>
      <Text style={styles.title}>Reports</Text>
      <View style={styles.card}>
        <Select label="Report" value={period} options={PERIODS} onChange={(v) => setPeriod(v as ReportPeriod)} />
        <Select
          label="Category"
          value={categoryId}
          options={[{ value: 'All', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.status === 'inactive' ? `${c.name} (inactive)` : c.name }))]}
          onChange={setCategoryId}
        />
        <Select
          label="Year"
          value={period === 'yearly' ? reportYear : year}
          options={[
            ...(period !== 'yearly' ? [{ value: 'All', label: 'All years' }] : []),
            ...(period === 'yearly' ? yearlyYears : years).map((y) => ({ value: y, label: y })),
          ]}
          onChange={setYear}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title="Export to Excel" disabled={period === 'yearly' ? rows.length === 0 : summary.count === 0} onPress={handleExport} />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Dashboard</Text>
        <View style={styles.item}><Text>Total</Text><Text style={{ fontWeight: '700' }}>{money(summary.total)}</Text></View>
        <View style={styles.item}><Text>Transactions</Text><Text style={{ fontWeight: '700' }}>{summary.count}</Text></View>
        <View style={styles.item}><Text>Average per {period === 'quarterly' ? 'quarter' : period === 'yearly' || period === 'monthly' ? 'month' : 'period'}</Text><Text style={{ fontWeight: '700' }}>{money(summary.average)}</Text></View>
        <View style={styles.item}>
          <Text>Highest period</Text>
          <Text style={{ fontWeight: '700' }}>{summary.highest ? `${summary.highest.label} · ${money(summary.highest.total)}` : '—'}</Text>
        </View>
      </View>

      {(period === 'yearly' ? rows.length === 0 : summary.count === 0) ? (
        <View style={styles.card}><Text>No data for this selection.</Text></View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>{period === 'yearly' ? `Yearly spending in ${reportYear}` : `Spending${rows.length > MAX_BARS ? ` (latest ${MAX_BARS})` : ''}`}</Text>
            {period === 'yearly' ? <ScrollView horizontal>{chart}</ScrollView> : chart}
          </View>

          {summary.categories.length > 0 && <View style={styles.card}>
            <Text style={styles.h2}>By category</Text>
            {summary.categories.map((c) => (
              <View key={c.id}>
                <View style={styles.item}>
                  <Text>{categoryName(c.id)}</Text>
                  <Text>{money(c.amount)} ({Math.round(c.percent)}%)</Text>
                </View>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${c.percent}%` }]} /></View>
              </View>
            ))}
          </View>}

          <View style={styles.card}>
            <Text style={styles.h2}>{period === 'yearly' ? `${reportYear} yearly report` : 'Details'}</Text>
            {rows.map((r) => (
              <View key={r.key} style={{ marginBottom: 8 }}>
                <View style={styles.item}>
                  <Text style={{ fontWeight: '600' }}>{period === 'yearly' ? reportMonthLabel(r.key) : r.label} ({r.count})</Text>
                  <Text style={{ fontWeight: '600' }}>{money(r.total)}</Text>
                </View>
                {Object.entries(r.byCategory).map(([id, v]) => (
                  <View key={id} style={styles.item}><Text>   {categoryName(id)}</Text><Text>{money(v)}</Text></View>
                ))}
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
