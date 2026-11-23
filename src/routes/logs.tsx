import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckSquare, Download, KeyRound, NotebookPen, Pencil } from "lucide-react";

const GAP_THRESHOLD_SECONDS = 60;

import { getBatchLogs, getLogs, getMachines, updateLogNote } from "@/lib/machines.functions";
import { addLogEntry, editLogEntry } from "@/lib/editor.functions";
import { SiteNav } from "@/components/site-nav";
import {
  EditorBar,
  type GapReference,
  LogEntryDialog,
  SignInDialog,
  useEditor,
  type EditableLog,
} from "@/components/log-editor";
import { formatDuration, formatTime } from "@/lib/status-format";
import { shiftOf } from "@/lib/shift";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type LogsSearch = { machine?: string | undefined };

export const Route = createFileRoute("/logs")({
  validateSearch: (search: Record<string, unknown>): LogsSearch => ({
    machine: typeof search["machine"] === "string" ? (search["machine"] as string) : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Status Logs — Machine Status History" },
      {
        name: "description",
        content:
          "Full timestamped status history for every machine, filterable by machine and by status.",
      },
      { property: "og:title", content: "Status Logs — Machine Status History" },
      {
        property: "og:description",
        content:
          "Full timestamped status history for every machine, filterable by machine and by status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LogsPage,
});

const PAGE_SIZE = 10;

function LogsPage() {
  const search = Route.useSearch();

  const fetchMachines = useServerFn(getMachines);
  const fetchLogs = useServerFn(getLogs);
  const fetchBatchLogs = useServerFn(getBatchLogs);

  const [machine, setMachine] = useState(search.machine ?? "all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const { data: machines } = useQuery({
    queryKey: ["machines"],
    queryFn: () => fetchMachines(),
  });

  const { data, isPending } = useQuery({
    queryKey: ["logs", machine],
    queryFn: () => fetchLogs({ data: machine === "all" ? {} : { machine } }),
    refetchInterval: 2000,
  });

  const logs = data?.logs;
  const editor = useEditor();
  const qc = useQueryClient();
  const addLog = useServerFn(addLogEntry);
  const editLog = useServerFn(editLogEntry);
  const saveNote = useServerFn(updateLogNote);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [gapDialogOpen, setGapDialogOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [editing, setEditing] = useState<EditableLog | null>(null);
  const [noteLog, setNoteLog] = useState<(NonNullable<typeof logs>[number]) | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchFrom, setBatchFrom] = useState("");
  const [batchTo, setBatchTo] = useState("");
  const [batchMachine, setBatchMachine] = useState("all");
  const [batchStatus, setBatchStatus] = useState("all");
  const [batchRows, setBatchRows] = useState<NonNullable<typeof logs>>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchApplied, setBatchApplied] = useState(false);
  const [jumpTo, setJumpTo] = useState<{ machine: string; started: number } | null>(null);

  const statusOptions = useMemo(() => {
    const labels = new Set<string>();
    if (machine === "all") {
      for (const m of machines ?? []) for (const s of m.statuses) labels.add(s.label);
    } else {
      const found = machines?.find((m) => m.name === machine);
      for (const s of found?.statuses ?? []) labels.add(s.label);
    }
    for (const log of logs ?? []) labels.add(log.status);
    return [...labels];
  }, [machines, machine, logs]);

  const batchStatusOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const m of machines ?? []) for (const s of m.statuses) labels.add(s.label);
    for (const log of logs ?? []) labels.add(log.status);
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [machines, logs]);

  useEffect(() => {
    if (status !== "all" && !statusOptions.includes(status)) setStatus("all");
  }, [statusOptions, status]);

  useEffect(() => {
    setPage(1);
  }, [machine, status]);

  const filtered = (logs ?? []).filter((log) => status === "all" || log.status === status);

  const gaps = useMemo(() => {
    const byMachine = new Map<string, NonNullable<typeof logs>>();
    for (const log of logs ?? []) {
      const list = byMachine.get(log.machine_name) ?? [];
      list.push(log);
      byMachine.set(log.machine_name, list);
    }
    const out: GapReference[] = [];
    for (const [name, list] of byMachine) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        const prevEnd = sorted[i - 1]!.ended_at;
        if (!prevEnd) continue;
        const seconds = Math.round(
          (new Date(sorted[i]!.started_at).getTime() - new Date(prevEnd).getTime()) / 1000,
        );
        if (seconds > GAP_THRESHOLD_SECONDS) {
          out.push({ machine: name, from: prevEnd, to: sorted[i]!.started_at, seconds });
        }
      }
    }
    return out.sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime());
  }, [logs]);

  const downloadCsv = () => {
    const rows = [
      ["Machine", "Status", "Shift", "Started", "Ended", "Duration (hh:mm:ss)", "Duration (seconds)"],
      ...filtered.map((log) => {
        const seconds = log.duration_seconds;
        return [
          log.machine_name,
          log.status,
          `${shiftOf(log.started_at)} shift`,
          formatTime(log.started_at),
          log.ended_at ? formatTime(log.ended_at) : "active",
          seconds !== null ? formatDuration(seconds) : "active",
          seconds !== null ? String(seconds) : "",
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `status-logs-${machine}-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadSelectedBatch = () => {
    const selected = batchRows.filter((log) => selectedBatchIds.includes(log.id));
    if (selected.length === 0) return;
    const rows = [
      ["Machine", "Status", "Shift", "Started", "Ended", "Duration (hh:mm:ss)", "Duration (seconds)", "Note"],
      ...selected.map((log) => [
        log.machine_name,
        log.status,
        `${shiftOf(log.started_at)} shift`,
        formatTime(log.started_at),
        log.ended_at ? formatTime(log.ended_at) : "active",
        log.duration_seconds !== null ? formatDuration(log.duration_seconds) : "active",
        log.duration_seconds !== null ? String(log.duration_seconds) : "",
        log.note ?? "",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `status-logs-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetBatchResults = () => {
    setBatchRows([]);
    setSelectedBatchIds([]);
    setBatchError(null);
    setBatchApplied(false);
  };

  const loadBatchRows = async () => {
    if (batchFrom && batchTo && new Date(batchFrom).getTime() > new Date(batchTo).getTime()) {
      setBatchError("Start date and time must be before end date and time.");
      return;
    }
    setBatchLoading(true);
    setBatchError(null);
    setBatchRows([]);
    setSelectedBatchIds([]);
    try {
      const result = await fetchBatchLogs({
        data: {
          from: batchFrom ? new Date(batchFrom).toISOString() : undefined,
          to: batchTo ? new Date(batchTo).toISOString() : undefined,
          machine: batchMachine === "all" ? undefined : batchMachine,
          status: batchStatus === "all" ? undefined : batchStatus,
        },
      });
      setBatchRows(result);
      setSelectedBatchIds(result.map((log) => log.id));
      setBatchApplied(true);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "Could not load matching logs.");
    } finally {
      setBatchLoading(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageLogs = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (!jumpTo) return;
    const idx = filtered.findIndex(
      (l) => l.machine_name === jumpTo.machine && Date.parse(l.started_at) === jumpTo.started,
    );
    if (idx >= 0) {
      setPage(Math.floor(idx / PAGE_SIZE) + 1);
      setJumpTo(null);
    }
  }, [jumpTo, filtered]);

  return (
    <main className="min-h-screen bg-background px-5 py-10 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Data Logger
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Status Logs
            </h1>
          </div>
          <SiteNav />
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Machine
            </span>
            <select
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
            >
              <option value="all">All machines</option>
              {(machines ?? []).map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <EditorBar
            onAdd={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <CheckSquare className="size-4" />
              Batch download
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Download className="size-4" />
              Download ({filtered.length})
            </button>
          </div>
        </div>
        <LogEntryDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          machines={machines ?? []}
          entry={editing}
          defaultMachine={machine}
          referenceGaps={gaps}
          onSave={async (v) => {
            if (editing) {
              await editLog({ data: { id: editing.id, ...v } });
            } else {
              if (!v.ended_at) throw new Error("End time is required");
              await addLog({ data: { ...v, ended_at: v.ended_at } });
            }
            await qc.invalidateQueries({ queryKey: ["logs"] });
            setJumpTo({ machine: v.machine, started: Date.parse(v.started_at) });
          }}
        />

        <Dialog
          open={noteLog !== null}
          onOpenChange={(open) => {
            if (!open && !noteBusy) {
              setNoteLog(null);
              setNoteError(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Note for {noteLog?.machine_name}</DialogTitle>
              <DialogDescription>
                {noteLog?.status} · {noteLog ? formatTime(noteLog.started_at) : ""}
              </DialogDescription>
            </DialogHeader>
            <div>
              <Textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                maxLength={2000}
                rows={6}
                placeholder="Add a note for this log entry…"
                aria-label="Log note"
                className="resize-y"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {noteDraft.length}/2000
              </p>
            </div>
            {noteError && <p className="text-sm text-destructive">{noteError}</p>}
            <DialogFooter>
              <button
                type="button"
                disabled={noteBusy}
                onClick={() => {
                  setNoteLog(null);
                  setNoteError(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={noteBusy}
                onClick={async () => {
                  if (!noteLog) return;
                  setNoteBusy(true);
                  setNoteError(null);
                  try {
                    await saveNote({ data: { id: noteLog.id, note: noteDraft } });
                    await qc.invalidateQueries({ queryKey: ["logs"] });
                    setNoteLog(null);
                  } catch {
                    setNoteError("Could not save the note. Please try again.");
                  } finally {
                    setNoteBusy(false);
                  }
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {noteBusy ? "Saving…" : "Save note"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={batchOpen}
          onOpenChange={(open) => {
            setBatchOpen(open);
            if (!open) setBatchError(null);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Batch download logs</DialogTitle>
              <DialogDescription>
                Filter the logs, then select the entries you want included in the CSV. Available
                without signing in.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                void loadBatchRows();
              }}
            >
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  From date and time
                </span>
                <input
                  type="datetime-local"
                  value={batchFrom}
                  onChange={(event) => {
                    setBatchFrom(event.target.value);
                    resetBatchResults();
                  }}
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  To date and time
                </span>
                <input
                  type="datetime-local"
                  value={batchTo}
                  onChange={(event) => {
                    setBatchTo(event.target.value);
                    resetBatchResults();
                  }}
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Machine
                </span>
                <select
                  value={batchMachine}
                  onChange={(event) => {
                    setBatchMachine(event.target.value);
                    resetBatchResults();
                  }}
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">All machines</option>
                  {(machines ?? []).map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Status
                </span>
                <select
                  value={batchStatus}
                  onChange={(event) => {
                    setBatchStatus(event.target.value);
                    resetBatchResults();
                  }}
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">All statuses</option>
                  {batchStatusOptions.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={batchLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                >
                  {batchLoading ? "Filtering…" : "Apply filters"}
                </button>
              </div>
            </form>
            {batchError && <p className="text-sm text-destructive">{batchError}</p>}
            {batchRows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={selectedBatchIds.length === batchRows.length}
                      onChange={(event) =>
                        setSelectedBatchIds(
                          event.target.checked ? batchRows.map((log) => log.id) : [],
                        )
                      }
                      className="size-4 accent-primary"
                    />
                    Select all {batchRows.length} matching logs
                  </label>
                  <span className="text-sm text-muted-foreground">
                    {selectedBatchIds.length} selected
                  </span>
                </div>
                <div className="max-h-72 overflow-auto rounded-md border border-border">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2" aria-label="Select row" />
                        <th className="px-3 py-2">Machine</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Started</th>
                        <th className="px-3 py-2">Ended</th>
                        <th className="px-3 py-2 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchRows.map((log) => (
                        <tr key={log.id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedBatchIds.includes(log.id)}
                              onChange={(event) =>
                                setSelectedBatchIds((ids) =>
                                  event.target.checked
                                    ? [...ids, log.id]
                                    : ids.filter((id) => id !== log.id),
                                )
                              }
                              aria-label={`Select ${log.machine_name}, ${log.status}, ${formatTime(log.started_at)}`}
                              className="size-4 accent-primary"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono">{log.machine_name}</td>
                          <td className="px-3 py-2">{log.status}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                            {formatTime(log.started_at)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                            {log.ended_at ? formatTime(log.ended_at) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                            {log.duration_seconds !== null
                              ? formatDuration(log.duration_seconds)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <DialogFooter>
                  <button
                    type="button"
                    onClick={downloadSelectedBatch}
                    disabled={selectedBatchIds.length === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Download className="size-4" />
                    Download selected ({selectedBatchIds.length})
                  </button>
                </DialogFooter>
              </>
            )}
            {!batchLoading && batchRows.length === 0 && !batchError && (
              <p className="text-sm text-muted-foreground">
                {batchApplied
                  ? "No completed log entries match these filters."
                  : "Apply filters to find matching completed log entries."}
              </p>
            )}
          </DialogContent>
        </Dialog>

        {gaps.length > 0 && (
          <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-wider text-primary">
                <AlertTriangle className="size-4" />
                Missing logs detected ({gaps.length} {gaps.length === 1 ? "interval" : "intervals"})
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Gaps longer than {GAP_THRESHOLD_SECONDS} seconds between records. Use "Add missing
                entry" to fill them.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGapDialogOpen(true)}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              View
            </button>
          </section>
        )}

        <Dialog open={gapDialogOpen} onOpenChange={setGapDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Missing logs detected ({gaps.length} {gaps.length === 1 ? "interval" : "intervals"})
              </DialogTitle>
              <DialogDescription>
                Gaps longer than {GAP_THRESHOLD_SECONDS} seconds between records. Use "Add missing
                entry" to fill them.
              </DialogDescription>
            </DialogHeader>
            <ul className="custom-scrollbar max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {gaps.map((g) => (
                <li
                  key={`${g.machine}-${g.from}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs"
                >
                  <span className="font-semibold text-foreground">{g.machine}</span>
                  <span className="text-muted-foreground">
                    {formatTime(g.from)} → {formatTime(g.to)}
                  </span>
                  <span className="ml-auto text-primary">{formatDuration(g.seconds)}</span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              {editor ? (
                <button
                  type="button"
                  onClick={() => {
                    setGapDialogOpen(false);
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Add missing entry
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSignInOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <KeyRound className="size-4" />
                  Sign in to edit
                </button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />

        <section className="mt-8">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Shift</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Ended</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-2 py-3 text-center">Note</th>
                  {editor && <th className="px-2 py-3" />}
                </tr>
              </thead>
              <tbody>
                {pageLogs.map((log) => (
                  <tr key={log.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-muted-foreground">{log.machine_name}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{log.status}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-xs ${shiftOf(log.started_at) === "Day" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}
                      >
                        {shiftOf(log.started_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {formatTime(log.started_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {log.ended_at ? formatTime(log.ended_at) : "— active —"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">
                      {log.duration_seconds !== null ? formatDuration(log.duration_seconds) : "active"}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteLog(log);
                          setNoteDraft(log.note ?? "");
                          setNoteError(null);
                        }}
                        className={`rounded-md p-1.5 transition-colors hover:bg-accent ${
                          log.note
                            ? "text-primary hover:text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-label={log.note ? "View or edit note" : "Add note"}
                        title={log.note ? "View or edit note" : "Add note"}
                      >
                        <NotebookPen className="size-4" />
                      </button>
                    </td>
                    {editor && (
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(log);
                            setDialogOpen(true);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label="Edit entry"
                          title="Edit entry"
                        >
                          <Pencil className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!isPending && filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-muted-foreground" colSpan={editor ? 7 : 6}>
                      No status entries for this selection yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="font-mono text-xs text-muted-foreground">
                  {currentPage} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage === pageCount}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
