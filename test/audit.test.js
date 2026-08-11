import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditConfigFile } from "../src/audit.js";

async function withConfig(value, callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mcp-audit-"));
  const file = path.join(directory, "mcp.json");
  await writeFile(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  try {
    return await callback(file, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("detects a hard-coded secret without including it in diagnostics", async () => {
  const secret = "sk-this-value-must-never-be-printed";
  await withConfig({
    servers: { demo: { command: "node", env: { API_KEY: secret } } }
  }, async (file) => {
    const diagnostics = await auditConfigFile(file);
    assert.ok(diagnostics.some((item) => item.rule === "MCP101" && item.severity === "error"));
    assert.equal(JSON.stringify(diagnostics).includes(secret), false);
  });
});

test("accepts variable and input placeholders as secret values", async () => {
  await withConfig({
    servers: {
      demo: {
        command: "node",
        env: {
          API_KEY: "${env:TEST_MCP_AUDIT_KEY}",
          ACCESS_TOKEN: "${input:token}"
        },
        headers: { Authorization: "Bearer ${env:TEST_MCP_AUDIT_KEY}" }
      }
    }
  }, async (file) => {
    const diagnostics = await auditConfigFile(file);
    assert.equal(diagnostics.some((item) => item.rule === "MCP101"), false);
    assert.ok(diagnostics.some((item) => item.rule === "MCP102" && item.message.includes("TEST_MCP_AUDIT_KEY")));
    assert.equal(diagnostics.some((item) => item.message.includes("input")), false);
  });
});

test("accepts a URL supplied entirely by an environment variable", async () => {
  await withConfig({
    servers: { remote: { type: "http", url: "${env:TEST_MCP_AUDIT_URL}" } }
  }, async (file) => {
    const diagnostics = await auditConfigFile(file);
    assert.equal(diagnostics.some((item) => item.rule === "MCP108"), false);
    assert.ok(diagnostics.some((item) => item.rule === "MCP102"));
  });
});

test("loads variables from envFile", async () => {
  await withConfig({
    servers: {
      demo: {
        command: "node",
        envFile: "./test.env",
        env: { API_KEY: "${env:MCP_AUDIT_FROM_FILE}" }
      }
    }
  }, async (file, directory) => {
    await writeFile(path.join(directory, "test.env"), "MCP_AUDIT_FROM_FILE=present\n");
    const diagnostics = await auditConfigFile(file);
    assert.equal(diagnostics.some((item) => item.rule === "MCP102"), false);
    assert.equal(diagnostics.some((item) => item.rule === "MCP106"), false);
  });
});

test("warns for an unpinned npx package but not a pinned package", async () => {
  await withConfig({
    mcpServers: {
      unpinned: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
      pinned: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory@1.2.3"] }
    }
  }, async (file) => {
    const diagnostics = await auditConfigFile(file);
    const unpinned = diagnostics.filter((item) => item.rule === "MCP105");
    assert.equal(unpinned.length, 1);
    assert.equal(unpinned[0].server, "unpinned");
  });
});

test("rejects malformed server fields", async () => {
  await withConfig({
    servers: {
      broken: { args: "--bad", env: [], headers: "bad" }
    }
  }, async (file) => {
    const diagnostics = await auditConfigFile(file);
    assert.ok(diagnostics.some((item) => item.rule === "MCP004"));
    assert.equal(diagnostics.filter((item) => item.rule === "MCP005").length, 3);
  });
});

test("allows loopback HTTP and warns for remote HTTP", async () => {
  await withConfig({
    servers: {
      local: { type: "http", url: "http://127.0.0.1:3000/mcp" },
      remote: { type: "http", url: "http://example.com/mcp" }
    }
  }, async (file) => {
    const diagnostics = await auditConfigFile(file);
    const insecure = diagnostics.filter((item) => item.rule === "MCP103");
    assert.equal(insecure.length, 1);
    assert.equal(insecure[0].server, "remote");
  });
});
