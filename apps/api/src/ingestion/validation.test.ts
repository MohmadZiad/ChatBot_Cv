// apps/api/src/ingestion/validation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCvTextUsable } from "./validation.js";

test("accepts CV text with enough length", () => {
  const sample = "Professional experience: " + "a".repeat(250);
  assert.equal(isCvTextUsable(sample), true);
});

test("rejects missing or very short CV text", () => {
  assert.equal(isCvTextUsable(""), false);
  assert.equal(isCvTextUsable("   short  "), false);
});

test("rejects unexpected CV payloads", () => {
  assert.equal(isCvTextUsable(null as any), false);
  assert.equal(isCvTextUsable(undefined as any), false);
  assert.equal(isCvTextUsable(123 as any), false);
});
