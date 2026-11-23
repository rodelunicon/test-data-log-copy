import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, LogOut, Plus, UserCog } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  changeEditorCredentials,
  editorSignIn,
  editorSignOut,
  getEditorStatus,
} from "@/lib/editor.functions";
import { formatDuration, formatTime } from "@/lib/status-format";

export type EditableLog = {
  id: string;
  machine_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
};

type MachineOption = { id: string; name: string; statuses: { label: string }[] };

export type GapReference = { machine: string; from: string; to: string; seconds: number };

const inputCls =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground";
const labelCls = "text-xs font-semibold uppercase tracking-widest text-muted-foreground";
const primaryBtn =
  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40";
const ghostBtn =
  "inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40";

export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function useEditor() {
  const fetchStatus = useServerFn(getEditorStatus);
  const { data } = useQuery({ queryKey: ["editor"], queryFn: () => fetchStatus() });
  return data?.editor ?? null;
}

export function EditorBar({ onAdd }: { onAdd: () => void }) {
  const editor = useEditor();
  const qc = useQueryClient();
  const signOut = useServerFn(editorSignOut);
  const [signInOpen, setSignInOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editor ? (
        <>
          <button type="button" onClick={onAdd} className={primaryBtn}>
            <Plus className="size-4" /> Add missing entry
          </button>
          <button type="button" onClick={() => setAccountOpen(true)} className={ghostBtn} title="Change login">
            <UserCog className="size-4" /> {editor.username}
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              await qc.invalidateQueries({ queryKey: ["editor"] });
            }}
            className={ghostBtn}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setSignInOpen(true)} className={ghostBtn}>
          <KeyRound className="size-4" /> Sign in to edit
        </button>
      )}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} current={editor?.username ?? ""} />
    </div>
  );
}

export function SignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const signIn = useServerFn(editorSignIn);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in to edit logs</DialogTitle>
          <DialogDescription>Enter the editor username and password.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            setError(null);
            try {
              const res = await signIn({
                data: { username: String(fd.get("username")), password: String(fd.get("password")) },
              });
              if (!res.ok) setError("Incorrect username or password");
              else {
                await qc.invalidateQueries({ queryKey: ["editor"] });
                await qc.invalidateQueries({ queryKey: ["logs"] });
                onOpenChange(false);
              }
            } catch {
              setError("Could not sign in. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            <span className={labelCls}>Username</span>
            <input name="username" required autoComplete="username" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Password</span>
            <PasswordInput name="password" required autoComplete="current-password" className={inputCls} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string;
}) {
  const save = useServerFn(changeEditorCredentials);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change editor login</DialogTitle>
          <DialogDescription>Update the username and password used to edit logs.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const password = String(fd.get("password"));
            if (password !== String(fd.get("confirm"))) return setError("New passwords do not match");
            setBusy(true);
            setError(null);
            try {
              const res = await save({
                data: {
                  username: String(fd.get("username")),
                  password,
                  current_password: String(fd.get("current")),
                },
              });
              if (!res.ok) setError(res.error);
              else {
                await qc.invalidateQueries({ queryKey: ["editor"] });
                onOpenChange(false);
              }
            } catch {
              setError("Username needs 3+ characters and password 6+ characters.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            <span className={labelCls}>New username</span>
            <input name="username" defaultValue={current} required minLength={3} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>New password</span>
            <PasswordInput name="password" required minLength={6} autoComplete="new-password" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Confirm new password</span>
            <PasswordInput name="confirm" required minLength={6} autoComplete="new-password" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Current password</span>
            <PasswordInput name="current" required autoComplete="current-password" className={inputCls} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LogEntryDialog({
  open,
  onOpenChange,
  machines,
  entry,
  defaultMachine,
  referenceGaps = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  machines: MachineOption[];
  entry: EditableLog | null;
  defaultMachine?: string;
  referenceGaps?: GapReference[];
  onSave: (v: { machine: string; status: string; started_at: string; ended_at: string | null }) => Promise<void>;
}) {
  const [machine, setMachine] = useState("");
  const [status, setStatus] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (entry) {
      setMachine(entry.machine_name);
      setStatus(entry.status);
      setStart(toLocalInput(entry.started_at));
      setEnd(entry.ended_at ? toLocalInput(entry.ended_at) : "");
    } else {
      const m = defaultMachine && defaultMachine !== "all" ? defaultMachine : (machines[0]?.name ?? "");
      setMachine(m);
      setStatus(machines.find((x) => x.name === m)?.statuses[0]?.label ?? "");
      setStart("");
      setEnd("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const statuses = useMemo(() => machines.find((m) => m.name === machine)?.statuses ?? [], [machines, machine]);
  const duration =
    start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : null;
  const isActive = entry !== null && entry.ended_at === null;
  const showGapReferences = !entry && referenceGaps.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          showGapReferences ? "max-h-[90vh] max-w-5xl overflow-y-auto" : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{entry ? "Edit log entry" : "Add missing entry"}</DialogTitle>
          <DialogDescription>
            {entry ? "Correct this row. Duration is calculated automatically." : "Fill a gap in the history, e.g. while the device was off. Duration is calculated automatically."}
          </DialogDescription>
        </DialogHeader>
        <div
          className={
            showGapReferences
              ? "grid min-w-0 gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
              : undefined
          }
        >
          {showGapReferences && (
            <aside className="min-w-0">
              <h3 className={labelCls}>Detected gaps ({referenceGaps.length})</h3>
              <ul className="custom-scrollbar mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1 md:max-h-[55vh]">
                {referenceGaps.map((gap) => (
                  <li
                    key={`${gap.machine}-${gap.from}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs"
                  >
                    <span className="font-semibold text-foreground">{gap.machine}</span>
                    <span className="text-muted-foreground">
                      {formatTime(gap.from)} → {formatTime(gap.to)}
                    </span>
                    <span className="ml-auto text-primary">{formatDuration(gap.seconds)}</span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <form
            className="min-w-0 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!end && !isActive) return setError("End time is required");
              if (duration !== null && duration <= 0) return setError("End time must be after start time");
              setBusy(true);
              setError(null);
              try {
                await onSave({
                  machine,
                  status,
                  started_at: new Date(start).toISOString(),
                  ended_at: end ? new Date(end).toISOString() : null,
                });
                onOpenChange(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Machine</span>
                <select
                  value={machine}
                  onChange={(e) => {
                    setMachine(e.target.value);
                    setStatus(
                      machines.find((m) => m.name === e.target.value)?.statuses[0]?.label ?? "",
                    );
                  }}
                  className={inputCls}
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputCls}
                >
                  {statuses.map((s) => (
                    <option key={s.label} value={s.label}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className={labelCls}>Started</span>
              <input
                type="datetime-local"
                step={1}
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Ended {isActive && "(leave empty to keep active)"}</span>
              <input
                type="datetime-local"
                step={1}
                required={!isActive}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={inputCls}
              />
            </label>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <span className={labelCls}>Duration</span>
              <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
                {duration === null ? "—" : duration > 0 ? formatDuration(duration) : "Invalid range"}
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <button type="submit" disabled={busy || !machine || !status} className={primaryBtn}>
                {busy ? "Saving…" : "Save"}
              </button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${inputCls} pr-10`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
