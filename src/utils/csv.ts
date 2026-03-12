export type CsvRow = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
}

const normalizeLines = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

const detectDelimiter = (headerLine: string) => {
  const candidates = [',', ';', '\t'];
  const counts = candidates.map((delim) => ({
    delim,
    count: headerLine.split(delim).length - 1,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].delim : ',';
};

const parseCsvLine = (line: string, delimiter: string) => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
};

export const parseCsvText = (text: string): ParsedCsv => {
  const lines = normalizeLines(text);
  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: ',' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i], delimiter);
    if (fields.every((f) => f.trim() === '')) continue;
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = fields[index]?.trim() ?? '';
    });
    rows.push(row);
  }

  return { headers, rows, delimiter };
};

const toNumber = (value: string) => {
  if (!value) return null;
  const normalized = value.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parseEpoch = (value: string) => {
  const num = toNumber(value);
  if (num === null) return null;
  if (num > 1e12) return Math.round(num);
  if (num > 1e9) return Math.round(num * 1000);
  return null;
};

const parseDate = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseTimestamp = (value: string) => {
  return parseEpoch(value) ?? parseDate(value);
};

export const detectNumericColumns = (headers: string[], rows: CsvRow[]) => {
  return headers.filter((header) => {
    let numeric = 0;
    let total = 0;
    rows.forEach((row) => {
      const value = row[header];
      if (value === undefined || value === '') return;
      total += 1;
      if (toNumber(value) !== null) numeric += 1;
    });
    return total > 0 && numeric / total >= 0.7;
  });
};

export const detectTimeColumns = (headers: string[], rows: CsvRow[]) => {
  return headers.filter((header) => {
    const lower = header.toLowerCase();
    const looksLikeTime =
      lower.includes('time') ||
      lower.includes('timestamp') ||
      lower.includes('date') ||
      lower.includes('datetime');

    if (!looksLikeTime) return false;
    let valid = 0;
    let total = 0;
    rows.slice(0, 50).forEach((row) => {
      const value = row[header];
      if (!value) return;
      total += 1;
      if (parseTimestamp(value) !== null) valid += 1;
    });
    return total > 0 && valid / total >= 0.6;
  });
};

export const toNumericSeries = (rows: CsvRow[], column: string) => {
  return rows
    .map((row) => toNumber(row[column]))
    .filter((value): value is number => value !== null);
};
