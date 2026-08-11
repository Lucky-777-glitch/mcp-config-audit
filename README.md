# mcp-config-audit

`mcp-config-audit` is a zero-dependency CLI that checks MCP server configuration files for common security and reliability problems—without starting any configured server.

It recognizes both common top-level formats:

- VS Code-style `servers` in `mcp.json`
- `mcpServers` in `.mcp.json` and `claude_desktop_config.json`

## What it catches

- possible hard-coded API keys, tokens, passwords, and credentials (values are never printed)
- invalid JSON/JSONC and malformed server entries
- missing commands or remote URLs
- missing referenced environment variables and `.env` files
- unencrypted remote HTTP endpoints
- unpinned packages launched through `npx`
- local commands that cannot be found (optional)

The checks are static. The tool never executes a command, connects to an MCP endpoint, or uploads configuration content.

## Quick start

```sh
npx mcp-config-audit@latest
```

By default, the CLI scans the current directory for `mcp.json`, `.mcp.json`, and `claude_desktop_config.json`, while skipping dependency and build directories.

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

the CLI reports the location of the possible secret and the unpinned package, but never echoes the secret value:

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

## License

MIT
