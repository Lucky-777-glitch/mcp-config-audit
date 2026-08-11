import path from "node:path";

export function summarize(diagnostics) {
  return diagnostics.reduce((summary, item) => {
    summary[item.severity] = (summary[item.severity] ?? 0) + 1;
    return summary;
  }, { error: 0, warning: 0 });
}

export function formatText(diagnostics, cwd = process.cwd()) {
  const lines = diagnostics.map((item) => {
    const file = path.relative(cwd, item.file) || path.basename(item.file);
    return `${file} ${item.path} ${item.severity.toUpperCase()} ${item.rule} ${item.message}`;
  });
  const summary = summarize(diagnostics);
  lines.push(`${summary.error} error(s), ${summary.warning} warning(s)`);
  return lines.join("\n");
}

export function formatJson(diagnostics, files) {
  return JSON.stringify({ files, summary: summarize(diagnostics), diagnostics }, null, 2);
}

const RULES = {
  MCP001: "Configuration cannot be parsed or read",
  MCP002: "Invalid MCP configuration root",
  MCP003: "Invalid server entry",
  MCP004: "Missing server transport",
  MCP005: "Invalid or conflicting server field",
  MCP101: "Possible hard-coded secret",
  MCP102: "Missing environment variable",
  MCP103: "Unencrypted remote transport",
  MCP104: "Command not found",
  MCP105: "Unpinned npx package",
  MCP106: "Missing environment file",
  MCP107: "Empty server name",
  MCP108: "Invalid remote URL"
};

export function formatSarif(diagnostics) {
  const rules = [...new Set(diagnostics.map((item) => item.rule))].map((rule) => ({
    id: rule,
    shortDescription: { text: RULES[rule] ?? rule }
  }));
  const results = diagnostics.map((item) => ({
    ruleId: item.rule,
    level: item.severity === "error" ? "error" : "warning",
    message: { text: `${item.path}: ${item.message}` },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: item.file.replaceAll("\\", "/") }
      }
    }]
  }));
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{ tool: { driver: { name: "mcp-config-audit", rules } }, results }]
  }, null, 2);
}
