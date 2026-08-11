import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { delimiter } from "node:path";
import { loadEnvFile } from "./env.js";
import { parseJsonc } from "./jsonc.js";

const SENSITIVE_KEY = /(api[-_]?key|access[-_]?key|auth|bearer|credential|password|private[-_]?key|secret|token)/iu;
const KNOWN_SECRET = /(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})/u;
const VARIABLE_TOKEN = /(?:\$\{[^}]+\}|\$env:[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%|<[^>]+>|\{\{[^}]+\}\})/giu;
const HAS_VARIABLE_TOKEN = /(?:\$\{[^}]+\}|\$env:[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%|<[^>]+>|\{\{[^}]+\}\})/iu;
const PLACEHOLDER_VALUE = /^(?:x{4,}|your[-_ ]|replace[-_ ]with|example|changeme|placeholder)/iu;
const ENV_REFERENCE = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/gu;
const RESERVED_VARIABLES = new Set(["workspaceFolder", "workspaceFolderBasename", "userHome", "pathSeparator"]);

function diagnostic(file, rule, severity, message, jsonPath = "$", server) {
  return { file, rule, severity, message, path: jsonPath, ...(server ? { server } : {}) };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTemplate(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (PLACEHOLDER_VALUE.test(trimmed)) {
    return true;
  }
  const withoutVariables = trimmed
    .replace(VARIABLE_TOKEN, "")
    .replace(/^(?:Bearer|Basic)\s*$/iu, "")
    .trim();
  return withoutVariables.length === 0 && HAS_VARIABLE_TOKEN.test(trimmed);
}

function mayBeLiteralSecret(key, value) {
  if (typeof value !== "string" || value.trim().length < 8 || isTemplate(value)) {
    return false;
  }
  return SENSITIVE_KEY.test(key) || KNOWN_SECRET.test(value);
}

function workspaceDirectory(configPath) {
  const directory = path.dirname(configPath);
  return path.basename(directory).toLowerCase() === ".vscode" ? path.dirname(directory) : directory;
}

function replaceWorkspaceVariables(value, workspace) {
  return value.replaceAll("${workspaceFolder}", workspace);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command, configPath) {
  const workspace = workspaceDirectory(configPath);
  const expanded = replaceWorkspaceVariables(command, workspace);
  if (/\$\{|%[A-Za-z_]/u.test(expanded)) {
    return true;
  }

  if (path.isAbsolute(expanded) || expanded.includes("/") || expanded.includes("\\")) {
    const candidate = path.isAbsolute(expanded) ? expanded : path.resolve(workspace, expanded);
    return exists(candidate);
  }

  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      if (await exists(path.join(directory, command + extension.toLowerCase())) ||
          await exists(path.join(directory, command + extension.toUpperCase()))) {
        return true;
      }
    }
  }
  return false;
}

function packageIsPinned(packageName) {
  if (packageName.startsWith("@")) {
    return packageName.lastIndexOf("@") > 0;
  }
  return packageName.includes("@");
}

function findNpxPackage(args) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--package" || value === "-p") {
      return args[index + 1];
    }
    if (!value.startsWith("-")) {
      return value;
    }
  }
  return undefined;
}

function collectSecretDiagnostics(value, file, basePath, server, output, visited = new Set()) {
  if (!isObject(value) && !Array.isArray(value)) {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ? `${basePath}[${key}]` : `${basePath}.${key}`;
    if (mayBeLiteralSecret(key, child)) {
      output.push(diagnostic(
        file,
        "MCP101",
        "error",
        "Possible hard-coded secret. Use an environment or input variable instead; the value was redacted.",
        childPath,
        server
      ));
    } else if (typeof child === "string" && KNOWN_SECRET.test(child) && !isTemplate(child)) {
      output.push(diagnostic(
        file,
        "MCP101",
        "error",
        "Possible hard-coded credential detected; the value was redacted.",
        childPath,
        server
      ));
    }
    collectSecretDiagnostics(child, file, childPath, server, output, visited);
  }
}

function collectEnvironmentReferences(value, basePath, output, visited = new Set()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(ENV_REFERENCE)) {
      if (!RESERVED_VARIABLES.has(match[1]) && !match[0].startsWith("${input:")) {
        output.push({ name: match[1], path: basePath });
      }
    }
    return;
  }
  if (!isObject(value) && !Array.isArray(value)) {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ? `${basePath}[${key}]` : `${basePath}.${key}`;
    collectEnvironmentReferences(child, childPath, output, visited);
  }
}

async function environmentForServer(server, configPath, diagnostics, jsonPath, serverName) {
  const environment = { ...process.env };
  if (!server.envFile || typeof server.envFile !== "string") {
    return environment;
  }
  const workspace = workspaceDirectory(configPath);
  const expanded = replaceWorkspaceVariables(server.envFile, workspace);
  if (/\$\{/u.test(expanded)) {
    return environment;
  }
  const envPath = path.isAbsolute(expanded) ? expanded : path.resolve(workspace, expanded);
  const fileValues = await loadEnvFile(envPath);
  if (fileValues === null) {
    diagnostics.push(diagnostic(
      configPath,
      "MCP106",
      "warning",
      `Environment file does not exist: ${path.relative(workspace, envPath) || path.basename(envPath)}`,
      `${jsonPath}.envFile`,
      serverName
    ));
    return environment;
  }
  return { ...environment, ...fileValues };
}

async function auditServer(file, serverName, server, containerPath, options, output) {
  const jsonPath = `${containerPath}.${serverName}`;
  if (!serverName.trim()) {
    output.push(diagnostic(file, "MCP107", "warning", "Server name is empty.", jsonPath));
  }
  if (!isObject(server)) {
    output.push(diagnostic(file, "MCP003", "error", "Server configuration must be an object.", jsonPath, serverName));
    return;
  }

  const hasCommand = typeof server.command === "string" && server.command.trim().length > 0;
  const hasUrl = typeof server.url === "string" && server.url.trim().length > 0;
  if (!hasCommand && !hasUrl) {
    output.push(diagnostic(file, "MCP004", "error", "Server must define either a command or a URL.", jsonPath, serverName));
  }
  if (hasCommand && hasUrl) {
    output.push(diagnostic(file, "MCP005", "warning", "Server defines both command and URL; keep only the active transport.", jsonPath, serverName));
  }
  if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((item) => typeof item !== "string"))) {
    output.push(diagnostic(file, "MCP005", "error", "args must be an array of strings.", `${jsonPath}.args`, serverName));
  }
  if (server.env !== undefined && !isObject(server.env)) {
    output.push(diagnostic(file, "MCP005", "error", "env must be an object.", `${jsonPath}.env`, serverName));
  }
  if (server.headers !== undefined && !isObject(server.headers)) {
    output.push(diagnostic(file, "MCP005", "error", "headers must be an object.", `${jsonPath}.headers`, serverName));
  }

  if (hasUrl && !HAS_VARIABLE_TOKEN.test(server.url)) {
    try {
      const url = new URL(server.url);
      if (!new Set(["http:", "https:"]).has(url.protocol)) {
        output.push(diagnostic(file, "MCP108", "error", "Remote server URL must use http or https.", `${jsonPath}.url`, serverName));
      }
      const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
      if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
        output.push(diagnostic(file, "MCP103", "warning", "Remote MCP traffic uses unencrypted HTTP.", `${jsonPath}.url`, serverName));
      }
      if (url.username || url.password) {
        output.push(diagnostic(file, "MCP101", "error", "URL contains hard-coded credentials; the value was redacted.", `${jsonPath}.url`, serverName));
      }
      for (const key of url.searchParams.keys()) {
        if (SENSITIVE_KEY.test(key) && !isTemplate(url.searchParams.get(key))) {
          output.push(diagnostic(file, "MCP101", "error", "URL query contains a possible hard-coded secret; the value was redacted.", `${jsonPath}.url`, serverName));
          break;
        }
      }
    } catch {
      output.push(diagnostic(file, "MCP108", "error", "Server URL is invalid.", `${jsonPath}.url`, serverName));
    }
  }

  if (hasCommand && options.checkCommand && !(await commandExists(server.command, file))) {
    output.push(diagnostic(file, "MCP104", "warning", "Command was not found on PATH or relative to the workspace.", `${jsonPath}.command`, serverName));
  }

  if (!options.allowUnpinned && hasCommand && path.basename(server.command).toLowerCase().replace(/\.(cmd|exe)$/u, "") === "npx" && Array.isArray(server.args)) {
    const packageName = findNpxPackage(server.args);
    if (packageName && !packageIsPinned(packageName)) {
      output.push(diagnostic(file, "MCP105", "warning", `npx package ${packageName} is not pinned to a version.`, `${jsonPath}.args`, serverName));
    }
  }

  collectSecretDiagnostics(server, file, jsonPath, serverName, output);
  const availableEnvironment = await environmentForServer(server, file, output, jsonPath, serverName);
  const references = [];
  collectEnvironmentReferences(server, jsonPath, references);
  for (const reference of references) {
    if (!(reference.name in availableEnvironment)) {
      output.push(diagnostic(file, "MCP102", "warning", `Environment variable ${reference.name} is referenced but not set.`, reference.path, serverName));
    }
  }
}

export async function auditConfigFile(file, options = {}) {
  const effectiveOptions = { checkCommand: false, allowUnpinned: false, ...options };
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    return [diagnostic(file, "MCP001", "error", `Cannot read file: ${error.message}`)];
  }

  const parsed = parseJsonc(source);
  if (parsed.error) {
    const location = parsed.line ? ` at line ${parsed.line}, column ${parsed.column}` : "";
    return [diagnostic(file, "MCP001", "error", `Invalid JSON${location}: ${parsed.error.message}`)];
  }
  if (!isObject(parsed.value)) {
    return [diagnostic(file, "MCP002", "error", "Top-level configuration must be an object.")];
  }

  const containers = ["servers", "mcpServers"].filter((key) => key in parsed.value);
  if (containers.length === 0) {
    return [diagnostic(file, "MCP002", "error", "Expected a top-level servers or mcpServers object.")];
  }

  const output = [];
  for (const containerName of containers) {
    const container = parsed.value[containerName];
    if (!isObject(container)) {
      output.push(diagnostic(file, "MCP002", "error", `${containerName} must be an object.`, `$.${containerName}`));
      continue;
    }
    for (const [serverName, server] of Object.entries(container)) {
      await auditServer(file, serverName, server, `$.${containerName}`, effectiveOptions, output);
    }
  }

  const seen = new Set();
  return output.filter((item) => {
    const key = `${item.rule}\u0000${item.path}\u0000${item.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function auditConfigFiles(files, options = {}) {
  const diagnostics = [];
  for (const file of files) {
    diagnostics.push(...await auditConfigFile(file, options));
  }
  return diagnostics;
}
