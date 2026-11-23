import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { addMachine, editMachine, getMachines, removeMachine } from "@/lib/machines.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { postmanSnippet } from "@/lib/status-format";
import {
  isStatusLabelFormatted,
  STATUS_CATALOG,
  STATUS_LABEL_FORMAT_HELP,
  STATUS_PRESET_LABELS,
  presetLabel,
} from "@/lib/status-catalog";

export const Route = createFileRoute("/machines")({
  head: () => ({
    meta: [
      { title: "Manage Machines — Machine Status Logger" },
      {
        name: "description",
        content:
          "Add machines, rename them, and edit the status labels each machine reports to the data logger.",
      },
      { property: "og:title", content: "Manage Machines — Machine Status Logger" },
      {
        property: "og:description",
        content:
          "Add machines, rename them, and edit the status labels each machine reports to the data logger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MachinesPage,
});

type Machine = { id: string; name: string; statuses: { label: string }[] };

function MachinesPage() {
  const queryClient = useQueryClient();
  const fetchMachines = useServerFn(getMachines);
  const createFn = useServerFn(addMachine);
  const updateFn = useServerFn(editMachine);
  const deleteFn = useServerFn(removeMachine);

  const { data: machines, isPending } = useQuery({
    queryKey: ["machines"],
    queryFn: () => fetchMachines(),
  });

  const [futureOpen, setFutureOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStatuses, setNewStatuses] = useState<string[]>([...STATUS_PRESET_LABELS]);

  const [editTarget, setEditTarget] = useState<Machine | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatuses, setEditStatuses] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["machines"] });
    queryClient.invalidateQueries({ queryKey: ["machine-status"] });
  };

  const create = useMutation({
    mutationFn: (vars: { name: string; statuses: string[] }) => createFn({ data: vars }),
    onSuccess: () => {
      setAddOpen(false);
      setNewName("");
      setNewStatuses([...STATUS_PRESET_LABELS]);
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; name: string; statuses: string[] }) => updateFn({ data: vars }),
    onSuccess: () => {
      setEditTarget(null);
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (vars: { id: string }) => deleteFn({ data: vars }),
    onSuccess: () => {
      setDeleteTarget(null);
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const startEdit = (machine: Machine) => {
    setEditTarget(machine);
    setEditName(machine.name);
    setEditStatuses(machine.statuses.map((s) => s.label));
    setError(null);
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Configuration
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Machines
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SiteNav />
            <Button onClick={() => setFutureOpen(true)}>Add new machine</Button>
          </div>

        </header>

        {error && (
          <p className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <section className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>Statuses</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(machines ?? []).map((machine) => (
                <TableRow key={machine.id}>
                  <TableCell className="font-mono font-semibold text-foreground">
                    {machine.name}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    <p className="mb-1 font-mono text-xs uppercase tracking-widest">
                      {machine.statuses.length} statuses
                    </p>
                    <ul className="custom-scrollbar max-h-[80px] space-y-1 overflow-y-auto pr-2 text-sm">
                      {machine.statuses.map((s, i) => (
                        <li key={`${machine.id}-${i}`} className="flex gap-2">
                          <span className="font-mono text-xs text-primary">{i + 1}</span>
                          <span className="min-w-0 break-words">{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>

                  <TableCell className="align-top text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${machine.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link to="/machine/$name" params={{ name: machine.name }}>
                            View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => startEdit(machine)}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(machine)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {isPending && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isPending && (machines ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No machines yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      {/* Future-update notice before adding a machine */}
      <Dialog open={futureOpen} onOpenChange={setFutureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Multi-machine support is coming</DialogTitle>
            <DialogDescription>
              The prototype currently runs a single ESP32 on MACHINE-01. Adding more machines is
              part of a future update — you can still register one now, but it will stay idle until
              a device is assigned to it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFutureOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setFutureOpen(false);
                setAddOpen(true);
              }}
            >
              Continue anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add machine */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a machine</DialogTitle>
            <DialogDescription>Name the machine and list the statuses it reports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Machine name
              </span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="MACHINE-02"
                className="mt-2 font-mono"
              />
            </label>
            <StatusEditor statuses={newStatuses} onChange={setNewStatuses} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate({ name: newName, statuses: newStatuses })}
              disabled={create.isPending || newName.trim().length === 0}
            >
              {create.isPending ? "Adding…" : "Add machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit machine */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit machine</DialogTitle>
            <DialogDescription>
              Renaming carries over to existing log entries for this machine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Machine name
              </span>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-2 font-mono"
              />
            </label>
            <StatusEditor statuses={editStatuses} onChange={setEditStatuses} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editTarget &&
                update.mutate({ id: editTarget.id, name: editName, statuses: editStatuses })
              }
              disabled={update.isPending}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the machine, its status labels, and all of its logged history. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) remove.mutate({ id: deleteTarget.id });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function StatusEditor({
  statuses,
  onChange,
}: {
  statuses: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const selected = new Set(statuses);
  const extras = statuses.filter((s) => !STATUS_PRESET_LABELS.includes(s));

  const toggle = (label: string) => {
    if (selected.has(label)) {
      onChange(statuses.filter((s) => s !== label));
      return;
    }
    // keep catalog ordering, custom labels stay at the end
    const next = [...statuses, label];
    onChange([
      ...STATUS_PRESET_LABELS.filter((l) => next.includes(l)),
      ...next.filter((l) => !STATUS_PRESET_LABELS.includes(l)),
    ]);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Statuses reported by this machine
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onChange([...STATUS_PRESET_LABELS])}>
            Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(extras)}>
            Clear
          </Button>
        </div>
      </div>

      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {STATUS_CATALOG.map((preset) => {
          const label = presetLabel(preset);
          return (
            <label
              key={preset.code}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/60"
            >
              <input
                type="checkbox"
                checked={selected.has(label)}
                onChange={() => toggle(label)}
                className="h-4 w-4 accent-primary"
              />
              <span className="w-10 shrink-0 font-mono text-xs font-semibold text-foreground">
                {preset.code}
              </span>
              <span className="text-sm text-muted-foreground">{preset.name}</span>
            </label>
          );
        })}
      </div>

      {extras.length > 0 && (
        <div className="mt-3 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Custom statuses
          </span>
          {extras.map((label) => (
            <div key={label} className="flex items-center gap-2">
              <Input value={label} readOnly className="font-mono" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(statuses.filter((s) => s !== label))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setCustomError(null);
          }}
          placeholder="T - Testing"
          aria-invalid={customError !== null}
          className="font-mono"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const label = custom.trim();
            if (!label) return;
            if (!isStatusLabelFormatted(label)) {
              setCustomError(STATUS_LABEL_FORMAT_HELP);
              return;
            }
            if (!statuses.includes(label)) onChange([...statuses, label]);
            setCustom("");
            setCustomError(null);
          }}
        >
          Add
        </Button>
      </div>
      {customError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {customError}
        </p>
      )}

      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Devices may post the code ({'"R"'}), the full label, or the current position number.
        Positions can change when the selected statuses change; use the code or full label for a
        stable mapping.
      </p>
    </div>
  );
}
