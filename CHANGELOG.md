# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-11

### Added

- Zero-dependency CLI for statically auditing MCP server configuration files.
- Support for `servers` and `mcpServers` configuration formats.
- JSON, JSONC, text, JSON, and SARIF reporting.
- Checks for hard-coded secrets, missing environment variables and files,
  insecure HTTP endpoints, invalid URLs, missing commands, and unpinned `npx`
  packages.
- Automatic discovery of common MCP configuration filenames.
- Node.js test suite and GitHub Actions CI across Node.js 20, 22, and 24.

[0.1.0]: https://github.com/Lucky-777-glitch/mcp-config-audit/releases/tag/v0.1.0
