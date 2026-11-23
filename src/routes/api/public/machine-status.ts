import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const statusValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const legacyBodySchema = z
  .object({
    status: z.union([z.string(), z.number(), z.boolean()]).optional(),
    machine: z.string().max(64).optional(),
  })
  .strict();

const transitionBodySchema = z
  .object({
    current_status: statusValueSchema,
    previous_status: statusValueSchema.nullable().optional(),
    previous_started_at: z.string().datetime().optional(),
    previous_ended_at: z.string().datetime().optional(),
    previous_duration_seconds: z.number().int().min(0).max(31_536_000).optional(),
    machine: z.string().max(64).optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.previous_status == null) return;

    if (
      !body.previous_started_at ||
      !body.previous_ended_at ||
      body.previous_duration_seconds === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "previous_status requires previous_started_at, previous_ended_at, and previous_duration_seconds",
      });
      return;
    }
    if (Date.parse(body.previous_ended_at) <= Date.parse(body.previous_started_at)) {
      context.addIssue({
        code: "custom",
        message: "previous_ended_at must be after previous_started_at",
      });
    }
  });

const bodySchema = z.union([legacyBodySchema, transitionBodySchema]);

const batchItemSchema = z.object({
  machine: z.string().min(1).max(64),
  previous_status: statusValueSchema.nullable().optional(),
  new_status: z.union([z.string(), z.number(), z.boolean()]),
  duration_seconds: z.number().min(0).max(31_536_000),
  sequence: z.number(),
  started_at: z.string().min(1).max(255),
  ended_at: z.string().min(1).max(255),
});
const batchSchema = z.union([
  z.array(batchItemSchema).min(1).max(50),
  z.object({ logs: z.array(batchItemSchema).min(1).max(50) }),
]);

export const Route = createFileRoute("/api/public/machine-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { readStatus, writeStatus, DEFAULT_MACHINE } = await import(
          "@/lib/machine-status.server"
        );
        try {
          const url = new URL(request.url);
          const machine = url.searchParams.get("machine") ?? DEFAULT_MACHINE;
          const raw = url.searchParams.get("status");
          // Convenience for constrained devices that can only issue a GET:
          // /api/public/machine-status?status=1&machine=MACHINE-01
          if (raw !== null) {
            return Response.json(await writeStatus(raw, machine));
          }
          const filter = url.searchParams.get("filter");
          return Response.json(await readStatus(machine, filter ?? undefined));
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Failed to read machine status" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const { writeStatus, writeStatusTransition, DEFAULT_MACHINE } = await import(
          "@/lib/machine-status.server"
        );

        let raw: unknown;
        let machine = DEFAULT_MACHINE;
        const contentType = request.headers.get("content-type") ?? "";
        try {
          if (contentType.includes("application/json")) {
            const json: unknown = await request.json();
            if (Array.isArray(json) || (json && typeof json === "object" && Array.isArray((json as { logs?: unknown }).logs))) {
              const batch = batchSchema.safeParse(json);
              if (!batch.success) {
                return Response.json(
                  { error: "Invalid batch body", details: batch.error.issues[0]?.message },
                  { status: 400 },
                );
              }
              const normalized = Array.isArray(batch.data) ? batch.data : batch.data.logs;
              const { writeSessionBatch } = await import("@/lib/machine-status.server");
              try {
                const result = await writeSessionBatch(normalized);
                return Response.json({ ok: true, ...result });
              } catch (error) {
                const message = error instanceof Error ? error.message : "unknown";
                if (message.startsWith("Item ") || message.includes("missing started_at") || message.includes("Missing timestamps")) {
                  return Response.json({ error: message }, { status: 400 });
                }
                console.error(error);
                return Response.json({ error: "Failed to log session batch" }, { status: 500 });
              }
            }
            const parsed = bodySchema.safeParse(json);
            if (!parsed.success) {
              return Response.json(
                { error: "Invalid body", details: parsed.error.issues[0]?.message },
                { status: 400 },
              );
            }
            if ("current_status" in parsed.data) {
              try {
                const result = await writeStatusTransition({
                  machine: parsed.data.machine ?? DEFAULT_MACHINE,
                  current_status: parsed.data.current_status,
                  previous_status: parsed.data.previous_status ?? null,
                  previous_started_at: parsed.data.previous_started_at ?? null,
                  previous_ended_at: parsed.data.previous_ended_at ?? null,
                  previous_duration_seconds: parsed.data.previous_duration_seconds ?? null,
                });
                return Response.json({ ok: true, ...result });
              } catch (error) {
                const message = error instanceof Error ? error.message : "unknown";
                if (message === "UNKNOWN_STATUS" || message === "UNKNOWN_PREVIOUS_STATUS") {
                  return Response.json({ error: message }, { status: 400 });
                }
                if (message.startsWith("Unknown machine")) {
                  return Response.json({ error: message }, { status: 404 });
                }
                console.error(error);
                return Response.json({ error: "Failed to record status transition" }, { status: 500 });
              }
            }
            raw = parsed.data.status;
            if (parsed.data.machine) machine = parsed.data.machine;
          } else {
            // text/plain or form bodies: "O1", "status=1&machine=MACHINE-02", or just "1"
            const text = (await request.text()).trim();
            if (text.includes("=")) {
              const params = new URLSearchParams(text);
              raw = params.get("status");
              machine = params.get("machine") ?? machine;
            } else {
              raw = text;
            }
          }
        } catch {
          return Response.json({ error: "Could not read request body" }, { status: 400 });
        }

        try {
          const result = await writeStatus(raw, machine);
          return Response.json({
            ok: true,
            machine: result.machine,
            changed: result.changed,
            status: result.current?.status ?? null,
            started_at: result.current?.started_at ?? null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          if (message === "UNKNOWN_STATUS") {
            return Response.json(
              { error: "Unknown status for this machine (try 1, 2, O1, O2, or the exact label)" },
              { status: 400 },
            );
          }
          if (message.startsWith("Unknown machine")) {
            return Response.json({ error: message }, { status: 404 });
          }
          console.error(error);
          return Response.json({ error: "Failed to log machine status" }, { status: 500 });
        }
      },
    },
  },
});
