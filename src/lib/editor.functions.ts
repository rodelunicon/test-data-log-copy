import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentials = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(128),
});

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

const logInput = z
  .object({
    machine: z.string().trim().min(1).max(64),
    status: z.string().trim().min(1).max(64),
    started_at: iso,
    ended_at: iso,
  })
  .refine((v) => Date.parse(v.ended_at) > Date.parse(v.started_at), {
    message: "End time must be after start time",
  });

export const getEditorStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getEditor } = await import("@/lib/editor.server");
  return { editor: await getEditor() };
});

export const editorSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().max(64), password: z.string().max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyCredentials, startEditorSession } = await import("@/lib/editor.server");
    const username = await verifyCredentials(data.username, data.password);
    if (!username) return { ok: false as const };
    await startEditorSession(username);
    return { ok: true as const, username };
  });

export const editorSignOut = createServerFn({ method: "POST" }).handler(async () => {
  const { endEditorSession } = await import("@/lib/editor.server");
  await endEditorSession();
  return { ok: true };
});

export const changeEditorCredentials = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    credentials.extend({ current_password: z.string().max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireEditor, verifyCredentials, saveCredentials, startEditorSession } = await import(
      "@/lib/editor.server"
    );
    const editor = await requireEditor();
    if (!(await verifyCredentials(editor.username, data.current_password))) {
      return { ok: false as const, error: "Current password is incorrect" };
    }
    await saveCredentials(editor.username, data.username, data.password);
    await startEditorSession(data.username.trim());
    return { ok: true as const };
  });

async function validateMachineStatus(machine: string, status: string) {
  const { listMachines } = await import("@/lib/machine-status.server");
  const found = (await listMachines()).find((m) => m.name === machine);
  if (!found) throw new Error("Unknown machine");
  if (!found.statuses.some((s) => s.label === status)) throw new Error("Status not set up for this machine");
}

export const addLogEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => logInput.parse(input))
  .handler(async ({ data }) => {
    const { requireEditor, insertManualLog } = await import("@/lib/editor.server");
    await requireEditor();
    await validateMachineStatus(data.machine, data.status);
    await insertManualLog(data.machine, data.status, data.started_at, data.ended_at);
    return { ok: true };
  });

export const editLogEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        machine: z.string().trim().min(1).max(64),
        status: z.string().trim().min(1).max(64),
        started_at: iso,
        ended_at: iso.nullable(),
      })
      .refine((v) => v.ended_at === null || Date.parse(v.ended_at) > Date.parse(v.started_at), {
        message: "End time must be after start time",
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireEditor, updateManualLog } = await import("@/lib/editor.server");
    await requireEditor();
    await validateMachineStatus(data.machine, data.status);
    await updateManualLog(data.id, data.machine, data.status, data.started_at, data.ended_at);
    return { ok: true };
  });
