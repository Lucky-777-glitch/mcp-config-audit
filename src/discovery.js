import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const CONFIG_NAMES = new Set(["mcp.json", ".mcp.json", "claude_desktop_config.json"]);
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor"
]);

function isConfigFile(filePath) {
  return CONFIG_NAMES.has(path.basename(filePath).toLowerCase());
}

async function walk(directory, results) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name.toLowerCase())) {
        await walk(entryPath, results);
      }
    } else if (entry.isFile() && isConfigFile(entryPath)) {
      results.add(path.resolve(entryPath));
    }
  }
}

export async function discoverConfigFiles(inputs = [], cwd = process.cwd()) {
  const targets = inputs.length > 0 ? inputs : [cwd];
  const results = new Set();

  for (const target of targets) {
    const absolute = path.resolve(cwd, target);
    let targetStat;
    try {
      targetStat = await stat(absolute);
    } catch (error) {
      if (inputs.length > 0) {
        throw new Error(`Path does not exist: ${absolute}`, { cause: error });
      }
      continue;
    }

    if (targetStat.isDirectory()) {
      await walk(absolute, results);
    } else if (targetStat.isFile()) {
      results.add(absolute);
    }
  }

  return [...results].sort((left, right) => left.localeCompare(right));
}
