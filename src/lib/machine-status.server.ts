import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateStatusLabels } from "@/lib/status-catalog";
import { planStatusDefinitionChanges } from "@/lib/machine-status-plan";
import { cutoffsBetween } from "@/lib/shift";

export const DEFAULT_MACHINE = "MACHINE-01";

export type MachineStatusDef = { id: string; label: string; position: number };
export type Machine = {
  id: string;
  name: string;
  created_at: string;
  current_status: string | null;
  current_started_at: string | null;
  statuses: MachineStatusDef[];
};

export type StatusLog = {
  id: string;
  machine_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note?: string | null;
};

export type StatusStat = {
  label: string;
  totalSeconds: number;
  sessions: number;
  completedSessions: number;
  averageSeconds: number;
};

const LOG_SELECT = "id, machine_name, status, started_at, ended_at, duration_seconds, note";

export async function saveLogNote(id: string, note: string | null) {
  const { error } = await supabaseAdmin
    .from("machine_status_logs")
    .update({ note })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
}

export async function listMachines(): Promise<Machine[]> {
  const { data: machines, error } = await supabaseAdmin
    .from("machines")
    .select("id, name, created_at, current_status, current_started_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: statuses, error: statusError } = await supabaseAdmin
    .from("machine_statuses")
    .select("id, machine_id, label, position")
    .order("position", { ascending: true });
  if (statusError) throw new Error(statusError.message);

  return (machines ?? []).map((m) => ({
    ...m,
    statuses: (statuses ?? [])
      .filter((s) => s.machine_id === m.id)
      .map((s) => ({ id: s.id, label: s.label, position: s.position })),
  }));
}

async function getMachineByName(name: string) {
  const machines = await listMachines();
  return machines.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export type StatusTransitionInput = {
  machine: string;
  current_status: unknown;
  previous_status: unknown | null;
  previous_started_at: string | null;
  previous_ended_at: string | null;
  previous_duration_seconds: number | null;
};

export async function writeStatusTransition(input: StatusTransitionInput) {
  const machine = await getMachineByName(input.machine);
  if (!machine) throw new Error(`Unknown machine: ${input.machine}`);

  const currentStatus = resolveStatusLabel(input.current_status, machine.statuses);
  if (!currentStatus) throw new Error("UNKNOWN_STATUS");

  const previousStatus =
    input.previous_status === null
      ? null
      : resolveStatusLabel(input.previous_status, machine.statuses);
  if (input.previous_status !== null && !previousStatus) {
    throw new Error("UNKNOWN_PREVIOUS_STATUS");
  }

  const currentStartedAt = input.previous_ended_at ?? new Date().toISOString();
  const { error } = await supabaseAdmin.rpc("record_machine_status_transition", {
    p_machine_name: machine.name,
    p_current_status: currentStatus,
    p_current_started_at: currentStartedAt,
    p_previous_status: previousStatus,
    p_previous_started_at: input.previous_started_at,
    p_previous_ended_at: input.previous_ended_at,
    p_previous_duration_seconds: input.previous_duration_seconds,
  } as never);
  if (error) throw new Error(error.message);

  return {
    machine: machine.name,
    current_status: currentStatus,
    previous_logged: previousStatus !== null,
    started_at: currentStartedAt,
  };
}

function computeStats(labels: string[], logs: StatusLog[], now: number): StatusStat[] {
  const seen = new Set(labels);
  for (const log of logs) {
    if (log.ended_at !== null) seen.add(log.status);
  }

  return [...seen].map((label) => {
    const entries = logs.filter((l) => l.ended_at !== null && l.status === label);
    const completed = entries.filter((l) => l.duration_seconds !== null);
    const totalSeconds = entries.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
    const completedTotal = completed.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
    return {
      label,
      totalSeconds,
      sessions: entries.length,
      completedSessions: completed.length,
      averageSeconds: completed.length > 0 ? Math.round(completedTotal / completed.length) : 0,
    };
  });
}

export async function readStatus(machineName: string = DEFAULT_MACHINE, statusFilter?: string) {
  const machine = await getMachineByName(machineName);
  const name = machine?.name ?? machineName;

  const { data, error } = await supabaseAdmin
    .from("machine_status_logs")
    .select(LOG_SELECT)
    .eq("machine_name", name)
    .order("started_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);

  const logs = (data ?? []) as StatusLog[];
  const now = Date.now();
  const labels = machine?.statuses.map((s) => s.label) ?? [];
  const completedLogs = logs.filter((log) => log.ended_at !== null);
  const stats = computeStats(labels, completedLogs, now);
  const current =
    machine?.current_status && machine.current_started_at
      ? {
          id: `current-${machine.id}`,
          machine_name: machine.name,
          status: machine.current_status,
          started_at: machine.current_started_at,
          ended_at: null,
          duration_seconds: null,
          note: null,
        }
      : (logs.find((log) => log.ended_at === null) ?? completedLogs[0] ?? null);
  const filtered = statusFilter
    ? completedLogs.filter((l) => l.status === statusFilter)
    : completedLogs;

  const totals: Record<string, number> = {};
  for (const stat of stats) totals[stat.label] = stat.totalSeconds;

  return {
    machine: name,
    statuses: labels,
    current,
    logs: filtered,
    stats,
    totals,
    serverTime: new Date(now).toISOString(),
  };
}

export async function writeStatus(rawStatus: unknown, machineName: string = DEFAULT_MACHINE) {
  const machine = await getMachineByName(machineName);
  if (!machine) throw new Error(`Unknown machine: ${machineName}`);

  const status = resolveStatusLabel(rawStatus, machine.statuses);
  if (!status) throw new Error("UNKNOWN_STATUS");

  const now = new Date();

  const { data: open, error: openError } = await supabaseAdmin
    .from("machine_status_logs")
    .select(LOG_SELECT)
    .eq("machine_name", machine.name)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (openError) throw new Error(openError.message);

  const active = (open?.[0] ?? null) as StatusLog | null;

  if (active?.status === status) {
    const { error } = await supabaseAdmin
      .from("machines")
      .update({ current_status: status, current_started_at: active.started_at })
      .eq("id", machine.id);
    if (error) throw new Error(error.message);
    return { changed: false, ...(await readStatus(machine.name)) };
  }

  if (active) {
    const duration = Math.max(
      0,
      Math.floor((now.getTime() - new Date(active.started_at).getTime()) / 1000),
    );
    const { error } = await supabaseAdmin
      .from("machine_status_logs")
      .update({ ended_at: now.toISOString(), duration_seconds: duration })
      .eq("id", active.id);
    if (error) throw new Error(error.message);
  }

  const { error: insertError } = await supabaseAdmin
    .from("machine_status_logs")
    .insert({ machine_name: machine.name, status, started_at: now.toISOString() });
  if (insertError) throw new Error(insertError.message);

  const { error: machineError } = await supabaseAdmin
    .from("machines")
    .update({ current_status: status, current_started_at: now.toISOString() })
    .eq("id", machine.id);
  if (machineError) throw new Error(machineError.message);

  return { changed: true, ...(await readStatus(machine.name)) };
}

export type SessionBatchItem = {
  machine: string;
  previous_status?: unknown | null;
  new_status: unknown;
  duration_seconds: number;
  sequence: number;
  started_at: string;
  ended_at: string;
};

export type SessionBatchResult = {
  accepted: number;
  machines: Record<string, { logged: number; current: string | null; lastSequence: number }>;
};

// Records ESP32 completed-session batches. Chains timestamps forward in sequence
// order so SQL queries ordered by `started_at DESC` strictly align with sequence numbers.
export async function writeSessionBatch(items: SessionBatchItem[]): Promise<SessionBatchResult> {
  const machines = await listMachines();
  const byName = new Map(machines.map((m) => [m.name.toLowerCase(), m]));

  // Group and validate items per machine before writing anything.
  const groups = new Map<
    string,
    {
      machine: Machine;
      items: {
        loggedStatus: string | null;
        currentStatus: string;
        duration: number;
        sequence: number;
        startedAt: string;
        endedAt: string;
      }[];
    }
  >();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const machine = byName.get(item.machine.trim().toLowerCase());
    if (!machine) throw new Error(`Item ${i}: unknown machine "${item.machine}"`);
    if (!item.started_at || !item.ended_at) {
      throw new Error(`Item ${i}: missing started_at or ended_at for ${machine.name}`);
    }
    let loggedStatus: string | null;
    if (item.previous_status === null) {
      loggedStatus = null;
    } else if (typeof item.previous_status !== "undefined") {
      const label = resolveStatusLabel(item.previous_status, machine.statuses);
      if (!label) throw new Error(`Item ${i}: unknown previous_status for ${machine.name}`);
      loggedStatus = label;
    } else {
      // Batches sent before previous_status was introduced logged new_status.
      loggedStatus = null;
    }
    const next = resolveStatusLabel(item.new_status, machine.statuses);
    if (!next) throw new Error(`Item ${i}: unknown new_status for ${machine.name}`);
    const group = groups.get(machine.name) ?? { machine, items: [] };
    if (group.items.some((e) => e.sequence === item.sequence)) {
      throw new Error(`Item ${i}: duplicate sequence ${item.sequence} for ${machine.name}`);
    }
    group.items.push({
      loggedStatus: loggedStatus ?? (typeof item.previous_status === "undefined" ? next : null),
      currentStatus: next,
      duration: Math.max(0, Math.floor(item.duration_seconds)),
      sequence: item.sequence,
      startedAt: item.started_at,
      endedAt: item.ended_at,
    });
    groups.set(machine.name, group);
  }

  const result: SessionBatchResult = { accepted: 0, machines: {} };

  for (const [name, group] of groups) {
    const sorted = [...group.items].sort((a, b) => a.sequence - b.sequence);
    const lastItem = sorted[sorted.length - 1];

    let inserted = 0;
    for (const item of sorted) {
      const { error } = await supabaseAdmin.rpc("record_machine_status_transition", {
        p_machine_name: name,
        p_current_status: item.currentStatus,
        p_current_started_at: item.endedAt,
        p_previous_status: item.loggedStatus,
        p_previous_started_at: item.loggedStatus ? item.startedAt : null,
        p_previous_ended_at: item.loggedStatus ? item.endedAt : null,
        p_previous_duration_seconds: item.loggedStatus ? item.duration : null,
      } as never);
      if (error) throw new Error(error.message);
      if (item.loggedStatus !== null) inserted += 1;
    }

    const current = lastItem ? lastItem.currentStatus : null;
    result.accepted += inserted;
    result.machines[name] = {
      logged: inserted,
      current,
      lastSequence: lastItem ? lastItem.sequence : 0,
    };
  }

  for (const [name, group] of groups) {
    const earliest = Math.min(...group.items.map((i) => new Date(i.startedAt).getTime()));
    await splitLogsAtShiftCutoffs(name, new Date(earliest - 1000).toISOString());
  }

  return result;
}

// Splits completed logs that cross 07:30 / 19:30 (UTC+8) into one row per shift.
export async function splitLogsAtShiftCutoffs(machineName: string, sinceIso: string) {
  const { data, error } = await supabaseAdmin
    .from("machine_status_logs")
    .select(LOG_SELECT)
    .eq("machine_name", machineName)
    .not("ended_at", "is", null)
    .gte("ended_at", sinceIso);
  if (error) throw new Error(error.message);
  for (const log of (data ?? []) as StatusLog[]) {
    const start = new Date(log.started_at).getTime();
    const end = new Date(log.ended_at!).getTime();
    const cuts = cutoffsBetween(start, end);
    if (cuts.length === 0) continue;
    const bounds = [start, ...cuts, end];
    const secs = (a: number, b: number) => Math.round((b - a) / 1000);
    const { error: upErr } = await supabaseAdmin
      .from("machine_status_logs")
      .update({ ended_at: new Date(bounds[1]!).toISOString(), duration_seconds: secs(bounds[0]!, bounds[1]!) })
      .eq("id", log.id);
    if (upErr) throw new Error(upErr.message);
    const rows = [];
    for (let i = 1; i < bounds.length - 1; i++) {
      rows.push({
        machine_name: log.machine_name,
        status: log.status,
        started_at: new Date(bounds[i]!).toISOString(),
        ended_at: new Date(bounds[i + 1]!).toISOString(),
        duration_seconds: secs(bounds[i]!, bounds[i + 1]!),
      });
    }
    const { error: insErr } = await supabaseAdmin.from("machine_status_logs").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
}

export function resolveStatusLabel(raw: unknown, statuses: MachineStatusDef[]): string | null {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const byPosition = (p: number) => statuses.find((s) => s.position === p)?.label ?? null;
  const code = (label: string) => (label.split(" - ")[0] ?? label).trim().toLowerCase();

  if (raw === true) return byPosition(1);
  if (raw === false) return byPosition(2);
  if (typeof raw === "number") return byPosition(raw);
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim().toLowerCase();
  const byCode = statuses.find((s) => code(s.label) === trimmed);
  if (byCode) return byCode.label;

  const cleaned = norm(raw);
  const exact = statuses.find((s) => norm(s.label) === cleaned);
  if (exact) return exact.label;
  if (/^\d+$/.test(cleaned)) return byPosition(Number(cleaned));
  return null;
}

export async function createMachine(name: string, statusLabels: string[]) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Machine name is required");
  const labels = dedupeLabels(statusLabels);
  validateStatusLabels(labels);

  const { data: machine, error } = await supabaseAdmin
    .from("machines")
    .insert({ name: trimmed })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);

  const { error: statusError } = await supabaseAdmin
    .from("machine_statuses")
    .insert(labels.map((label, i) => ({ machine_id: machine.id, label, position: i + 1 })));
  if (statusError) throw new Error(statusError.message);

  return { id: machine.id, name: machine.name };
}

export async function updateMachine(id: string, name: string, statusLabels: string[]) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Machine name is required");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("machines")
    .select("id, name")
    .eq("id", id)
    .single();
  if (existingError) throw new Error(existingError.message);

  const { data: current, error: currentError } = await supabaseAdmin
    .from("machine_statuses")
    .select("id, label, position")
    .eq("machine_id", id)
    .order("position", { ascending: true });
  if (currentError) throw new Error(currentError.message);

  const currentRows = current ?? [];
  const labels = dedupeLabels(statusLabels);
  validateStatusLabels(
    labels,
    currentRows.map((row) => row.label),
  );

  if (existing.name !== trimmed) {
    const { error } = await supabaseAdmin.from("machines").update({ name: trimmed }).eq("id", id);
    if (error) throw new Error(error.message);
    const { error: logError } = await supabaseAdmin
      .from("machine_status_logs")
      .update({ machine_name: trimmed })
      .eq("machine_name", existing.name);
    if (logError) throw new Error(logError.message);
  }

  const changes = planStatusDefinitionChanges(currentRows, labels);

  for (const row of changes.removed) {
    const { error } = await supabaseAdmin.from("machine_statuses").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
  }

  for (const { row, position } of changes.retained) {
    if (row.position === position) continue;
    const { error } = await supabaseAdmin
      .from("machine_statuses")
      .update({ position })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }

  for (const { label, position } of changes.added) {
    const { error } = await supabaseAdmin
      .from("machine_statuses")
      .upsert({ machine_id: id, label, position }, { onConflict: "machine_id,label" });
    if (error) throw new Error(error.message);
  }

  return { id, name: trimmed, statuses: labels };
}

export async function deleteMachine(id: string) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("machines")
    .select("id, name")
    .eq("id", id)
    .single();
  if (existingError) throw new Error(existingError.message);

  const { error: logError } = await supabaseAdmin
    .from("machine_status_logs")
    .delete()
    .eq("machine_name", existing.name);
  if (logError) throw new Error(logError.message);

  const { error: statusError } = await supabaseAdmin
    .from("machine_statuses")
    .delete()
    .eq("machine_id", id);
  if (statusError) throw new Error(statusError.message);

  const { error } = await supabaseAdmin.from("machines").delete().eq("id", id);
  if (error) throw new Error(error.message);

  return { id, name: existing.name };
}

function dedupeLabels(labels: string[]) {
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const label of cleaned) {
    if (!out.some((l) => l.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  if (out.length === 0) throw new Error("At least one status is required");
  return out;
}

export type MachineOverview = {
  id: string;
  name: string;
  statuses: string[];
  current: { status: string; started_at: string; active: boolean } | null;
  lastEndedAt: string | null;
};

export async function readOverview(): Promise<{
  serverTime: string;
  machines: MachineOverview[];
}> {
  const machines = await listMachines();

  const { data: open, error } = await supabaseAdmin
    .from("machine_status_logs")
    .select("machine_name, status, started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: closed, error: closedError } = await supabaseAdmin
    .from("machine_status_logs")
    .select("machine_name, status, started_at, ended_at")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(500);
  if (closedError) throw new Error(closedError.message);

  return {
    serverTime: new Date().toISOString(),
    machines: machines.map((m) => {
      const activeLog = (open ?? []).find((row) => row.machine_name === m.name) ?? null;
      const lastClosedLog = (closed ?? []).find((row) => row.machine_name === m.name) ?? null;
      const current =
        m.current_status && m.current_started_at
          ? { status: m.current_status, started_at: m.current_started_at, active: true }
          : activeLog
            ? { status: activeLog.status, started_at: activeLog.started_at, active: true }
            : lastClosedLog
              ? { status: lastClosedLog.status, started_at: lastClosedLog.started_at, active: false }
              : null;
      return {
        id: m.id,
        name: m.name,
        statuses: m.statuses.map((s) => s.label),
        current,
        lastEndedAt: lastClosedLog?.ended_at ?? null,
      };
    }),
  };
}

export async function readLogs(
  machineName?: string,
): Promise<{ serverTime: string; logs: StatusLog[] }> {
  let query = supabaseAdmin
    .from("machine_status_logs")
    .select(LOG_SELECT)
    .order("started_at", { ascending: false })
    .limit(500);
  if (machineName) query = query.eq("machine_name", machineName);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const logs = ((data ?? []) as StatusLog[])
    .filter((log) => log.ended_at !== null)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return { serverTime: new Date().toISOString(), logs };
}

export async function readBatchLogs(filters: {
  from?: string | undefined;
  to?: string | undefined;
  machine?: string | undefined;
  status?: string | undefined;
}): Promise<StatusLog[]> {
  const pageSize = 1000;
  const maxRows = 10_000;
  const fetchPage = (from: number, to: number) => {
    let query = supabaseAdmin
      .from("machine_status_logs")
      .select(LOG_SELECT)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .range(from, to);
    if (filters.from) query = query.gte("started_at", filters.from);
    if (filters.to) query = query.lte("started_at", filters.to);
    if (filters.machine) query = query.eq("machine_name", filters.machine);
    if (filters.status) query = query.eq("status", filters.status);
    return query;
  };

  const logs: StatusLog[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as StatusLog[];
    logs.push(...page);
    if (page.length < pageSize) return logs;
  }

  const { data, error } = await fetchPage(maxRows, maxRows);
  if (error) throw new Error(error.message);
  if (data?.length) {
    throw new Error("More than 10,000 logs match. Narrow the filters and try again.");
  }
  return logs;
}

export type SummaryBucket = {
  key: string;
  label: string;
  totalSeconds: number;
  sessions: number;
  parts: Record<string, number>;
};

export type SummaryGroup = { rows: SummaryBucket[]; series: string[] };

export function summarizeLogs(logs: StatusLog[], now: number): SummaryGroup {
  const secondsOf = (log: StatusLog) =>
    log.duration_seconds ??
    Math.max(0, Math.floor((now - new Date(log.started_at).getTime()) / 1000));

  const map = new Map<string, SummaryBucket>();
  const series = new Set<string>();
  for (const log of logs) {
    const key = log.machine_name;
    series.add(log.status);
    const seconds = secondsOf(log);
    const entry = map.get(key) ?? { key, label: key, totalSeconds: 0, sessions: 0, parts: {} };
    entry.totalSeconds += seconds;
    entry.sessions += 1;
    entry.parts[log.status] = (entry.parts[log.status] ?? 0) + seconds;
    map.set(key, entry);
  }

  return {
    rows: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)),
    series: [...series].sort((a, b) => a.localeCompare(b)),
  };
}

export function getSummaryRange(
  logs: StatusLog[],
  range: "today" | "overall" = "overall",
  now: Date | number = Date.now(),
): StatusLog[] {
  if (range === "overall" || logs.length === 0) return logs;

  const current = typeof now === "number" ? new Date(now) : now;
  const todayIso = current.toISOString().slice(0, 10);
  return logs.filter((log) => log.started_at.slice(0, 10) === todayIso);
}

export async function readSummary(range: "today" | "overall" = "overall"): Promise<{
  serverTime: string;
  range: "today" | "overall";
  byMachine: SummaryGroup;
}> {
  const { data, error } = await supabaseAdmin
    .from("machine_status_logs")
    .select(LOG_SELECT)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const logs = ((data ?? []) as StatusLog[]).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  const now = Date.now();
  const rows = getSummaryRange(logs, range, now);

  return {
    serverTime: new Date(now).toISOString(),
    range,
    byMachine: summarizeLogs(rows, now),
  };
}
