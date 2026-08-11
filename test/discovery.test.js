import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverConfigFiles } from "../src/discovery.js";

test("discovers known config names and skips dependency directories", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mcp-discovery-"));
  try {
    await mkdir(path.join(directory, ".vscode"));
    await mkdir(path.join(directory, "node_modules", "ignored"), { recursive: true });
    await writeFile(path.join(directory, ".vscode", "mcp.json"), "{}");
    await writeFile(path.join(directory, ".mcp.json"), "{}");
    await writeFile(path.join(directory, "node_modules", "ignored", "mcp.json"), "{}");
    const files = await discoverConfigFiles([directory]);
    assert.equal(files.length, 2);
    assert.equal(files.some((file) => file.includes("node_modules")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
