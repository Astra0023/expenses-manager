import { strToU8, zipSync } from 'fflate';
import { buildReport, filterForReport, type ReportOptions } from './reports';
import type { Category, Expense } from './types';

export type CellValue = string | number;
export interface Sheet {
  name: string;
  rows: CellValue[][];
}

// Control characters other than tab/newline/CR are illegal in XML 1.0.
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const escapeXml = (s: string) =>
  s
    .replace(ILLEGAL_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetXml(rows: CellValue[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${columnLetter(c)}${r + 1}`;
          // Strings are stored as inline strings, so text such as "=SUM(...)" is never evaluated as a formula.
          return typeof value === 'number' && Number.isFinite(value)
            ? `<c r="${ref}"><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function safeSheetName(name: string, index: number): string {
  const clean = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
  return clean || `Sheet${index + 1}`;
}

/** Builds a minimal .xlsx workbook (a zip of XML parts) with no external services. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheets.map((s, i) => safeSheetName(s.name, i));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}</Relationships>`,
    ),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows));
  });
  return zipSync(files);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Summary (one row per period, one column per category) plus the matching expense details. */
export function buildReportWorkbook(expenses: Expense[], categories: Category[], options: ReportOptions, now = new Date()): Uint8Array {
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const rows = buildReport(expenses, options, now);
  const usedIds = [...new Set(rows.flatMap((r) => Object.keys(r.byCategory)))];

  const summary: CellValue[][] = [
    ['Period', 'Count', 'Total', ...usedIds.map(name)],
    ...rows.map((r) => [r.label, r.count, round(r.total), ...usedIds.map((id) => round(r.byCategory[id] ?? 0))]),
    ['Total', rows.reduce((s, r) => s + r.count, 0), round(rows.reduce((s, r) => s + r.total, 0)), ...usedIds.map((id) => round(rows.reduce((s, r) => s + (r.byCategory[id] ?? 0), 0)))],
  ];
  const details: CellValue[][] = [
    ['Date', 'Category', 'Note', 'Amount'],
    ...filterForReport(expenses, options, now)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => [e.date, name(e.categoryId), e.note, round(e.amount)]),
  ];
  return buildXlsx([
    { name: `${options.period} summary`, rows: summary },
    { name: 'Expenses', rows: details },
  ]);
}

const round = (n: number) => Math.round(n * 100) / 100;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 without relying on btoa/Buffer being available on every platform. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function reportFileName(period: string): string {
  return `expenses-${period}-report.xlsx`;
}
