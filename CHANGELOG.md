# Changelog

All notable changes to this project are documented here.

## [0.1.1] - 2026-11-16

### Security

- Raise the `zod` runtime dependency from `^3.25.0` to `^4.6.7`, clearing npm
  audit advisories. The server already imported the `zod/v4` API, so tool
  validation and results are unchanged.

## [0.1.0] - 2026-08-23

### Added

- Local stdio MCP server consuming `avoid-ai-writing-detector@3.22.1`.
- Deterministic `score_text` and `audit_text` tools with structured output.
- Read-only, idempotent, closed-world tool annotations.
- Bounded audit findings and highlight regions with truncation counts.
