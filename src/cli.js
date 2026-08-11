import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditConfigFiles } from "./audit.js";
import { discoverConfigFiles } from "./discovery.js";
import { formatJson, formatSarif, formatText, summarize } from "./format.js";

const HELP = `mcp-config-audit [options] [file-or-directory ...]

Audit MCP configuration files without executing any configured server.

Options:
  --json                 Output machine-readable JSON
  --sarif                Output SARIF 2.1.0 for code scanning
  --strict               Treat warnings as failures
  --check-command        Check whether local commands exist
  --allow-unpinned       Do not warn about unpinned npx packages
  --ignore RULE          Ignore a rule (repeatable)
  --require-config       Fail when no configuration file is found
  -h, --help             Show help
  -v, --version          Show version

Recognized files: mcp.json, .mcp.json, claude_desktop_config.json`;

function parseArguments(args) {
  const options = {
    format: "text",
    strict: false,
    checkCommand: false,
    allowUnpinned: false,
    requireConfig: false,
    ignoredRules: new Set(),
    paths: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.format = "json";
    else if (arg === "--sarif") options.format = "sarif";
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--check-command") options.checkCommand = true;
    else if (arg === "--allow-unpinned") options.allowUnpinned = true;
    else if (arg === "--require-config") options.requireConfig = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-v" || arg === "--version") options.version = true;
    else if (arg === "--ignore") {
      const rule = args[index + 1];
      if (!rule) throw new Error("--ignore requires a rule ID");
      options.ignoredRules.add(rule.toUpperCase());
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }
  return options;
}

async function packageVersion() {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const packagePath = path.join(currentDirectory, "..", "package.json");
  return JSON.parse(await readFile(packagePath, "utf8")).version;
}

export async function runCli(args, io = console) {
  let options;
  try {
    options = parseArguments(args);
  } catch (error) {
    io.error(error.message);
    io.error("Run with --help for usage.");
    return 2;
  }

  if (options.help) {
    io.log(HELP);
    return 0;
  }
  if (options.version) {
    io.log(await packageVersion());
    return 0;
  }

  let files;
  try {
    files = await discoverConfigFiles(options.paths);
  } catch (error) {
    io.error(error.message);
    return 2;
  }
  if (files.length === 0) {
    const message = "No MCP configuration files found.";
    if (options.format === "json") io.log(JSON.stringify({ files: [], summary: { error: 0, warning: 0 }, diagnostics: [], message }, null, 2));
    else if (options.format === "sarif") io.log(formatSarif([]));
    else io.log(message);
    return options.requireConfig ? 2 : 0;
  }

  const diagnostics = (await auditConfigFiles(files, options))
    .filter((item) => !options.ignoredRules.has(item.rule));
  if (options.format === "json") io.log(formatJson(diagnostics, files));
  else if (options.format === "sarif") io.log(formatSarif(diagnostics));
  else io.log(formatText(diagnostics));

  const summary = summarize(diagnostics);
  return summary.error > 0 || (options.strict && summary.warning > 0) ? 1 : 0;
}
