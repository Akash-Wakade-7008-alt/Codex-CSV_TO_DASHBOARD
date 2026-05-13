export type ColumnKind =
  | "empty"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "boolean"
  | "commonText"
  | "text"
  | "identifier"
  | "mixed";

export type ColumnRole = "measure" | "dimension" | "time" | "text" | "id" | "empty";

export type CellHint =
  | "missing"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "boolean"
  | "text";

export interface TopValue {
  value: string;
  count: number;
  share: number;
}

export interface NumericStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  range: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  sampleVariance: number;
  sampleStdDev: number;
  outlierCount: number;
  zeroCount: number;
  negativeCount: number;
}

export interface DateStats {
  count: number;
  min: Date;
  max: Date;
  rangeDays: number;
  granularity: "day" | "week" | "month" | "quarter" | "year" | "mixed";
}

export interface BooleanStats {
  trueCount: number;
  falseCount: number;
}

export interface ColumnProfile {
  name: string;
  index: number;
  type: ColumnKind;
  role: ColumnRole;
  confidence: number;
  firstRowValue: string;
  firstRowHint: CellHint;
  sampleValues: string[];
  totalCount: number;
  nonMissingCount: number;
  missingCount: number;
  missingRatio: number;
  distinctCount: number;
  uniqueRatio: number;
  topValues: TopValue[];
  averageTextLength: number;
  typeEvidence: Record<CellHint, number>;
  numericStats?: NumericStats;
  dateStats?: DateStats;
  booleanStats?: BooleanStats;
}

export type TypedValue = string | number | Date | boolean | null;

export interface TypedRow {
  __index: number;
  [column: string]: TypedValue | number;
}

export interface DatasetQuality {
  totalCells: number;
  missingCells: number;
  completeness: number;
  duplicateRows: number;
  parseErrors: number;
}

export interface DatasetProfile {
  fileName: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  firstDataRow: Record<string, string>;
  columns: ColumnProfile[];
  typedRows: TypedRow[];
  quality: DatasetQuality;
}

const MISSING_VALUES = new Set(["", "na", "n/a", "null", "undefined", "none", "-", "--"]);
const BOOLEAN_TRUE = new Set(["true", "t", "yes", "y", "1", "on"]);
const BOOLEAN_FALSE = new Set(["false", "f", "no", "n", "0", "off"]);

export function normalizeHeader(raw: string | undefined, index: number): string {
  const trimmed = String(raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : `Column ${index + 1}`;
}

export function toRawString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function isMissing(value: unknown): boolean {
  const normalized = toRawString(value).toLowerCase();
  return MISSING_VALUES.has(normalized);
}

export function parseBooleanValue(value: unknown): boolean | null {
  const normalized = toRawString(value).toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  return null;
}

export function parseNumericValue(
  value: unknown,
): { value: number; flavor: "number" | "currency" | "percent" } | null {
  let text = toRawString(value);
  if (isMissing(text)) return null;

  const hasPercent = /%$/.test(text);
  const hasCurrency = /[$€£₹¥]|usd|eur|gbp|inr|jpy/i.test(text);
  const negativeByParentheses = /^\(.*\)$/.test(text);

  text = text
    .replace(/[$€£₹¥]/g, "")
    .replace(/\b(usd|eur|gbp|inr|jpy)\b/gi, "")
    .replace(/,/g, "")
    .replace(/%$/g, "")
    .replace(/[()]/g, "")
    .trim();

  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;

  const signed = negativeByParentheses ? -Math.abs(parsed) : parsed;
  return {
    value: hasPercent ? signed / 100 : signed,
    flavor: hasPercent ? "percent" : hasCurrency ? "currency" : "number",
  };
}

export function parseDateValue(value: unknown): Date | null {
  const text = toRawString(value);
  if (isMissing(text)) return null;

  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (ymd) {
    return validDate(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  }

  const compactYmd = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactYmd) {
    return validDate(Number(compactYmd[1]), Number(compactYmd[2]) - 1, Number(compactYmd[3]));
  }

  const slash = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = normalizeYear(Number(slash[3]));
    if (first > 12) return validDate(year, second - 1, first);
    if (second > 12) return validDate(year, first - 1, second);
    return validDate(year, first - 1, second);
  }

  if (!/[a-z]/i.test(text)) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  if (year < 1900 || year > 2200) return null;
  return parsed;
}

export function classifyCell(value: unknown): CellHint {
  if (isMissing(value)) return "missing";
  const numeric = parseNumericValue(value);
  const date = parseDateValue(value);
  const bool = parseBooleanValue(value);
  if (date) return "date";
  if (numeric?.flavor === "currency") return "currency";
  if (numeric?.flavor === "percent") return "percent";
  if (numeric) return "number";
  if (bool !== null) return "boolean";
  return "text";
}

export function profileDataset(
  records: Array<Record<string, unknown>>,
  incomingHeaders: string[],
  fileName = "Untitled CSV",
  parseErrors = 0,
): DatasetProfile {
  const headers = dedupeHeaders(incomingHeaders.length ? incomingHeaders : collectHeaders(records));
  const normalizedRows = records
    .map((record) => normalizeRecord(record, headers))
    .filter((record) => headers.some((header) => !isMissing(record[header])));

  const columns = headers.map((header, index) => profileColumn(header, index, normalizedRows));
  const typedRows = normalizedRows.map((record, rowIndex) => {
    const typed: TypedRow = { __index: rowIndex + 1 };
    for (const column of columns) {
      typed[column.name] = parseTypedValue(record[column.name], column.type);
    }
    return typed;
  });

  const totalCells = normalizedRows.length * headers.length;
  const missingCells = columns.reduce((sum, column) => sum + column.missingCount, 0);

  return {
    fileName,
    rowCount: normalizedRows.length,
    columnCount: headers.length,
    headers,
    firstDataRow: normalizedRows[0] ?? {},
    columns,
    typedRows,
    quality: {
      totalCells,
      missingCells,
      completeness: totalCells ? 1 - missingCells / totalCells : 0,
      duplicateRows: countDuplicateRows(normalizedRows, headers),
      parseErrors,
    },
  };
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.abs(value) >= 100 ? 0 : 0,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

export function getColumnsByRole(profile: DatasetProfile, role: ColumnRole): ColumnProfile[] {
  return profile.columns.filter((column) => column.role === role);
}

export function getMeasureColumns(profile: DatasetProfile): ColumnProfile[] {
  return profile.columns.filter((column) => column.role === "measure");
}

export function getDimensionColumns(profile: DatasetProfile): ColumnProfile[] {
  return profile.columns.filter((column) => column.role === "dimension");
}

export function getTimeColumns(profile: DatasetProfile): ColumnProfile[] {
  return profile.columns.filter((column) => column.role === "time");
}

export function getTextColumns(profile: DatasetProfile): ColumnProfile[] {
  return profile.columns.filter((column) => column.role === "text");
}

function profileColumn(
  header: string,
  index: number,
  rows: Array<Record<string, string>>,
): ColumnProfile {
  const values = rows.map((row) => row[header] ?? "");
  const nonMissingValues = values.filter((value) => !isMissing(value));
  const totalCount = values.length;
  const nonMissingCount = nonMissingValues.length;
  const missingCount = totalCount - nonMissingCount;
  const missingRatio = totalCount ? missingCount / totalCount : 0;
  const firstRowValue = toRawString(values.find((value) => !isMissing(value)) ?? "");
  const firstRowHint = classifyCell(firstRowValue);
  const sampleValues = nonMissingValues.slice(0, 6);
  const topValues = getTopValues(nonMissingValues, Math.min(12, Math.max(3, nonMissingValues.length)));
  const distinctCount = topValues.length
    ? new Set(nonMissingValues.map((value) => value.toLowerCase())).size
    : 0;
  const uniqueRatio = nonMissingCount ? distinctCount / nonMissingCount : 0;
  const averageTextLength = nonMissingCount
    ? nonMissingValues.reduce((sum, value) => sum + value.length, 0) / nonMissingCount
    : 0;
  const typeEvidence = countTypeEvidence(nonMissingValues);
  const numericValues = nonMissingValues
    .map(parseNumericValue)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const dateValues = nonMissingValues
    .map(parseDateValue)
    .filter((date): date is Date => date !== null);
  const booleanValues = nonMissingValues
    .map(parseBooleanValue)
    .filter((value): value is boolean => value !== null);

  const numericRatio = nonMissingCount ? numericValues.length / nonMissingCount : 0;
  const dateRatio = nonMissingCount ? dateValues.length / nonMissingCount : 0;
  const booleanRatio = nonMissingCount ? booleanValues.length / nonMissingCount : 0;
  const name = header.toLowerCase();
  const flavorCounts = numericValues.reduce(
    (acc, entry) => {
      acc[entry.flavor] += 1;
      return acc;
    },
    { number: 0, currency: 0, percent: 0 },
  );

  let type: ColumnKind = "mixed";
  let role: ColumnRole = "dimension";
  let confidence = 0.5;

  if (nonMissingCount === 0) {
    type = "empty";
    role = "empty";
    confidence = 1;
  } else if (
    dateRatio >= 0.7 &&
    (firstRowHint === "date" || /date|time|day|month|year|created|updated|posted/i.test(header))
  ) {
    type = "date";
    role = "time";
    confidence = boundedConfidence(dateRatio);
  } else if (booleanRatio >= 0.85) {
    type = "boolean";
    role = "dimension";
    confidence = boundedConfidence(booleanRatio);
  } else if (looksLikeIdentifier(name, uniqueRatio, distinctCount, nonMissingCount, numericRatio)) {
    type = "identifier";
    role = "id";
    confidence = Math.max(0.7, Math.min(0.98, uniqueRatio));
  } else if (numericRatio >= 0.78) {
    if (flavorCounts.currency / numericValues.length >= 0.35 || /amount|price|cost|revenue|sales|profit|salary|pay|total/i.test(header)) {
      type = "currency";
    } else if (flavorCounts.percent / numericValues.length >= 0.35 || /rate|percent|percentage|pct|margin|discount/i.test(header)) {
      type = "percent";
    } else {
      type = "number";
    }
    role = "measure";
    confidence = boundedConfidence(numericRatio);
  } else if (dateRatio >= 0.8) {
    type = "date";
    role = "time";
    confidence = boundedConfidence(dateRatio);
  } else if (isCommonText(distinctCount, uniqueRatio, averageTextLength, nonMissingCount)) {
    type = "commonText";
    role = "dimension";
    confidence = Math.max(0.66, 1 - uniqueRatio);
  } else if (typeEvidence.text / Math.max(1, nonMissingCount) >= 0.5) {
    type = "text";
    role = "text";
    confidence = Math.max(0.62, Math.min(0.95, uniqueRatio + averageTextLength / 100));
  }

  const numericStats = role === "measure" ? summarizeNumbers(numericValues.map((entry) => entry.value)) : undefined;
  const dateStats = type === "date" ? summarizeDates(dateValues) : undefined;
  const booleanStats = type === "boolean" ? summarizeBooleans(booleanValues) : undefined;

  return {
    name: header,
    index,
    type,
    role,
    confidence,
    firstRowValue,
    firstRowHint,
    sampleValues,
    totalCount,
    nonMissingCount,
    missingCount,
    missingRatio,
    distinctCount,
    uniqueRatio,
    topValues,
    averageTextLength,
    typeEvidence,
    numericStats,
    dateStats,
    booleanStats,
  };
}

function parseTypedValue(value: unknown, type: ColumnKind): TypedValue {
  if (isMissing(value)) return null;
  if (type === "number" || type === "currency" || type === "percent") {
    return parseNumericValue(value)?.value ?? null;
  }
  if (type === "date") {
    return parseDateValue(value);
  }
  if (type === "boolean") {
    return parseBooleanValue(value);
  }
  return toRawString(value);
}

function validDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2200) return null;
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

function normalizeYear(year: number): number {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function boundedConfidence(ratio: number): number {
  return Math.max(0.55, Math.min(0.99, ratio));
}

function looksLikeIdentifier(
  name: string,
  uniqueRatio: number,
  distinctCount: number,
  nonMissingCount: number,
  numericRatio: number,
): boolean {
  const nameSuggestsId = /\bid\b|_id$|uuid|guid|code|sku|serial|account|invoice|order_no|customer_no/.test(name);
  if (nameSuggestsId && uniqueRatio >= 0.45) return true;
  return nonMissingCount >= 20 && uniqueRatio >= 0.94 && distinctCount > 15 && numericRatio < 0.98;
}

function isCommonText(
  distinctCount: number,
  uniqueRatio: number,
  averageTextLength: number,
  nonMissingCount: number,
): boolean {
  if (nonMissingCount === 0) return false;
  if (averageTextLength > 60 && uniqueRatio > 0.55) return false;
  if (distinctCount <= 2) return true;
  if (distinctCount <= Math.min(60, Math.max(8, Math.ceil(nonMissingCount * 0.35)))) return true;
  return uniqueRatio <= 0.35;
}

function countTypeEvidence(values: string[]): Record<CellHint, number> {
  const counts: Record<CellHint, number> = {
    missing: 0,
    number: 0,
    currency: 0,
    percent: 0,
    date: 0,
    boolean: 0,
    text: 0,
  };
  for (const value of values) {
    counts[classifyCell(value)] += 1;
  }
  return counts;
}

function summarizeNumbers(values: number[]): NumericStats | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const sampleVariance =
    count > 1 ? sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / (count - 1) : 0;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  return {
    count,
    sum,
    min: sorted[0],
    max: sorted[count - 1],
    range: sorted[count - 1] - sorted[0],
    mean,
    median,
    q1,
    q3,
    iqr,
    sampleVariance,
    sampleStdDev: Math.sqrt(sampleVariance),
    outlierCount: sorted.filter((value) => value < lowerFence || value > upperFence).length,
    zeroCount: sorted.filter((value) => value === 0).length,
    negativeCount: sorted.filter((value) => value < 0).length,
  };
}

function summarizeDates(values: Date[]): DateStats | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a.getTime() - b.getTime());
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const rangeDays = Math.max(0, (max.getTime() - min.getTime()) / 86_400_000);
  return {
    count: values.length,
    min,
    max,
    rangeDays,
    granularity: inferGranularity(sorted),
  };
}

function summarizeBooleans(values: boolean[]): BooleanStats | undefined {
  if (!values.length) return undefined;
  const trueCount = values.filter(Boolean).length;
  return { trueCount, falseCount: values.length - trueCount };
}

function quantile(sortedValues: number[], probability: number): number {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * probability;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];
  return next === undefined ? sortedValues[base] : sortedValues[base] + rest * (next - sortedValues[base]);
}

function inferGranularity(sortedDates: Date[]): DateStats["granularity"] {
  if (sortedDates.length < 3) return "mixed";
  const differences = sortedDates
    .slice(1)
    .map((date, index) => Math.round((date.getTime() - sortedDates[index].getTime()) / 86_400_000))
    .filter((days) => days > 0);
  if (!differences.length) return "mixed";
  const medianGap = quantile(differences.sort((a, b) => a - b), 0.5);
  if (medianGap <= 2) return "day";
  if (medianGap <= 10) return "week";
  if (medianGap <= 45) return "month";
  if (medianGap <= 120) return "quarter";
  if (medianGap <= 390) return "year";
  return "mixed";
}

function getTopValues(values: string[], limit: number): TopValue[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const raw of values) {
    const display = toRawString(raw);
    const key = display.toLowerCase();
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { display, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => ({
      value: entry.display,
      count: entry.count,
      share: values.length ? entry.count / values.length : 0,
    }));
}

function normalizeRecord(record: Record<string, unknown>, headers: string[]): Record<string, string> {
  const normalized: Record<string, string> = {};
  headers.forEach((header, index) => {
    normalized[header] = toRawString(record[header] ?? record[index] ?? "");
  });
  return normalized;
}

function collectHeaders(records: Array<Record<string, unknown>>): string[] {
  const found = new Set<string>();
  for (const record of records) {
    Object.keys(record).forEach((key) => found.add(key));
  }
  return [...found];
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const normalized = normalizeHeader(header, index);
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    return count === 0 ? normalized : `${normalized} ${count + 1}`;
  });
}

function countDuplicateRows(rows: Array<Record<string, string>>, headers: string[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const signature = headers.map((header) => row[header]).join("\u001f");
    if (seen.has(signature)) {
      duplicates += 1;
    } else {
      seen.add(signature);
    }
  }
  return duplicates;
}
