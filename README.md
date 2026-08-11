# mcp-config-audit

![mcp-config-audit — Catch risky MCP configs before they run](docs/social-preview.png)

[![npm version](https://img.shields.io/npm/v/mcp-config-audit?color=2ea44f)](https://www.npmjs.com/package/mcp-config-audit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-config-audit)](https://www.npmjs.com/package/mcp-config-audit)
[![CI](https://github.com/Lucky-777-glitch/mcp-config-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/Lucky-777-glitch/mcp-config-audit/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-config-audit)](LICENSE)

**Catch risky MCP configuration before it reaches an AI agent.**

`mcp-config-audit` is a zero-dependency CLI that statically checks MCP server configuration files for exposed secrets, insecure endpoints, missing environment variables, and unpinned packages. It never starts a configured server and never uploads configuration content.

```sh
npx mcp-config-audit@latest
```

## Why use it?

- **Safe by design:** commands and MCP servers are never executed.
- **Useful findings:** catches common security and reliability mistakes with precise file paths.
- **Secret-safe output:** detected credential values are always redacted.
- **CI-friendly:** strict mode, stable exit codes, JSON, and SARIF output.
- **Easy to adopt:** no install, config file, or runtime dependency required.

It recognizes both common top-level formats:

- VS Code-style `servers` in `mcp.json`
- `mcpServers` in `.mcp.json` and `claude_desktop_config.json`

## What it catches

- possible hard-coded API keys, tokens, passwords, and credentials
- invalid JSON/JSONC and malformed server entries
- missing commands or remote URLs
- missing referenced environment variables and `.env` files
- unencrypted remote HTTP endpoints
- unpinned packages launched through `npx`
- local commands that cannot be found (optional)

## Quick start

Scan the current directory for supported configuration files:

```sh
npx mcp-config-audit@latest
```

Audit specific files or directories:

```sh
npx mcp-config-audit@latest .vscode/mcp.json ~/.config/my-agent
```

Use strict mode in CI:

```sh
npx mcp-config-audit@latest --strict --require-config .
```

Generate machine-readable output:

```sh
npx mcp-config-audit@latest --json .
npx mcp-config-audit@latest --sarif . > mcp-config-audit.sarif
```

## Example

Given this configuration:

```json
{
  "servers": {
    "example": {
      "command": "npx",
      "args": ["-y", "example-mcp-server"],
      "env": {
        "API_KEY": "replace-with-a-real-key"
      }
    }
  }
}
```

the CLI reports the possible secret and the unpinned package, but never echoes the secret value:

```text
.vscode/mcp.json $.servers.example.env.API_KEY ERROR MCP101 Possible hard-coded secret. Use an environment or input variable instead; the value was redacted.
.vscode/mcp.json $.servers.example.args WARNING MCP105 npx package example-mcp-server is not pinned to a version.
1 error(s), 1 warning(s)
```

Use an environment/input reference and pin the package version:

```json
{
  "servers": {
    "example": {
      "command": "npx",
      "args": ["-y", "example-mcp-server@1.2.3"],
      "env": {
        "API_KEY": "${env:EXAMPLE_API_KEY}"
      }
    }
  }
}
```

## GitHub Actions

Add MCP configuration auditing to every push and pull request:

```yaml
name: Audit MCP configuration

on: [push, pull_request]

permissions:
  contents: read

jobs:
  audit-mcp-config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npx --yes mcp-config-audit@latest --strict --require-config .
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No errors (and no warnings with `--strict`) |
| `1` | Audit findings fail the selected policy |
| `2` | Invalid CLI usage, missing explicit path, or no config with `--require-config` |

## Rules

| Rule | Default severity | Description |
| --- | --- | --- |
| `MCP001` | Error | Configuration cannot be parsed or read |
| `MCP002` | Error | Invalid top-level configuration |
| `MCP003` | Error | Invalid server entry |
| `MCP004` | Error | Missing command or URL |
| `MCP005` | Error/Warning | Invalid or conflicting field |
| `MCP101` | Error | Possible hard-coded secret |
| `MCP102` | Warning | Referenced environment variable is missing |
| `MCP103` | Warning | Remote endpoint uses HTTP |
| `MCP104` | Warning | Command is not found (`--check-command`) |
| `MCP105` | Warning | `npx` package is not version-pinned |
| `MCP106` | Warning | Referenced environment file is missing |
| `MCP107` | Warning | Empty server name |
| `MCP108` | Error | Invalid remote URL |

Ignore an accepted finding with `--ignore MCP105`. Repeat `--ignore` for multiple rules.

## Scope and limitations

This is a defensive static checker, not a guarantee that a server is safe. Review the publisher and source of every MCP server before running it, limit its permissions, and keep secrets outside committed configuration files.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the test commands and project constraints. Please report vulnerabilities through GitHub's private security reporting flow as described in [SECURITY.md](SECURITY.md).

## License

MIT

