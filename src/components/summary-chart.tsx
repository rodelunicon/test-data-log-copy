import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getSummary } from "@/lib/machines.functions";
import { formatDuration } from "@/lib/status-format";

type Range = "today" | "overall";

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "overall", label: "Overall" },
];

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
];

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

const shortLabel = (value: string) => (value.includes(" - ") ? value.split(" - ")[0] : value);

export function SummaryChart() {
  const fetchSummary = useServerFn(getSummary);
  const [range, setRange] = useState<Range>("overall");

  const { data, isPending } = useQuery({
    queryKey: ["machine-summary", range],
    queryFn: () => fetchSummary({ data: { range } }),
    refetchInterval: 5000,
  });

  const series = data?.byMachine.series ?? [];
  const rows = (data?.byMachine.rows ?? []).map((row) => ({
    ...row,
    minutes: Math.round((row.totalSeconds / 60) * 10) / 10,
    ...Object.fromEntries(
      series.map((s) => [s, Math.round(((row.parts[s] ?? 0) / 60) * 10) / 10]),
    ),
  }));

  const donutRows = rows.filter((row) => row.totalSeconds > 0);

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Summary</h2>
          <p className="text-sm text-muted-foreground">
            Time logged per machine{range === "today" ? " today" : " across all days"}, split by
            status.
          </p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
          aria-label="Summary range"
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {isPending && <div className="mt-5 h-64 animate-pulse rounded-lg bg-muted/40" aria-hidden />}

      {!isPending && rows.length === 0 && (
        <p className="mt-5 text-sm text-muted-foreground">
          {range === "today" ? "No logged time today yet." : "No logged time yet."}
        </p>
      )}

      {!isPending && rows.length > 0 && (
        <>
          <div className="mt-5 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    unit="m"
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, name) => [`${value} m`, shortLabel(String(name))]}
                    labelFormatter={(label) => String(label)}
                  />
                  {series.map((s, i) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={s}
                      stackId="total"
                      fill={COLORS[i % COLORS.length]}
                      radius={i === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutRows}
                    dataKey="totalSeconds"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="var(--card)"
                  >
                    {donutRows.map((row, i) => (
                      <Cell key={row.key} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(_v, _n, item) => [
                      `${formatDuration(item.payload.totalSeconds)} · ${item.payload.sessions} entries`,
                      item.payload.label,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4">
            {series.map((s, i) => (
              <span key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                  aria-hidden
                />
                {s}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
