import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SiteNav } from "@/components/site-nav";
import { LiveDuration } from "@/components/live-duration";
import { ENDPOINT, formatDuration, formatTime } from "@/lib/status-format";

export const Route = createFileRoute("/machine/$name")({
  head: ({ params }) => {
    const title = `${params.name} — Machine Status Detail`;
    const description = `Live status, elapsed time, total and average time per status for ${params.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: MachineDetail,
});

type StatusLog = {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

type StatusStat = {
  label: string;
  totalSeconds: number;
  sessions: number;
  completedSessions: number;
  averageSeconds: number;
};

type StatusPayload = {
  machine: string;
  statuses: string[];
  current: StatusLog | null;
  logs: StatusLog[];
  stats: StatusStat[];
  serverTime: string;
};

function MachineDetail() {
  const { name } = Route.useParams();

  const { data, isPending, isError } = useQuery({
    queryKey: ["machine-status", name],
    queryFn: async (): Promise<StatusPayload> => {
      const res = await fetch(`${ENDPOINT}?machine=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  const current = data?.current ?? null;
  const logs = data?.logs ?? [];
  const isPreviousStatus = Boolean(current && current.ended_at !== null);
  const previousStatus =
    current && current.ended_at === null ? logs[0] ?? null : logs[1] ?? null;
  const stats = data?.stats ?? [];
  const lastStat = current ? stats.find((stat) => stat.label === current.status) ?? null : null;

  return (
    <main className="min-h-screen bg-background px-5 py-10 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <Link to="/" className="font-mono text-xs text-muted-foreground hover:text-foreground">
              ← All machines
            </Link>
            <h1 className="mt-2 font-mono text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {name}
            </h1>
          </div>
          <SiteNav />
        </header>

        <section className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Current status
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`inline-block size-3 rounded-full ${
                  current && current.ended_at === null ? "bg-chart-2 animate-pulse" : "bg-muted-foreground/40"
                }`}
              />
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {isPending ? "Loading…" : (current?.status ?? "No data")}
              </span>
            </div>
            {current && (
              <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-sm text-muted-foreground">
                {current.ended_at === null ? (
                  <>
                    {previousStatus && <span>Previous {previousStatus.status}</span>}
                    <span>since {formatTime(current.started_at)}</span>
                    <span><LiveDuration startedAt={current.started_at} /></span>
                  </>
                ) : (
                  <>
                    <span>{isPreviousStatus ? "previous status" : "last status"}</span>
                    {previousStatus && <span>Prev {previousStatus.status}</span>}
                    <span>Total {formatDuration(lastStat?.totalSeconds ?? current.duration_seconds ?? 0)}</span>
                    <span>Average {formatDuration(lastStat?.averageSeconds ?? 0)}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {isError && (
            <p className="mt-4 text-sm text-destructive">
              Could not reach the logger. Retrying automatically.
            </p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Time spent per status
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">{stat.label}</p>
                <dl className="mt-4 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Total
                    </dt>
                    <dd className="font-mono text-xl font-bold tabular-nums text-foreground">
                      {formatDuration(stat.totalSeconds)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Average
                    </dt>
                    <dd className="font-mono text-xl font-bold tabular-nums text-foreground">
                      {formatDuration(stat.averageSeconds)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Entries
                    </dt>
                    <dd className="font-mono text-sm text-muted-foreground">
                      {stat.sessions} ({stat.completedSessions} completed)
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            {!isPending && stats.length === 0 && (
              <p className="text-sm text-muted-foreground">No statistics for this machine yet.</p>
            )}
          </div>
          <Link
            to="/logs"
            search={{ machine: name }}
            className="mt-4 inline-block text-sm font-medium text-foreground underline underline-offset-4"
          >
            View status history for {name}
          </Link>
        </section>
      </div>
    </main>
  );
}
