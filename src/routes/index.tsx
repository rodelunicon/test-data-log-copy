import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { SummaryChart } from "@/components/summary-chart";
import { LiveDuration } from "@/components/live-duration";

import { getOverview } from "@/lib/machines.functions";
import { SiteNav } from "@/components/site-nav";
import { DEFAULT_MACHINE, formatTime } from "@/lib/status-format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Machine Status Dashboard — Live Status of Every Machine" },
      {
        name: "description",
        content:
          "Live current status and elapsed time for every machine on the line. Click a machine for average times and per-status detail.",
      },
      { property: "og:title", content: "Machine Status Dashboard — Live Status of Every Machine" },
      {
        property: "og:description",
        content:
          "Live current status and elapsed time for every machine on the line. Click a machine for average times and per-status detail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const fetchOverview = useServerFn(getOverview);
  const [showChart, setShowChart] = useState(true);

  const { data, isPending, isError } = useQuery({
    queryKey: ["machine-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  const machines = data?.machines ?? [];


  return (
    <main className="min-h-screen bg-background px-5 py-10 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Data Logger
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Machine Status Dashboard
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Live status of all machines. Click a machine for detailed timing.
            </p>
          </div>
          <SiteNav />
        </header>

        {isError && (
          <p className="mt-6 text-sm text-destructive">
            Could not reach the logger. Retrying automatically.
          </p>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl border border-border bg-card"
                aria-hidden
              />
            ))}

          {machines.map((machine) => {
            return (
              <Link
                key={machine.id}
                to="/machine/$name"
                params={{ name: machine.name }}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm font-semibold tracking-wide text-foreground">
                    {machine.name}
                  </p>
                  <span
                    className={`inline-block size-3 rounded-full ${
                      machine.current?.active ? "bg-chart-2 animate-pulse" : "bg-muted-foreground/40"
                    }`}
                  />
                </div>

                <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                  {machine.current?.status ?? "No data yet"}
                </p>

                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  {machine.current
                    ? (
                        <>
                          since {formatTime(machine.current.started_at)}
                          {machine.current.active && (
                            <>
                              {" "}· <LiveDuration startedAt={machine.current.started_at} />
                            </>
                          )}
                        </>
                      )
                    : machine.name === DEFAULT_MACHINE
                      ? "waiting for ESP32"
                      : "waiting for first request"}
                </p>
              </Link>
            );
          })}

          {!isPending && machines.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No machines yet. Add one from Manage machines.
            </p>
          )}
        </section>

        {showChart ? (
          <SummaryChart />
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">Summary chart hidden.</p>
        )}

        <button
          onClick={() => setShowChart((v) => !v)}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {showChart ? "Hide summary chart" : "Show summary chart"}
        </button>
      </div>
    </main>
  );
}
