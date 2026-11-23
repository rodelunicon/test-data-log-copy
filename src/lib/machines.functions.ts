import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const machineInput = z.object({
  name: z.string().min(1).max(64),
  statuses: z.array(z.string().min(1).max(64)).min(1).max(10),
});

export const getMachines = createServerFn({ method: "GET" }).handler(async () => {
  const { listMachines } = await import("@/lib/machine-status.server");
  return listMachines();
});

export const addMachine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => machineInput.parse(input))
  .handler(async ({ data }) => {
    const { createMachine } = await import("@/lib/machine-status.server");
    return createMachine(data.name, data.statuses);
  });

export const editMachine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => machineInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { updateMachine } = await import("@/lib/machine-status.server");
    return updateMachine(data.id, data.name, data.statuses);
  });

export const removeMachine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { deleteMachine } = await import("@/lib/machine-status.server");
    return deleteMachine(data.id);
  });

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { readOverview } = await import("@/lib/machine-status.server");
  return readOverview();
});

export const getLogs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ machine: z.string().max(64).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { readLogs } = await import("@/lib/machine-status.server");
    return readLogs(data.machine);
  });

export const getBatchLogs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        machine: z.string().max(64).optional(),
        status: z.string().max(64).optional(),
      })
      .refine(
        (filters) =>
          !filters.from || !filters.to || Date.parse(filters.from) <= Date.parse(filters.to),
        { message: "Start date and time must be before end date and time" },
      )
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { readBatchLogs } = await import("@/lib/machine-status.server");
    return readBatchLogs(data);
  });

export const updateLogNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(2000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { saveLogNote } = await import("@/lib/machine-status.server");
    await saveLogNote(data.id, data.note.trim() || null);
    return { ok: true };
  });

export const getSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ range: z.enum(["today", "overall"]).default("overall") }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { readSummary } = await import("@/lib/machine-status.server");
    return readSummary(data.range);
  });
