import assert from "node:assert/strict";
import test from "node:test";

import { isStatusLabelFormatted, validateStatusLabels } from "./status-catalog.ts";

test("status labels require a non-empty code and name separated by ' - '", () => {
  assert.equal(isStatusLabelFormatted("T - Testing"), true);
  assert.equal(isStatusLabelFormatted("CM - Corrective Maintenance"), true);
  assert.equal(isStatusLabelFormatted("T - "), false);
  assert.equal(isStatusLabelFormatted(" - Testing"), false);
  assert.equal(isStatusLabelFormatted("Testing"), false);
  assert.equal(isStatusLabelFormatted("T-Testing"), false);
});

test("status validation rejects new labels without the expected format", () => {
  assert.throws(
    () => validateStatusLabels(["Testing"]),
    /Use format "code - name" \(for example, "T - Testing"\)/,
  );
  assert.doesNotThrow(() => validateStatusLabels(["T - Testing"]));
});

test("status validation allows unchanged legacy labels when editing a machine", () => {
  assert.doesNotThrow(() => validateStatusLabels(["Testing"], ["Testing"]));
  assert.throws(() => validateStatusLabels(["Different status"], ["Testing"]));
});
