# Security policy

Please do not open a public issue for a vulnerability that could expose secrets or execute untrusted code. Report it privately through GitHub's **Security → Report a vulnerability** flow.

`mcp-config-audit` reads configuration files but never starts an MCP server. Diagnostics must never include a detected credential value. A report that demonstrates credential disclosure in console, JSON, or SARIF output is security-sensitive.
