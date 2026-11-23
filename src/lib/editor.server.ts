import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { useSession } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { splitLogsAtShiftCutoffs } from "@/lib/machine-status.server";

type EditorSession = { editor?: boolean; username?: string };

function sessionConfig() {
  return {
    password: process.env["EDITOR_SESSION_SECRET"]!,
    name: "log-editor",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" },
  };
}

function hash(password: string, salt: string) {
  return pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

async function readAccount() {
  const { data, error } = await db()
    .from("editor_account")
    .select("username, password_salt, password_hash")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return data as { username: string; password_salt: string; password_hash: string };
}

export async function verifyCredentials(username: string, password: string) {
  const acc = await readAccount();
  const a = Buffer.from(hash(password, acc.password_salt), "hex");
  const b = Buffer.from(acc.password_hash, "hex");
  const passOk = a.length === b.length && timingSafeEqual(a, b);
  const userOk = username.trim().toLowerCase() === acc.username.toLowerCase();
  return passOk && userOk ? acc.username : null;
}

export async function getEditor() {
  const session = await useSession<EditorSession>(sessionConfig());
  return session.data.editor ? { username: session.data.username ?? "" } : null;
}

export async function requireEditor() {
  const editor = await getEditor();
  if (!editor) throw new Error("Sign in to edit logs");
  return editor;
}

export async function startEditorSession(username: string) {
  const session = await useSession<EditorSession>(sessionConfig());
  await session.update({ editor: true, username });
}

export async function endEditorSession() {
  const session = await useSession<EditorSession>(sessionConfig());
  await session.clear();
}

export async function saveCredentials(username: string, password: string) {
  const salt = randomBytes(16).toString("hex");
  const { error } = await db()
    .from("editor_account")
    .update({
      username: username.trim(),
      password_salt: salt,
      password_hash: hash(password, salt),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function insertManualLog(machine: string, status: string, startedAt: string, endedAt: string) {
  const duration = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
  const { error } = await supabaseAdmin.from("machine_status_logs").insert({
    machine_name: machine,
    status,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    duration_seconds: duration,
  });
  if (error) throw new Error(error.message);
  await splitLogsAtShiftCutoffs(machine, new Date(Date.parse(startedAt) - 1000).toISOString());
}

export async function updateManualLog(
  id: string,
  machine: string,
  status: string,
  startedAt: string,
  endedAt: string | null,
) {
  const duration = endedAt ? Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000) : null;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("machine_status_logs")
    .select("machine_name, ended_at")
    .eq("id", id)
    .single();
  if (existingError) throw new Error(existingError.message);

  const { error } = await supabaseAdmin
    .from("machine_status_logs")
    .update({
      machine_name: machine,
      status,
      started_at: new Date(startedAt).toISOString(),
      ended_at: endedAt ? new Date(endedAt).toISOString() : null,
      duration_seconds: duration,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (existing.ended_at && endedAt) {
    const { data: currentMachine, error: machineError } = await supabaseAdmin
      .from("machines")
      .select("id, current_started_at")
      .eq("name", existing.machine_name)
      .single();
    if (machineError) throw new Error(machineError.message);

    if (
      currentMachine.current_started_at &&
      Date.parse(currentMachine.current_started_at) === Date.parse(existing.ended_at)
    ) {
      const { error: syncError } = await supabaseAdmin
        .from("machines")
        .update({ current_started_at: new Date(endedAt).toISOString() })
        .eq("id", currentMachine.id)
        .eq("current_started_at", currentMachine.current_started_at);
      if (syncError) throw new Error(syncError.message);
    }
  }

  if (endedAt) {
    await splitLogsAtShiftCutoffs(machine, new Date(Date.parse(startedAt) - 1000).toISOString());
  }
}
