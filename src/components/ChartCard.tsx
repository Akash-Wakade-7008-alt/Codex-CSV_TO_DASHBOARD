import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartPlan } from "../lib/chartPlanner";
import { formatNumber } from "../lib/csvProfile";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4d7c0f",
  "#ea580c",
  "#475569",
];

interface ChartCardProps {
  plan: ChartPlan;
}

export function ChartCard({ plan }: ChartCardProps) {
  return (
    <article className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3>{plan.title}</h3>
          <p>{plan.subtitle}</p>
        </div>
        <span className="chart-card__score">{Math.round(plan.score)}</span>
      </div>

      <div className="chart-card__body">{renderChart(plan)}</div>

      <div className="chart-card__meta">
        <span className="formula">{plan.formula}</span>
        <div className="column-pills">
          {plan.columns.slice(0, 3).map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function renderChart(plan: ChartPlan) {
  switch (plan.kind) {
    case "kpi":
      return <KpiChart plan={plan} />;
    case "horizontalBar":
      return <HorizontalBar plan={plan} />;
    case "bar":
      return <SimpleBar plan={plan} />;
    case "line":
      return <SimpleLine plan={plan} />;
    case "area":
      return <SimpleArea plan={plan} />;
    case "composed":
      return <Composed plan={plan} />;
    case "pie":
    case "donut":
      return <PieDonut plan={plan} donut={plan.kind === "donut"} />;
    case "scatter":
      return <ScatterPlot plan={plan} />;
    case "bubble":
      return <BubblePlot plan={plan} />;
    case "radar":
      return <RadarView plan={plan} />;
    case "radial":
      return <RadialView plan={plan} />;
    case "treemap":
      return <TreemapView plan={plan} />;
    case "funnel":
      return <FunnelView plan={plan} />;
    case "stackedBar":
    case "stackedPercentBar":
      return <StackedBar plan={plan} />;
    case "heatmap":
      return <Heatmap plan={plan} />;
    case "correlationMatrix":
      return <CorrelationMatrix plan={plan} />;
    case "box":
      return <BoxPlot plan={plan} />;
    case "lollipop":
      return <Lollipop plan={plan} />;
    default:
      return <SimpleBar plan={plan} />;
  }
}

function KpiChart({ plan }: ChartCardProps) {
  return (
    <div className="kpi-grid">
      {plan.data.map((item) => (
        <div className="kpi-tile" key={String(item.label)}>
          <span>{item.label}</span>
          <strong>{formatMetric(Number(item.value))}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </div>
  );
}

function SimpleBar({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={plan.data} margin={{ top: 8, right: 10, bottom: 28, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} angle={-28} textAnchor="end" height={54} />
        <YAxis tickFormatter={compactNumber} width={42} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} labelFormatter={String} />
        <Bar dataKey={plan.yKey ?? "value"} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HorizontalBar({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={plan.data} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={compactNumber} />
        <YAxis type="category" dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} width={94} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Bar dataKey={plan.yKey ?? "value"} fill={COLORS[1]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SimpleLine({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={plan.data} margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} />
        <YAxis tickFormatter={compactNumber} width={42} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Line type="monotone" dataKey={plan.yKey ?? "value"} stroke={COLORS[0]} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SimpleArea({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={plan.data} margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
        <defs>
          <linearGradient id={`${plan.id}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.35} />
            <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} />
        <YAxis tickFormatter={compactNumber} width={42} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Area
          type="monotone"
          dataKey={plan.yKey ?? "value"}
          stroke={COLORS[0]}
          fill={`url(#${plan.id}-area)`}
          strokeWidth={2.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Composed({ plan }: ChartCardProps) {
  const keys = plan.yKeys ?? ["value"];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={plan.data} margin={{ top: 8, right: 14, bottom: 28, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} angle={-22} textAnchor="end" height={48} />
        <YAxis tickFormatter={compactNumber} width={42} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Legend />
        <Bar dataKey={keys[0]} fill={COLORS[2]} radius={[4, 4, 0, 0]} />
        {keys[1] && <Line type="monotone" dataKey={keys[1]} stroke={COLORS[3]} strokeWidth={2.5} dot={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PieDonut({ plan, donut }: ChartCardProps & { donut: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Pie
          data={plan.data}
          dataKey={plan.valueKey ?? "value"}
          nameKey={plan.nameKey ?? "label"}
          innerRadius={donut ? 58 : 0}
          outerRadius={92}
          paddingAngle={donut ? 2 : 0}
        >
          {plan.data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ScatterPlot({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 14, bottom: 24, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={plan.xKey} name={plan.xKey} type="number" tickFormatter={compactNumber} />
        <YAxis dataKey={plan.yKey} name={plan.yKey} type="number" tickFormatter={compactNumber} width={42} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value) => formatMetric(Number(value))} />
        <Scatter data={plan.data} fill={COLORS[0]} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function BubblePlot({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 14, bottom: 24, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={plan.xKey} name={plan.xKey} type="number" tickFormatter={compactNumber} />
        <YAxis dataKey={plan.yKey} name={plan.yKey} type="number" tickFormatter={compactNumber} width={42} />
        <ZAxis dataKey="radius" range={[55, 420]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value) => formatMetric(Number(value))} />
        <Scatter data={plan.data} fill={COLORS[5]} fillOpacity={0.72} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function RadarView({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={plan.data} outerRadius={95}>
        <PolarGrid />
        <PolarAngleAxis dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} />
        <PolarRadiusAxis tickFormatter={compactNumber} />
        <Radar dataKey={plan.yKey ?? "value"} stroke={COLORS[4]} fill={COLORS[4]} fillOpacity={0.35} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function RadialView({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart innerRadius="20%" outerRadius="92%" data={plan.data} startAngle={90} endAngle={-270}>
        <RadialBar dataKey={plan.valueKey ?? "value"} background>
          {plan.data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </RadialBar>
        <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

function TreemapView({ plan }: ChartCardProps) {
  const data = plan.data.map((entry) => ({
    name: String(entry[plan.nameKey ?? "label"]),
    size: Number(entry[plan.valueKey ?? "value"]),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap data={data} dataKey="size" nameKey="name" stroke="#ffffff" fill={COLORS[0]} content={<TreemapCell />} />
    </ResponsiveContainer>
  );
}

function TreemapCell(props: Record<string, unknown>) {
  const { x, y, width, height, index, name } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
    name: string;
  };
  if (width < 36 || height < 24) {
    return <rect x={x} y={y} width={width} height={height} fill={COLORS[index % COLORS.length]} stroke="#fff" />;
  }
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={COLORS[index % COLORS.length]} stroke="#fff" />
      <text x={x + 8} y={y + 18} fill="#fff" fontSize={11}>
        {shortLabel(name)}
      </text>
    </g>
  );
}

function FunnelView({ plan }: ChartCardProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Funnel dataKey={plan.valueKey ?? "value"} nameKey={plan.nameKey ?? "label"} data={plan.data} fill={COLORS[2]}>
          <LabelList position="right" fill="#334155" stroke="none" dataKey={plan.nameKey ?? "label"} formatter={shortLabel} />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function StackedBar({ plan }: ChartCardProps) {
  const keys = plan.yKeys ?? [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={plan.data} margin={{ top: 8, right: 12, bottom: 28, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={plan.xKey ?? "label"} tickFormatter={shortLabel} angle={-22} textAnchor="end" height={48} />
        <YAxis tickFormatter={compactNumber} width={42} />
        <Tooltip formatter={(value) => formatMetric(Number(value))} />
        <Legend />
        {keys.map((key, index) => (
          <Bar key={key} dataKey={key} stackId="a" fill={COLORS[index % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Heatmap({ plan }: ChartCardProps) {
  const xs = unique(plan.data.map((entry) => String(entry.x)));
  const ys = unique(plan.data.map((entry) => String(entry.y)));
  const max = Math.max(1, ...plan.data.map((entry) => Number(entry.value)));
  return (
    <div className="heatmap" style={{ gridTemplateColumns: `92px repeat(${xs.length}, minmax(34px, 1fr))` }}>
      <span />
      {xs.map((x) => (
        <b key={x}>{shortLabel(x)}</b>
      ))}
      {ys.map((y) => (
        <HeatmapRow key={y} y={y} xs={xs} data={plan.data} max={max} />
      ))}
    </div>
  );
}

function HeatmapRow({ y, xs, data, max }: { y: string; xs: string[]; data: ChartPlan["data"]; max: number }) {
  return (
    <>
      <strong>{shortLabel(y)}</strong>
      {xs.map((x) => {
        const value = Number(data.find((entry) => entry.x === x && entry.y === y)?.value ?? 0);
        const opacity = 0.12 + (value / max) * 0.78;
        return (
          <span key={x} className="heat-cell" style={{ backgroundColor: `rgba(37, 99, 235, ${opacity})` }}>
            {compactNumber(value)}
          </span>
        );
      })}
    </>
  );
}

function CorrelationMatrix({ plan }: ChartCardProps) {
  const xs = unique(plan.data.map((entry) => String(entry.x)));
  const ys = unique(plan.data.map((entry) => String(entry.y)));
  return (
    <div className="heatmap corr" style={{ gridTemplateColumns: `92px repeat(${xs.length}, minmax(34px, 1fr))` }}>
      <span />
      {xs.map((x) => (
        <b key={x}>{shortLabel(x)}</b>
      ))}
      {ys.map((y) => (
        <CorrelationRow key={y} y={y} xs={xs} data={plan.data} />
      ))}
    </div>
  );
}

function CorrelationRow({ y, xs, data }: { y: string; xs: string[]; data: ChartPlan["data"] }) {
  return (
    <>
      <strong>{shortLabel(y)}</strong>
      {xs.map((x) => {
        const value = Number(data.find((entry) => entry.x === x && entry.y === y)?.value ?? 0);
        const hue = value >= 0 ? "37, 99, 235" : "220, 38, 38";
        const opacity = 0.12 + Math.abs(value) * 0.78;
        return (
          <span key={x} className="heat-cell" style={{ backgroundColor: `rgba(${hue}, ${opacity})` }}>
            {value.toFixed(2)}
          </span>
        );
      })}
    </>
  );
}

function BoxPlot({ plan }: ChartCardProps) {
  const rows = plan.data;
  const values = rows.flatMap((row) => [Number(row.min), Number(row.q1), Number(row.median), Number(row.q3), Number(row.max)]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className="boxplot">
      {rows.slice(0, 8).map((row) => (
        <div className="box-row" key={String(row.label)}>
          <span>{shortLabel(String(row.label))}</span>
          <div className="box-track">
            <i style={{ left: pct(Number(row.min), min, max), width: pct(Number(row.max) - Number(row.min), 0, max - min) }} />
            <b
              style={{
                left: pct(Number(row.q1), min, max),
                width: pct(Number(row.q3) - Number(row.q1), 0, max - min),
              }}
            />
            <em style={{ left: pct(Number(row.median), min, max) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Lollipop({ plan }: ChartCardProps) {
  const max = Math.max(1, ...plan.data.map((entry) => Number(entry[plan.yKey ?? "value"])));
  return (
    <div className="lollipop">
      {plan.data.map((entry) => {
        const value = Number(entry[plan.yKey ?? "value"]);
        return (
          <div className="lollipop-row" key={String(entry[plan.xKey ?? "label"])}>
            <span>{shortLabel(String(entry[plan.xKey ?? "label"]))}</span>
            <div>
              <i style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
              <b style={{ left: `${Math.max(2, (value / max) * 100)}%` }} />
            </div>
            <strong>{compactNumber(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function shortLabel(value: unknown): string {
  const text = String(value ?? "");
  return text.length > 14 ? `${text.slice(0, 13)}...` : text;
}

function compactNumber(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 }).format(value);
}

function pct(value: number, min: number, max: number): string {
  if (!Number.isFinite(value) || max === min) return "50%";
  return `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%`;
}
