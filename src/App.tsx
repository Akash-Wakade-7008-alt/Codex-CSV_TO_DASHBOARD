import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Sigma,
  Table2,
  Upload,
} from "lucide-react";
import { ChartCard } from "./components/ChartCard";
import { CHART_TEMPLATE_COUNT, buildChartPlans, getFormulaAudit } from "./lib/chartPlanner";
import { DatasetProfile, formatNumber, formatPercent, profileDataset } from "./lib/csvProfile";
import { demoCsv } from "./data/demoCsv";

interface ParsedState {
  profile: DatasetProfile;
  warnings: string[];
}

export default function App() {
  const [parsed, setParsed] = useState<ParsedState>(() => parseCsvText(demoCsv, "sample-commerce.csv"));
  const [query, setQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const profile = parsed.profile;
  const plans = useMemo(() => buildChartPlans(profile, CHART_TEMPLATE_COUNT), [profile]);
  const formulaAudit = useMemo(() => getFormulaAudit(profile), [profile]);
  const visiblePlans = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return plans;
    return plans.filter((plan) =>
      [plan.title, plan.subtitle, plan.kind, ...plan.columns].join(" ").toLowerCase().includes(normalized),
    );
  }, [plans, query]);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setParsed(parseCsvText(String(reader.result ?? ""), file.name));
      } catch (error) {
        setParsed((current) => ({
          ...current,
          warnings: [`Could not parse ${file.name}: ${error instanceof Error ? error.message : String(error)}`],
        }));
      }
    };
    reader.readAsText(file);
  }

  function exportProfile() {
    const payload = {
      fileName: profile.fileName,
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      quality: profile.quality,
      columns: profile.columns.map((column) => ({
        name: column.name,
        type: column.type,
        role: column.role,
        confidence: column.confidence,
        firstRowValue: column.firstRowValue,
        firstRowHint: column.firstRowHint,
        missingRatio: column.missingRatio,
        distinctCount: column.distinctCount,
        uniqueRatio: column.uniqueRatio,
        numericStats: column.numericStats,
        dateStats: column.dateStats,
        topValues: column.topValues,
      })),
      selectedCharts: plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        kind: plan.kind,
        columns: plan.columns,
        formula: plan.formula,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${profile.fileName.replace(/\.csv$/i, "")}-profile.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className={`app-shell ${isDragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <BarChart3 size={22} />
          </span>
          <div>
            <h1>CSV Dashboard Studio</h1>
            <p>{profile.fileName}</p>
          </div>
        </div>

        <div className="header-actions">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter charts" />
          </label>
          <button type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={17} />
            Upload CSV
          </button>
          <button type="button" className="ghost" onClick={() => setParsed(parseCsvText(demoCsv, "sample-commerce.csv"))}>
            <RefreshCw size={17} />
            Demo
          </button>
          <button type="button" className="ghost" onClick={exportProfile}>
            <Download size={17} />
            JSON
          </button>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <main className="dashboard">
        <section className="summary-strip">
          <Metric icon={<FileSpreadsheet size={18} />} label="Rows" value={profile.rowCount.toLocaleString()} />
          <Metric icon={<Table2 size={18} />} label="Columns" value={profile.columnCount.toLocaleString()} />
          <Metric icon={<Sigma size={18} />} label="Completeness" value={formatPercent(profile.quality.completeness)} />
          <Metric icon={<BarChart3 size={18} />} label="Auto charts" value={`${plans.length}/${CHART_TEMPLATE_COUNT}`} />
        </section>

        {parsed.warnings.length > 0 && (
          <section className="warning-panel">
            {parsed.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </section>
        )}

        <div className="workspace">
          <aside className="side-rail">
            <section className="upload-panel" onClick={() => inputRef.current?.click()}>
              <Upload size={20} />
              <strong>Drop CSV anywhere</strong>
              <span>{profile.rowCount ? "Dashboard refreshes automatically" : "Waiting for data"}</span>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Header Inference</h2>
                <span>{profile.columns.length}</span>
              </div>
              <div className="column-list">
                {profile.columns.map((column) => (
                  <div className="column-row" key={column.name}>
                    <div>
                      <strong>{column.name}</strong>
                      <small>{column.firstRowValue || "empty first value"}</small>
                    </div>
                    <span className={`type-chip type-${column.type}`}>{column.type}</span>
                    <b>{Math.round(column.confidence * 100)}%</b>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Math Audit</h2>
                <span>{formulaAudit.length}</span>
              </div>
              <div className="formula-list">
                {formulaAudit.map((item) => (
                  <div key={item.label}>
                    <strong>{item.label}</strong>
                    <code>{item.formula}</code>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="chart-zone">
            <div className="chart-zone__head">
              <div>
                <h2>Auto-Populated Dashboard</h2>
                <p>
                  {visiblePlans.length} charts ranked from {profile.headers.length} headers and{" "}
                  {formatNumber(profile.quality.totalCells)} cells
                </p>
              </div>
              <div className="quality-pills">
                <span>{profile.quality.parseErrors} parse errors</span>
                <span>{profile.quality.duplicateRows} duplicates</span>
                <span>{formatPercent(profile.quality.missingCells / Math.max(1, profile.quality.totalCells))} missing</span>
              </div>
            </div>

            <div className="chart-grid">
              {visiblePlans.map((plan) => (
                <ChartCard key={plan.id} plan={plan} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function parseCsvText(text: string, fileName: string): ParsedState {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });

  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  if (!headers.length) {
    throw new Error("No CSV headers were found in the first row.");
  }

  const profile = profileDataset(parsed.data, headers, fileName, parsed.errors.length);
  const warnings = parsed.errors.slice(0, 4).map((error) => `Row ${error.row ?? "?"}: ${error.message}`);
  if (!profile.rowCount) {
    warnings.push("The CSV has headers, but no non-empty data rows.");
  }
  return { profile, warnings };
}
