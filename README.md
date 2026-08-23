# avoid-ai-writing-mcp

A local, deterministic MCP server for auditing prose with the published
[`avoid-ai-writing-detector`](https://www.npmjs.com/package/avoid-ai-writing-detector).

It exposes two read-only tools:

- `score_text` returns a compact score, classification, confidence, and counts.
- `audit_text` adds a bounded set of flagged patterns, suggested alternatives,
  statistics, and highlighted sentence regions.

The server makes no network calls and uses no language model. Text stays inside
the local MCP process. Scores are heuristic writing-pattern signals, not proof
that a person or model wrote the text.

## Requirements

- Node.js 20 or newer
- An MCP host that supports local stdio servers

## Install

Add this server to Claude Code:

```bash
claude mcp add avoid-ai-writing -- npx -y avoid-ai-writing-mcp
```

Or add it to an MCP JSON configuration:

```json
{
  "mcpServers": {
    "avoid-ai-writing": {
      "command": "npx",
      "args": ["-y", "avoid-ai-writing-mcp"]
    }
  }
}
```

To run the current source directly from GitHub instead, use
`github:conorbronsdon/avoid-ai-writing-mcp` as the package spec.

The package uses stdio for protocol messages. It does not open a port or send
input to an API.

## Tool inputs

Both tools accept:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | string | yes | Text to evaluate locally (maximum 100,000 characters). |
| `context` | enum | no | `general` (default), `technical`, `marketing`, or `personal`. |

`technical` mode reduces noise from patterns that are normal in code-adjacent
writing. The other modes preserve the detector's context-specific behavior.

`audit_text` returns at most 100 issues and 100 highlighted regions. Its
`truncated` field reports how many additional items the detector produced.

## Development

```bash
npm install
npm test
npm run inspect
```

`npm run inspect` launches the official MCP Inspector against the local stdio
entry point.

## Scope

This package intentionally does not expose a rewrite tool. Rewriting requires
editorial judgment and often a hosted model; adding that would undermine this
server's deterministic, local, privacy-preserving contract.

## License

MIT
