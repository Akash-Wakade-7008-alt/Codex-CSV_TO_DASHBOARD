import {
  ColumnProfile,
  DatasetProfile,
  TypedRow,
  formatNumber,
  getDimensionColumns,
  getMeasureColumns,
  getTextColumns,
  getTimeColumns,
} from "./csvProfile";

export type ChartKind =
  | "kpi"
  | "bar"
  | "horizontalBar"
  | "line"
  | "area"
  | "composed"
  | "pie"
  | "donut"
  | "scatter"
  | "bubble"
  | "radar"
  | "radial"
  | "treemap"
  | "funnel"
  | "stackedBar"
  | "stackedPercentBar"
  | "heatmap"
  | "correlationMatrix"
  | "box"
  | "waterfall"
  | "lollipop";

export interface ChartPlan {
  id: string;
  title: string;
  subtitle: string;
  kind: ChartKind;
  score: number;
  formula: string;
  columns: string[];
  data: ChartDatum[];
  xKey?: string;
  yKey?: string;
  yKeys?: string[];
  valueKey?: string;
  nameKey?: string;
  colorKey?: string;
}

export type ChartDatum = Record<string, string | number | null>;

interface PlannerContext {
  profile: DatasetProfile;
  rows: TypedRow[];
  measures: ColumnProfile[];
  dimensions: ColumnProfile[];
  timeColumns: ColumnProfile[];
  textColumns: ColumnProfile[];
  booleanColumns: ColumnProfile[];
  primaryMeasure?: ColumnProfile;
  secondaryMeasure?: ColumnProfile;
  tertiaryMeasure?: ColumnProfile;
  primaryDimension?: ColumnProfile;
  secondaryDimension?: ColumnProfile;
  primaryTime?: ColumnProfile;
  primaryText?: ColumnProfile;
  primaryBoolean?: ColumnProfile;
}

export const CHART_TEMPLATE_COUNT = 40;

export function buildChartPlans(profile: DatasetProfile, limit = CHART_TEMPLATE_COUNT): ChartPlan[] {
  const context = createContext(profile);
  const recipes: Array<(context: PlannerContext) => ChartPlan | null> = [
    datasetKpis,
    inferredTypeMix,
    missingValuesByColumn,
    completenessByColumn,
    distinctRatioByColumn,
    confidenceByColumn,
    measureMeanComparison,
    measureRangeComparison,
    outliersByMeasure,
    topCategoryCount,
    categoryShareDonut,
    categoryCountRadial,
    categoryTreemap,
    categoryFunnel,
    categoryValueSum,
    categoryValueAverage,
    categoryPareto,
    categoryLollipop,
    stackedCategoryCount,
    stackedPercentCategoryCount,
    categoryHeatmap,
    timeRowCount,
    timeValueSum,
    timeValueAverage,
    rollingTimeAverage,
    cumulativeTimeValue,
    monthPattern,
    dayOfWeekPattern,
    dateCoverage,
    measureHistogram,
    measureCdf,
    measureBoxPlot,
    measureScatter,
    measureBubble,
    correlationMatrix,
    categoryMeasureSpread,
    categoryRadar,
    textLengthHistogram,
    wordFrequency,
    booleanBreakdown,
    rowIndexTrend,
  ];

  return recipes
    .map((recipe) => recipe(context))
    .filter((plan): plan is ChartPlan => Boolean(plan && plan.data.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getFormulaAudit(profile: DatasetProfile): Array<{ label: string; formula: string }> {
  const measures = getMeasureColumns(profile);
  const formulas = [
    { label: "Completeness", formula: "completeness = 1 - missing_cells / total_cells" },
    { label: "Distinct ratio", formula: "distinct_ratio(column) = unique_non_null_values / non_null_values" },
    { label: "Type confidence", formula: "confidence = matching_values_for_inferred_type / non_null_values" },
    { label: "Mean", formula: "mean = sum(x_i) / n" },
    { label: "Median", formula: "median = Q(0.50), the 50th percentile after sorting values" },
    { label: "Sample variance", formula: "s^2 = sum((x_i - mean)^2) / (n - 1)" },
    { label: "Sample standard deviation", formula: "s = sqrt(s^2)" },
    { label: "IQR outlier fence", formula: "outlier if x < Q1 - 1.5*IQR or x > Q3 + 1.5*IQR" },
    { label: "Pearson correlation", formula: "r = cov(x,y) / (s_x * s_y)" },
    { label: "Pareto cumulative share", formula: "cum_share_k = sum(value_1..value_k) / sum(all_values)" },
    { label: "Rolling average", formula: "rolling_avg_t = sum(x_{t-w+1}..x_t) / w" },
    { label: "Histogram bin count", formula: "bins = ceil(log2(n) + 1), bounded between 6 and 18" },
  ];

  if (measures.length) {
    const best = measures[0];
    formulas.unshift({
      label: `${best.name} summary`,
      formula: `${best.name}: sum=${formatNumber(best.numericStats?.sum ?? 0)}, mean=${formatNumber(best.numericStats?.mean ?? 0)}, median=${formatNumber(best.numericStats?.median ?? 0)}`,
    });
  }

  return formulas;
}

function createContext(profile: DatasetProfile): PlannerContext {
  const measures = getMeasureColumns(profile)
    .filter((column) => Boolean(column.numericStats))
    .sort((a, b) => metricScore(b) - metricScore(a));
  const dimensions = getDimensionColumns(profile)
    .filter((column) => column.distinctCount > 0)
    .sort((a, b) => dimensionScore(b) - dimensionScore(a));
  const timeColumns = getTimeColumns(profile)
    .filter((column) => Boolean(column.dateStats))
    .sort((a, b) => (b.dateStats?.count ?? 0) - (a.dateStats?.count ?? 0));
  const textColumns = getTextColumns(profile).sort((a, b) => b.nonMissingCount - a.nonMissingCount);
  const booleanColumns = profile.columns.filter((column) => column.type === "boolean");

  return {
    profile,
    rows: profile.typedRows,
    measures,
    dimensions,
    timeColumns,
    textColumns,
    booleanColumns,
    primaryMeasure: measures[0],
    secondaryMeasure: measures[1],
    tertiaryMeasure: measures[2],
    primaryDimension: dimensions[0],
    secondaryDimension: dimensions[1],
    primaryTime: timeColumns[0],
    primaryText: textColumns[0],
    primaryBoolean: booleanColumns[0],
  };
}

function datasetKpis(context: PlannerContext): ChartPlan {
  const { profile } = context;
  return {
    id: "dataset-kpis",
    title: "Dataset Health",
    subtitle: `${profile.rowCount.toLocaleString()} rows, ${profile.columnCount.toLocaleString()} columns`,
    kind: "kpi",
    score: 100,
    formula: "completeness = 1 - missing_cells / total_cells; duplicates = rows - unique_rows",
    columns: profile.headers,
    data: [
      { label: "Rows", value: profile.rowCount, detail: "records" },
      { label: "Columns", value: profile.columnCount, detail: "fields" },
      { label: "Completeness", value: Math.round(profile.quality.completeness * 1000) / 10, detail: "percent" },
      { label: "Duplicates", value: profile.quality.duplicateRows, detail: "rows" },
    ],
  };
}

function inferredTypeMix(context: PlannerContext): ChartPlan {
  const data = groupCounts(context.profile.columns.map((column) => column.type));
  return {
    id: "type-mix",
    title: "Inferred Type Mix",
    subtitle: "Column roles selected from the first row plus full-column evidence",
    kind: "donut",
    score: 96,
    formula: "type_count = count(columns where inferred_type = type)",
    columns: context.profile.headers,
    data,
    nameKey: "label",
    valueKey: "value",
  };
}

function missingValuesByColumn(context: PlannerContext): ChartPlan {
  const data = context.profile.columns
    .map((column) => ({ label: column.name, value: column.missingCount }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 16);
  return {
    id: "missing-values",
    title: "Missing Values",
    subtitle: "Columns with the most empty cells",
    kind: "horizontalBar",
    score: data.length ? 94 : 48,
    formula: "missing_count(column) = count(empty, null, na, n/a, -, --)",
    columns: context.profile.headers,
    data: data.length ? data : context.profile.columns.slice(0, 8).map((column) => ({ label: column.name, value: 0 })),
    xKey: "label",
    yKey: "value",
  };
}

function completenessByColumn(context: PlannerContext): ChartPlan {
  return {
    id: "completeness",
    title: "Column Completeness",
    subtitle: "Non-empty share per field",
    kind: "bar",
    score: 92,
    formula: "column_completeness = non_missing_count / total_rows",
    columns: context.profile.headers,
    data: context.profile.columns
      .map((column) => ({ label: column.name, value: roundPct(1 - column.missingRatio) }))
      .sort((a, b) => Number(a.value) - Number(b.value))
      .slice(0, 16),
    xKey: "label",
    yKey: "value",
  };
}

function distinctRatioByColumn(context: PlannerContext): ChartPlan {
  return {
    id: "distinct-ratio",
    title: "Distinct Ratio",
    subtitle: "Low ratios behave like categories; high ratios behave like identifiers or text",
    kind: "bar",
    score: 91,
    formula: "distinct_ratio = distinct_non_null_values / non_null_values",
    columns: context.profile.headers,
    data: context.profile.columns
      .map((column) => ({ label: column.name, value: roundPct(column.uniqueRatio) }))
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 16),
    xKey: "label",
    yKey: "value",
  };
}

function confidenceByColumn(context: PlannerContext): ChartPlan {
  return {
    id: "type-confidence",
    title: "Inference Confidence",
    subtitle: "Share of values matching the selected column type",
    kind: "bar",
    score: 90,
    formula: "confidence = matching_values_for_inferred_type / non_null_values",
    columns: context.profile.headers,
    data: context.profile.columns
      .map((column) => ({ label: column.name, value: roundPct(column.confidence) }))
      .sort((a, b) => Number(a.value) - Number(b.value))
      .slice(0, 16),
    xKey: "label",
    yKey: "value",
  };
}

function measureMeanComparison(context: PlannerContext): ChartPlan | null {
  if (context.measures.length < 2) return null;
  return {
    id: "measure-means",
    title: "Measure Means",
    subtitle: "Average value for every numeric field",
    kind: "bar",
    score: 86,
    formula: "mean(column) = sum(x_i) / n",
    columns: context.measures.map((column) => column.name),
    data: context.measures.slice(0, 12).map((column) => ({ label: column.name, value: column.numericStats?.mean ?? 0 })),
    xKey: "label",
    yKey: "value",
  };
}

function measureRangeComparison(context: PlannerContext): ChartPlan | null {
  if (context.measures.length < 2) return null;
  return {
    id: "measure-ranges",
    title: "Measure Ranges",
    subtitle: "Max minus min for numeric columns",
    kind: "bar",
    score: 84,
    formula: "range(column) = max(x) - min(x)",
    columns: context.measures.map((column) => column.name),
    data: context.measures.slice(0, 12).map((column) => ({ label: column.name, value: column.numericStats?.range ?? 0 })),
    xKey: "label",
    yKey: "value",
  };
}

function outliersByMeasure(context: PlannerContext): ChartPlan | null {
  if (!context.measures.length) return null;
  return {
    id: "outliers",
    title: "Outlier Counts",
    subtitle: "IQR fence by numeric field",
    kind: "bar",
    score: 83,
    formula: "outlier if x < Q1 - 1.5*IQR or x > Q3 + 1.5*IQR",
    columns: context.measures.map((column) => column.name),
    data: context.measures.slice(0, 12).map((column) => ({ label: column.name, value: column.numericStats?.outlierCount ?? 0 })),
    xKey: "label",
    yKey: "value",
  };
}

function topCategoryCount(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  if (!dimension) return null;
  return {
    id: "top-category-count",
    title: `Top ${dimension.name}`,
    subtitle: "Most frequent category values",
    kind: "horizontalBar",
    score: 89 + dimension.confidence,
    formula: "count(category) = number of rows where dimension = category",
    columns: [dimension.name],
    data: aggregateByCategory(context.rows, dimension.name, undefined, "count", 12),
    xKey: "label",
    yKey: "value",
  };
}

function categoryShareDonut(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  if (!dimension) return null;
  return {
    id: "category-share",
    title: `${dimension.name} Share`,
    subtitle: "Share of top categories by row count",
    kind: "donut",
    score: 88,
    formula: "share(category) = count(category) / total_non_null_category_rows",
    columns: [dimension.name],
    data: aggregateByCategory(context.rows, dimension.name, undefined, "count", 8),
    nameKey: "label",
    valueKey: "value",
  };
}

function categoryCountRadial(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  if (!dimension) return null;
  return {
    id: "category-radial",
    title: `${dimension.name} Radial Rank`,
    subtitle: "Top category counts in radial form",
    kind: "radial",
    score: 78,
    formula: "ranked_count(category) = sorted count(category)",
    columns: [dimension.name],
    data: aggregateByCategory(context.rows, dimension.name, undefined, "count", 8),
    nameKey: "label",
    valueKey: "value",
  };
}

function categoryTreemap(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  if (!dimension) return null;
  return {
    id: "category-treemap",
    title: `${dimension.name} Treemap`,
    subtitle: "Area is proportional to row count",
    kind: "treemap",
    score: 77,
    formula: "area(category) proportional to count(category)",
    columns: [dimension.name],
    data: aggregateByCategory(context.rows, dimension.name, undefined, "count", 18),
    nameKey: "label",
    valueKey: "value",
  };
}

function categoryFunnel(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  if (!dimension) return null;
  return {
    id: "category-funnel",
    title: `${dimension.name} Funnel`,
    subtitle: "Top categories as a descending funnel",
    kind: "funnel",
    score: 76,
    formula: "funnel_step(category) = sorted count(category)",
    columns: [dimension.name],
    data: aggregateByCategory(context.rows, dimension.name, undefined, "count", 8),
    nameKey: "label",
    valueKey: "value",
  };
}

function categoryValueSum(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  const measure = context.primaryMeasure;
  if (!dimension || !measure) return null;
  return {
    id: "category-sum",
    title: `${measure.name} by ${dimension.name}`,
    subtitle: "Top categories by total value",
    kind: "bar",
    score: 94,
    formula: "sum(category) = sum(x_i where dimension_i = category)",
    columns: [dimension.name, measure.name],
    data: aggregateByCategory(context.rows, dimension.name, measure.name, "sum", 12),
    xKey: "label",
    yKey: "value",
  };
}

function categoryValueAverage(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  const measure = context.primaryMeasure;
  if (!dimension || !measure) return null;
  return {
    id: "category-average",
    title: `Average ${measure.name}`,
    subtitle: `Mean ${measure.name} by ${dimension.name}`,
    kind: "bar",
    score: 87,
    formula: "avg(category) = sum(x_i where dimension_i = category) / count(category)",
    columns: [dimension.name, measure.name],
    data: aggregateByCategory(context.rows, dimension.name, measure.name, "avg", 12),
    xKey: "label",
    yKey: "value",
  };
}

function categoryPareto(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  const measure = context.primaryMeasure;
  if (!dimension || !measure) return null;
  const ranked = aggregateByCategory(context.rows, dimension.name, measure.name, "sum", 12);
  const total = ranked.reduce((sum, item) => sum + Number(item.value), 0);
  let running = 0;
  const data = ranked.map((item) => {
    running += Number(item.value);
    return { ...item, cumulative: total ? roundPct(running / total) : 0 };
  });
  return {
    id: "category-pareto",
    title: `${measure.name} Pareto`,
    subtitle: `Cumulative contribution by ${dimension.name}`,
    kind: "composed",
    score: 85,
    formula: "cum_share_k = sum(value_1..value_k) / sum(all_values)",
    columns: [dimension.name, measure.name],
    data,
    xKey: "label",
    yKey: "value",
    yKeys: ["value", "cumulative"],
  };
}

function categoryLollipop(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  const measure = context.primaryMeasure;
  if (!dimension || !measure) return null;
  return {
    id: "category-lollipop",
    title: `${dimension.name} Rank`,
    subtitle: `Lollipop rank by total ${measure.name}`,
    kind: "lollipop",
    score: 75,
    formula: "rank(category) = order_desc(sum(value by category))",
    columns: [dimension.name, measure.name],
    data: aggregateByCategory(context.rows, dimension.name, measure.name, "sum", 10).reverse(),
    xKey: "label",
    yKey: "value",
  };
}

function stackedCategoryCount(context: PlannerContext): ChartPlan | null {
  const first = context.primaryDimension;
  const second = context.secondaryDimension;
  if (!first || !second) return null;
  const { data, keys } = stackByTwoCategories(context.rows, first.name, second.name, false);
  return {
    id: "stacked-category-count",
    title: `${first.name} x ${second.name}`,
    subtitle: "Stacked row counts across two dimensions",
    kind: "stackedBar",
    score: 84,
    formula: "count(a,b) = rows where dimension_a = a and dimension_b = b",
    columns: [first.name, second.name],
    data,
    xKey: "label",
    yKeys: keys,
  };
}

function stackedPercentCategoryCount(context: PlannerContext): ChartPlan | null {
  const first = context.primaryDimension;
  const second = context.secondaryDimension;
  if (!first || !second) return null;
  const { data, keys } = stackByTwoCategories(context.rows, first.name, second.name, true);
  return {
    id: "stacked-percent-category-count",
    title: `${second.name} Mix`,
    subtitle: `100% stacked composition within ${first.name}`,
    kind: "stackedPercentBar",
    score: 82,
    formula: "percent(a,b) = count(a,b) / sum_b(count(a,b))",
    columns: [first.name, second.name],
    data,
    xKey: "label",
    yKeys: keys,
  };
}

function categoryHeatmap(context: PlannerContext): ChartPlan | null {
  const first = context.primaryDimension;
  const second = context.secondaryDimension;
  if (!first || !second) return null;
  return {
    id: "category-heatmap",
    title: `${first.name} Heatmap`,
    subtitle: `${second.name} distribution by ${first.name}`,
    kind: "heatmap",
    score: 80,
    formula: "heat(a,b) = count(rows where dimension_a = a and dimension_b = b)",
    columns: [first.name, second.name],
    data: heatmapByTwoCategories(context.rows, first.name, second.name),
  };
}

function timeRowCount(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  if (!date) return null;
  return {
    id: "time-row-count",
    title: `${date.name} Volume`,
    subtitle: "Row count by time bucket",
    kind: "line",
    score: 90,
    formula: "count(bucket) = rows where date falls in bucket",
    columns: [date.name],
    data: timeSeries(context.rows, date, undefined, "count"),
    xKey: "label",
    yKey: "value",
  };
}

function timeValueSum(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  const measure = context.primaryMeasure;
  if (!date || !measure) return null;
  return {
    id: "time-value-sum",
    title: `${measure.name} Over Time`,
    subtitle: `Total ${measure.name} by ${date.dateStats?.granularity ?? "time"} bucket`,
    kind: "area",
    score: 93,
    formula: "sum(bucket) = sum(x_i where date_i is in bucket)",
    columns: [date.name, measure.name],
    data: timeSeries(context.rows, date, measure.name, "sum"),
    xKey: "label",
    yKey: "value",
  };
}

function timeValueAverage(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  const measure = context.primaryMeasure;
  if (!date || !measure) return null;
  return {
    id: "time-value-average",
    title: `Average ${measure.name} Trend`,
    subtitle: `Mean ${measure.name} by time bucket`,
    kind: "line",
    score: 86,
    formula: "avg(bucket) = sum(x_i in bucket) / count(x_i in bucket)",
    columns: [date.name, measure.name],
    data: timeSeries(context.rows, date, measure.name, "avg"),
    xKey: "label",
    yKey: "value",
  };
}

function rollingTimeAverage(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  const measure = context.primaryMeasure;
  if (!date || !measure) return null;
  const series = timeSeries(context.rows, date, measure.name, "sum");
  const data = series.map((entry, index) => {
    const start = Math.max(0, index - 2);
    const window = series.slice(start, index + 1);
    return {
      label: entry.label,
      value: Number(entry.value),
      rolling: window.reduce((sum, item) => sum + Number(item.value), 0) / window.length,
    };
  });
  return {
    id: "rolling-average",
    title: `${measure.name} Rolling Average`,
    subtitle: "Three-bucket moving average over time",
    kind: "composed",
    score: 79,
    formula: "rolling_avg_t = sum(x_{t-2}, x_{t-1}, x_t) / 3",
    columns: [date.name, measure.name],
    data,
    xKey: "label",
    yKey: "value",
    yKeys: ["value", "rolling"],
  };
}

function cumulativeTimeValue(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  const measure = context.primaryMeasure;
  if (!date || !measure) return null;
  let running = 0;
  const data = timeSeries(context.rows, date, measure.name, "sum").map((entry) => {
    running += Number(entry.value);
    return { label: entry.label, value: running };
  });
  return {
    id: "cumulative-time",
    title: `Cumulative ${measure.name}`,
    subtitle: `Running total by ${date.name}`,
    kind: "area",
    score: 81,
    formula: "cumulative_t = sum(value_1..value_t)",
    columns: [date.name, measure.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function monthPattern(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  const measure = context.primaryMeasure;
  if (!date) return null;
  const data = aggregateByDatePart(context.rows, date.name, measure?.name, "month");
  return {
    id: "month-pattern",
    title: "Month Pattern",
    subtitle: measure ? `Average ${measure.name} by month` : "Row count by month",
    kind: "bar",
    score: 74,
    formula: measure ? "avg(month) = sum(x in month) / count(x in month)" : "count(month) = rows in month",
    columns: measure ? [date.name, measure.name] : [date.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function dayOfWeekPattern(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  const measure = context.primaryMeasure;
  if (!date) return null;
  const data = aggregateByDatePart(context.rows, date.name, measure?.name, "weekday");
  return {
    id: "weekday-pattern",
    title: "Weekday Pattern",
    subtitle: measure ? `Average ${measure.name} by weekday` : "Row count by weekday",
    kind: "bar",
    score: 73,
    formula: measure ? "avg(day) = sum(x in day) / count(x in day)" : "count(day) = rows in day",
    columns: measure ? [date.name, measure.name] : [date.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function dateCoverage(context: PlannerContext): ChartPlan | null {
  const date = context.primaryTime;
  if (!date) return null;
  const data = timeSeries(context.rows, date, undefined, "count").map((entry) => ({
    label: entry.label,
    value: Number(entry.value) > 0 ? 1 : 0,
  }));
  return {
    id: "date-coverage",
    title: `${date.name} Coverage`,
    subtitle: "A bucket is covered when it has at least one row",
    kind: "area",
    score: 69,
    formula: "covered(bucket) = 1 if count(bucket) > 0 else 0",
    columns: [date.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function measureHistogram(context: PlannerContext): ChartPlan | null {
  const measure = context.primaryMeasure;
  if (!measure) return null;
  return {
    id: "histogram",
    title: `${measure.name} Histogram`,
    subtitle: "Distribution across computed bins",
    kind: "bar",
    score: 92,
    formula: "bins = ceil(log2(n) + 1); count(bin) = values inside [lower, upper)",
    columns: [measure.name],
    data: histogram(context.rows, measure.name),
    xKey: "label",
    yKey: "value",
  };
}

function measureCdf(context: PlannerContext): ChartPlan | null {
  const measure = context.primaryMeasure;
  if (!measure) return null;
  const values = numericValues(context.rows, measure.name).sort((a, b) => a - b);
  const data = values.map((value, index) => ({
    label: formatNumber(value),
    value: roundPct((index + 1) / values.length),
  }));
  return {
    id: "cdf",
    title: `${measure.name} Cumulative Distribution`,
    subtitle: "Percent of rows at or below each value",
    kind: "line",
    score: 78,
    formula: "CDF(x) = count(values <= x) / n",
    columns: [measure.name],
    data: thinData(data, 50),
    xKey: "label",
    yKey: "value",
  };
}

function measureBoxPlot(context: PlannerContext): ChartPlan | null {
  const measure = context.primaryMeasure;
  const stats = measure?.numericStats;
  if (!measure || !stats) return null;
  return {
    id: "box-plot",
    title: `${measure.name} Box Plot`,
    subtitle: "Five-number summary with IQR",
    kind: "box",
    score: 82,
    formula: "box = [min, Q1, median, Q3, max]; IQR = Q3 - Q1",
    columns: [measure.name],
    data: [
      {
        label: measure.name,
        min: stats.min,
        q1: stats.q1,
        median: stats.median,
        q3: stats.q3,
        max: stats.max,
      },
    ],
  };
}

function measureScatter(context: PlannerContext): ChartPlan | null {
  const x = context.primaryMeasure;
  const y = context.secondaryMeasure;
  if (!x || !y) return null;
  return {
    id: "scatter",
    title: `${x.name} vs ${y.name}`,
    subtitle: "Relationship between two numeric columns",
    kind: "scatter",
    score: 88,
    formula: "point_i = (x_i, y_i) for rows where both values exist",
    columns: [x.name, y.name],
    data: scatterData(context.rows, x.name, y.name),
    xKey: x.name,
    yKey: y.name,
  };
}

function measureBubble(context: PlannerContext): ChartPlan | null {
  const x = context.primaryMeasure;
  const y = context.secondaryMeasure;
  const size = context.tertiaryMeasure;
  if (!x || !y || !size) return null;
  return {
    id: "bubble",
    title: `${x.name}, ${y.name}, ${size.name}`,
    subtitle: "Bubble size uses the third numeric measure",
    kind: "bubble",
    score: 76,
    formula: "bubble_i = (x_i, y_i, z_i); radius proportional to sqrt(z_i)",
    columns: [x.name, y.name, size.name],
    data: bubbleData(context.rows, x.name, y.name, size.name),
    xKey: x.name,
    yKey: y.name,
    valueKey: size.name,
  };
}

function correlationMatrix(context: PlannerContext): ChartPlan | null {
  if (context.measures.length < 2) return null;
  const columns = context.measures.slice(0, 7).map((column) => column.name);
  return {
    id: "correlation-matrix",
    title: "Correlation Matrix",
    subtitle: "Pearson r between numeric fields",
    kind: "correlationMatrix",
    score: 84,
    formula: "r = sum((x_i-mean_x)(y_i-mean_y)) / sqrt(sum((x_i-mean_x)^2) * sum((y_i-mean_y)^2))",
    columns,
    data: correlationData(context.rows, columns),
  };
}

function categoryMeasureSpread(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  const measure = context.primaryMeasure;
  if (!dimension || !measure) return null;
  const grouped = groupedNumericStats(context.rows, dimension.name, measure.name, 8);
  return {
    id: "category-measure-spread",
    title: `${measure.name} Spread`,
    subtitle: `Median and IQR by ${dimension.name}`,
    kind: "box",
    score: 79,
    formula: "per_category_box = [Q1, median, Q3] from values in each category",
    columns: [dimension.name, measure.name],
    data: grouped,
  };
}

function categoryRadar(context: PlannerContext): ChartPlan | null {
  const dimension = context.primaryDimension;
  const measure = context.primaryMeasure;
  if (!dimension || !measure) return null;
  return {
    id: "category-radar",
    title: `${dimension.name} Radar`,
    subtitle: `Top categories by total ${measure.name}`,
    kind: "radar",
    score: 72,
    formula: "radar_axis(category) = sum(value by category), normalized by chart scale",
    columns: [dimension.name, measure.name],
    data: aggregateByCategory(context.rows, dimension.name, measure.name, "sum", 8),
    xKey: "label",
    yKey: "value",
  };
}

function textLengthHistogram(context: PlannerContext): ChartPlan | null {
  const text = context.primaryText ?? context.dimensions.find((column) => column.averageTextLength > 0);
  if (!text) return null;
  const data = histogram(
    context.rows.map((row) => ({ __index: Number(row.__index), textLength: String(row[text.name] ?? "").length })),
    "textLength",
  );
  return {
    id: "text-length",
    title: `${text.name} Length`,
    subtitle: "Character length distribution",
    kind: "bar",
    score: 70,
    formula: "length(value) = number of characters in text cell",
    columns: [text.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function wordFrequency(context: PlannerContext): ChartPlan | null {
  const text = context.primaryText ?? context.dimensions.find((column) => column.averageTextLength > 8);
  if (!text) return null;
  const data = wordCounts(context.rows, text.name, 12);
  if (!data.length) return null;
  return {
    id: "word-frequency",
    title: `${text.name} Words`,
    subtitle: "Most common words after stop-word filtering",
    kind: "horizontalBar",
    score: 68,
    formula: "word_count(term) = count(tokenized lowercase term occurrences)",
    columns: [text.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function booleanBreakdown(context: PlannerContext): ChartPlan | null {
  const bool = context.primaryBoolean;
  if (!bool?.booleanStats) return null;
  return {
    id: "boolean-breakdown",
    title: `${bool.name} Breakdown`,
    subtitle: "True versus false counts",
    kind: "pie",
    score: 74,
    formula: "boolean_share(value) = count(value) / count(non_null_boolean_values)",
    columns: [bool.name],
    data: [
      { label: "True", value: bool.booleanStats.trueCount },
      { label: "False", value: bool.booleanStats.falseCount },
    ],
    nameKey: "label",
    valueKey: "value",
  };
}

function rowIndexTrend(context: PlannerContext): ChartPlan | null {
  const measure = context.primaryMeasure;
  if (!measure) return null;
  const data = thinData(
    context.rows
      .map((row) => ({ label: String(row.__index), value: asNumber(row[measure.name]) }))
      .filter((entry) => entry.value !== null) as ChartDatum[],
    80,
  );
  return {
    id: "row-index-trend",
    title: `${measure.name} by Row Order`,
    subtitle: "Useful when no date field exists or row order is meaningful",
    kind: "line",
    score: context.primaryTime ? 52 : 83,
    formula: "point_i = (row_index_i, value_i)",
    columns: [measure.name],
    data,
    xKey: "label",
    yKey: "value",
  };
}

function metricScore(column: ColumnProfile): number {
  const stats = column.numericStats;
  if (!stats) return 0;
  return column.confidence * 100 + Math.log10(Math.abs(stats.range) + 1) * 10 + stats.count / 1000;
}

function dimensionScore(column: ColumnProfile): number {
  const distinctFit = column.distinctCount > 1 && column.distinctCount <= 24 ? 30 : 0;
  return column.confidence * 100 + distinctFit + column.nonMissingCount / 1000 - column.uniqueRatio * 20;
}

function aggregateByCategory(
  rows: TypedRow[],
  dimension: string,
  measure: string | undefined,
  mode: "count" | "sum" | "avg",
  limit: number,
): ChartDatum[] {
  const groups = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const label = asLabel(row[dimension]);
    if (!label) continue;
    const value = measure ? asNumber(row[measure]) : 1;
    if (measure && value === null) continue;
    const group = groups.get(label) ?? { sum: 0, count: 0 };
    group.sum += measure ? value ?? 0 : 1;
    group.count += 1;
    groups.set(label, group);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      value: mode === "avg" ? group.sum / Math.max(1, group.count) : mode === "sum" ? group.sum : group.count,
      count: group.count,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, limit);
}

function stackByTwoCategories(
  rows: TypedRow[],
  first: string,
  second: string,
  asPercent: boolean,
): { data: ChartDatum[]; keys: string[] } {
  const firstTop = aggregateByCategory(rows, first, undefined, "count", 8).map((entry) => String(entry.label));
  const secondTop = aggregateByCategory(rows, second, undefined, "count", 5).map((entry) => String(entry.label));
  const data = firstTop.map((firstLabel) => {
    const entry: ChartDatum = { label: firstLabel };
    const subset = rows.filter((row) => asLabel(row[first]) === firstLabel);
    const total = subset.length || 1;
    for (const secondLabel of secondTop) {
      const count = subset.filter((row) => asLabel(row[second]) === secondLabel).length;
      entry[secondLabel] = asPercent ? roundPct(count / total) : count;
    }
    return entry;
  });
  return { data, keys: secondTop };
}

function heatmapByTwoCategories(rows: TypedRow[], first: string, second: string): ChartDatum[] {
  const firstTop = aggregateByCategory(rows, first, undefined, "count", 7).map((entry) => String(entry.label));
  const secondTop = aggregateByCategory(rows, second, undefined, "count", 7).map((entry) => String(entry.label));
  const data: ChartDatum[] = [];
  for (const y of firstTop) {
    for (const x of secondTop) {
      data.push({
        x,
        y,
        value: rows.filter((row) => asLabel(row[first]) === y && asLabel(row[second]) === x).length,
      });
    }
  }
  return data;
}

function timeSeries(
  rows: TypedRow[],
  dateColumn: ColumnProfile,
  measure: string | undefined,
  mode: "count" | "sum" | "avg",
): ChartDatum[] {
  const groups = new Map<string, { sort: number; sum: number; count: number }>();
  for (const row of rows) {
    const date = row[dateColumn.name];
    if (!(date instanceof Date)) continue;
    const bucket = bucketDate(date, dateColumn.dateStats?.granularity ?? "month");
    const value = measure ? asNumber(row[measure]) : 1;
    if (measure && value === null) continue;
    const group = groups.get(bucket.label) ?? { sort: bucket.sort, sum: 0, count: 0 };
    group.sum += measure ? value ?? 0 : 1;
    group.count += 1;
    groups.set(bucket.label, group);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      value: mode === "avg" ? group.sum / Math.max(1, group.count) : mode === "sum" ? group.sum : group.count,
      sort: group.sort,
    }))
    .sort((a, b) => Number(a.sort) - Number(b.sort));
}

function aggregateByDatePart(
  rows: TypedRow[],
  dateColumn: string,
  measure: string | undefined,
  part: "month" | "weekday",
): ChartDatum[] {
  const labels =
    part === "month"
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const groups = labels.map((label) => ({ label, sum: 0, count: 0 }));
  for (const row of rows) {
    const date = row[dateColumn];
    if (!(date instanceof Date)) continue;
    const index = part === "month" ? date.getMonth() : date.getDay();
    const value = measure ? asNumber(row[measure]) : 1;
    if (measure && value === null) continue;
    groups[index].sum += measure ? value ?? 0 : 1;
    groups[index].count += 1;
  }
  return groups.map((group) => ({
    label: group.label,
    value: measure ? group.sum / Math.max(1, group.count) : group.count,
  }));
}

function histogram(rows: Array<TypedRow | { __index: number; [key: string]: number }>, measure: string): ChartDatum[] {
  const values = rows
    .map((row) => asNumber(row[measure]))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (!values.length) return [];
  const min = values[0];
  const max = values[values.length - 1];
  if (min === max) return [{ label: formatNumber(min), value: values.length }];
  const binCount = Math.max(6, Math.min(18, Math.ceil(Math.log2(values.length) + 1)));
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + width * index,
    end: index === binCount - 1 ? max : min + width * (index + 1),
    value: 0,
  }));
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width));
    bins[index].value += 1;
  }
  return bins.map((bin) => ({
    label: `${formatNumber(bin.start)}-${formatNumber(bin.end)}`,
    value: bin.value,
  }));
}

function scatterData(rows: TypedRow[], x: string, y: string): ChartDatum[] {
  return thinData(
    rows
      .map((row) => ({ [x]: asNumber(row[x]), [y]: asNumber(row[y]) }))
      .filter((row) => row[x] !== null && row[y] !== null) as ChartDatum[],
    220,
  );
}

function bubbleData(rows: TypedRow[], x: string, y: string, size: string): ChartDatum[] {
  const raw = rows
    .map((row) => ({ [x]: asNumber(row[x]), [y]: asNumber(row[y]), [size]: asNumber(row[size]) }))
    .filter((row) => row[x] !== null && row[y] !== null && row[size] !== null) as ChartDatum[];
  const values = raw.map((row) => Number(row[size])).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return thinData(
    raw.map((row) => ({
      ...row,
      radius: 50 + (max === min ? 80 : ((Number(row[size]) - min) / (max - min)) * 260),
    })),
    180,
  );
}

function correlationData(rows: TypedRow[], columns: string[]): ChartDatum[] {
  const data: ChartDatum[] = [];
  for (const y of columns) {
    for (const x of columns) {
      data.push({ x, y, value: pearson(rows, x, y) });
    }
  }
  return data;
}

function groupedNumericStats(rows: TypedRow[], dimension: string, measure: string, limit: number): ChartDatum[] {
  const labels = aggregateByCategory(rows, dimension, measure, "sum", limit).map((entry) => String(entry.label));
  return labels
    .map((label) => {
      const values = rows
        .filter((row) => asLabel(row[dimension]) === label)
        .map((row) => asNumber(row[measure]))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);
      return {
        label,
        min: values[0] ?? 0,
        q1: quantile(values, 0.25),
        median: quantile(values, 0.5),
        q3: quantile(values, 0.75),
        max: values[values.length - 1] ?? 0,
      };
    })
    .filter((entry) => Number.isFinite(entry.median));
}

function numericValues(rows: TypedRow[], column: string): number[] {
  return rows.map((row) => asNumber(row[column])).filter((value): value is number => value !== null);
}

function groupCounts(values: string[]): ChartDatum[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}

function wordCounts(rows: TypedRow[], column: string, limit: number): ChartDatum[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "you",
    "your",
    "are",
    "was",
    "were",
    "will",
    "not",
    "but",
    "into",
    "over",
    "under",
    "have",
    "has",
  ]);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const text = asLabel(row[column]);
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function pearson(rows: TypedRow[], x: string, y: string): number {
  const pairs = rows
    .map((row) => [asNumber(row[x]), asNumber(row[y])] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null);
  if (pairs.length < 2) return 0;
  const meanX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) * (pair[1] - meanY), 0);
  const denomX = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - meanX) ** 2, 0));
  const denomY = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[1] - meanY) ** 2, 0));
  return denomX && denomY ? numerator / (denomX * denomY) : 0;
}

function bucketDate(date: Date, granularity: NonNullable<ColumnProfile["dateStats"]>["granularity"]): { label: string; sort: number } {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (granularity === "year") {
    return { label: String(year), sort: new Date(year, 0, 1).getTime() };
  }
  if (granularity === "quarter") {
    const quarter = Math.floor(month / 3) + 1;
    return { label: `${year} Q${quarter}`, sort: new Date(year, (quarter - 1) * 3, 1).getTime() };
  }
  if (granularity === "week") {
    const first = new Date(year, 0, 1);
    const week = Math.ceil(((date.getTime() - first.getTime()) / 86_400_000 + first.getDay() + 1) / 7);
    return { label: `${year} W${String(week).padStart(2, "0")}`, sort: new Date(year, 0, week * 7).getTime() };
  }
  if (granularity === "day") {
    return { label: date.toISOString().slice(0, 10), sort: new Date(year, month, date.getDate()).getTime() };
  }
  return { label: `${year}-${String(month + 1).padStart(2, "0")}`, sort: new Date(year, month, 1).getTime() };
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

function thinData<T>(data: T[], max: number): T[] {
  if (data.length <= max) return data;
  const step = data.length / max;
  return Array.from({ length: max }, (_, index) => data[Math.floor(index * step)]);
}

function roundPct(value: number): number {
  return Math.round(value * 1000) / 10;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}
