import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.js";

function captureIo() {
  const output = [];
  const errors = [];
  return {
    output,
    errors,
    io: {
      log: (value) => output.push(String(value)),
      error: (value) => errors.push(String(value))
    }
  };
}

test("returns a failure for errors and emits valid JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mcp-cli-"));
  const file = path.join(directory, "mcp.json");
  try {
    await writeFile(file, JSON.stringify({ servers: { broken: {} } }));
    const capture = captureIo();
    const exitCode = await runCli(["--json", file], capture.io);
    assert.equal(exitCode, 1);
    const result = JSON.parse(capture.output.join("\n"));
    assert.equal(result.summary.error, 1);
    assert.equal(result.diagnostics[0].rule, "MCP004");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("strict mode turns warnings into a failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mcp-cli-"));
  const file = path.join(directory, "mcp.json");
  try {
    await writeFile(file, JSON.stringify({
      servers: { demo: { command: "npx", args: ["-y", "example-mcp-server"] } }
    }));
    const normal = captureIo();
    const strict = captureIo();
    assert.equal(await runCli([file], normal.io), 0);
    assert.equal(await runCli(["--strict", file], strict.io), 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
