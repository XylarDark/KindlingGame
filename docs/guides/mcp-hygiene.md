# MCP configuration hygiene

An MCP server entry is a command your agent will execute with your credentials. Treat changes to
it the way you would treat changes to a deployment pipeline, not the way you would treat an
editor preference.

Two Cursor vulnerabilities landed in exactly this file, and both are worth understanding because
they explain the rules below rather than just asserting them:

- **CVE-2025-54135 ("CurXecute").** A prompt injection delivered through tool output caused the
  agent to rewrite `mcp.json`, which achieved code execution on the next server start. The
  attacker never touched the machine directly; the agent did the writing.
- **CVE-2025-54136 ("MCPoison").** Approval was bound to a server's *name* rather than its
  contents. Once a server was approved, its `command` and `args` could be swapped for anything
  and it stayed approved.

The common thread: the danger is in the contents, and the contents can change after review.

## Where the configuration lives

Cursor reads two paths, and no others:

| Path                  | Scope                                     |
| --------------------- | ----------------------------------------- |
| `.cursor/mcp.json`    | This project                              |
| `~/.cursor/mcp.json`  | Every project, for this user              |

A `.mcp.json` at the repository root is **Claude Code's** convention, not Cursor's. If you support
both tools, maintain both files deliberately rather than assuming one is read by the other.

Start from [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example). The real
`.cursor/mcp.json` is gitignored.

## Never write a secret in the file

Reference the environment instead. Cursor resolves `${env:NAME}` in `command`, `args`, `env`,
`url`, `headers`, and `auth` values:

```json
{
  "mcpServers": {
    "example": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
      "env": { "EXAMPLE_API_KEY": "${env:EXAMPLE_API_KEY}" }
    }
  }
}
```

The syntax differs by tool, and using the wrong one fails in the worst possible way — the
placeholder is passed through as a literal string, so the server receives the text `${API_KEY}` as
its credential and the error surfaces somewhere far from the cause:

| Tool        | Syntax                            |
| ----------- | --------------------------------- |
| Cursor      | `${env:NAME}`                     |
| Claude Code | `${NAME}`, or `${NAME:-default}`  |

Cursor also resolves `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`,
`${pathSeparator}`, and `${/}`.

`npm run doctor` reports an inline secret in an MCP config as a gap.

## Review a server before adding it

Answer these before the first run, not after:

1. **What is the command?** Read `command` and `args` literally. `npx -y <package>` downloads and
   executes whatever that package name currently resolves to.
2. **Who publishes it?** Prefer first-party servers. For a third party, pin a version rather than
   floating on `latest`, so the thing you reviewed is the thing that runs.
3. **What can it reach?** A server with filesystem or network access extends the agent's reach to
   everything that server can touch.
4. **Which credentials does it get?** Give it a scoped token, not a personal one with broad
   permissions.

## Review changes to the file as code

Because approval historically did not track contents, and because agents can be induced to edit
this file:

- Put `.cursor/mcp.json` changes through the same review as a source change. Read the diff.
- Be suspicious of any edit to this file you did not initiate. An agent proposing a new MCP server
  unprompted is the documented attack shape, not a helpful suggestion.
- Re-read the entry after upgrading a server. A version bump can change `command` and `args`.
- Remove servers you no longer use. Dormant entries are unreviewed attack surface.

## Related

- [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example) — the template to copy
- [`.cursor/hooks/secret-scan.cjs`](../../.cursor/hooks/secret-scan.cjs) — blocks reads of secret
  files and commands that would exfiltrate credentials
- [`AGENTS.md`](../../AGENTS.md) — the security baseline this guide expands on
