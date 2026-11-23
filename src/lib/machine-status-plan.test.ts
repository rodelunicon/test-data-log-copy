import assert from "node:assert/strict";
import test from "node:test";

import { planStatusDefinitionChanges } from "./machine-status-plan.ts";

test("removing a status preserves other definitions and only changes their positions", () => {
  const changes = planStatusDefinitionChanges(
    [
      { id: "setup", label: "S - Set up", position: 1 },
      { id: "run", label: "R - Run", position: 2 },
      { id: "stop", label: "P1 - Stop", position: 3 },
    ],
    ["S - Set up", "P1 - Stop"],
  );

  assert.deepEqual(changes, {
    removed: [{ id: "run", label: "R - Run", position: 2 }],
    retained: [
      { row: { id: "setup", label: "S - Set up", position: 1 }, position: 1 },
      { row: { id: "stop", label: "P1 - Stop", position: 3 }, position: 2 },
    ],
    added: [],
  });
});

test("adding a status retains existing labels instead of renaming rows", () => {
  const changes = planStatusDefinitionChanges(
    [
      { id: "setup", label: "S - Set up", position: 1 },
      { id: "run", label: "R - Run", position: 2 },
    ],
    ["S - Set up", "R - Run", "P1 - Stop"],
  );

  assert.deepEqual(
    changes.retained.map(({ row }) => row.label),
    ["S - Set up", "R - Run"],
  );
  assert.deepEqual(changes.added, [{ label: "P1 - Stop", position: 3 }]);
  assert.deepEqual(changes.removed, []);
});

test("a previously removed status is treated as a new definition when re-added", () => {
  const changes = planStatusDefinitionChanges(
    [{ id: "setup", label: "S - Set up", position: 1 }],
    ["S - Set up", "R - Run"],
  );

  assert.deepEqual(changes.added, [{ label: "R - Run", position: 2 }]);
});
