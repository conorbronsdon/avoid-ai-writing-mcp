# Releasing

Releases are published manually to npm. npm package versions are immutable, so
complete every preflight check before publishing.

## Prerequisites

- Node.js 20 or newer
- Publish access to `avoid-ai-writing-mcp` on npm
- Push access to the GitHub repository

## Preflight

1. Start from a clean, up-to-date `main` branch.
2. Set the intended version in `package.json` and `package-lock.json`.
3. Add the same version and release date to `CHANGELOG.md`.
4. Confirm that the version is not already published:

   ```bash
   npm view avoid-ai-writing-mcp@0.1.0 version
   ```

   A not-found response is expected for a new version.

5. Install and verify the exact locked dependency tree and package contents:

   ```bash
   npm ci
   npm test
   npm audit --omit=dev
   npm pack --dry-run
   ```

Review the dry-run file list before continuing. It should contain only the
runtime source and intended documentation and license files.

## Publish

Confirm the active npm identity, then publish the public package:

```bash
npm whoami
npm publish --access public
```

Verify that the registry exposes the released version and integrity metadata:

```bash
npm view avoid-ai-writing-mcp@0.1.0 version dist.integrity
```

## Tag and release

After npm verification succeeds, tag the exact published commit and create the
matching GitHub release:

```bash
git tag -a v0.1.0 -m "avoid-ai-writing-mcp 0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --title "avoid-ai-writing-mcp 0.1.0" --notes-from-tag
```

Replace `0.1.0` in these commands with the version being released. Never reuse
or move a release tag after publication.
