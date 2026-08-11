import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJsonc, parseJsonc } from "../src/jsonc.js";

test("parses comments and trailing commas without changing string contents", () => {
  const source = `{
    // comment
    "url": "https://example.com/a//b",
    "items": ["/* text */",],
  }`;
  assert.deepEqual(parseJsonc(source).value, {
    url: "https://example.com/a//b",
    items: ["/* text */"]
  });
  assert.equal(normalizeJsonc(source).length, source.length);
});

test("reports a useful location for malformed JSON", () => {
  const parsed = parseJsonc('{\n  "servers": {\n}');
  assert.ok(parsed.error);
  assert.equal(parsed.line, 3);
  assert.ok(parsed.column >= 1);
});
