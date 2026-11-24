# Changelog

All notable changes to this project are documented here.

## [0.1.2] - 2026-11-24

### Security

- Pin `avoid-ai-writing-detector` 3.39.1 (was 3.22.1). It fixes the quadratic
  line-start whitespace scan behind #15: `"w ".repeat(10)` followed by 99,000
  U+2028 characters, within the 100,000-character input limit, blocked the
  server for about 28 seconds and now takes under 100 ms. A test covers
  U+2028, U+2029, `\n`, `\r` and `" \n"` runs at that size.

### Changed

- Scores and findings follow the detector's 3.23 to 3.39 rule changes. In
  `technical` context, words that are normal in code-adjacent prose (for
  example "robust", "ecosystem", "comprehensive") are no longer flagged, and
  names such as `constructor` or `__proto__` are no longer findings.

## [0.1.1] - 2026-11-17

### Security

- Raise the `zod` runtime dependency from `^3.25.0` to `^4.6.7`, clearing the
  high-severity advisory GHSA-mrhx-c7xc-m3w5 (memory exhaustion while
  validating oversized constrained collections, zod `< 4.6.6`). The server
  already imported the `zod/v4` API, so tool validation and results are
  unchanged.

### Fixed

- `audit_text` no longer fails its own output schema when the text contains a
  token such as `constructor` or `__proto__`. The pinned detector resolves
  those to `Object.prototype` members; a non-string suggestion is now
  reported as `null`.

### Documentation

- The README says which detector version each release pins.

## [0.1.0] - 2026-08-23

### Added

- Local stdio MCP server consuming `avoid-ai-writing-detector@3.22.1`.
- Deterministic `score_text` and `audit_text` tools with structured output.
- Read-only, idempotent, closed-world tool annotations.
- Bounded audit findings and highlight regions with truncation counts.
