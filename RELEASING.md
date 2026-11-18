# Releasing

Releases publish automatically from `main` through
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), using npm
Trusted Publishing (OIDC). There is no npm token for this package, and nobody
publishes by hand. npm package versions are immutable, so complete the preflight
before merging a version bump.

## Preflight (in the release pull request)

1. Set the new version in `package.json` and `package-lock.json`.
2. Add the same version and the release date to `CHANGELOG.md`, covering
   everything that ships since the previous release.
3. Confirm that the version is not already published. A not-found response is
   expected for a new version:

   ```bash
   npm view avoid-ai-writing-mcp@X.Y.Z version
   ```

4. Install and verify the exact locked dependency tree and package contents:

   ```bash
   npm ci
   npm test
   npm audit --omit=dev
   npm pack --dry-run
   ```

   The dry-run file list should contain only the runtime source and the intended
   documentation and license files.

## What merging does

Merging a change to `package.json` on `main` runs the Publish workflow:

1. It checks whether this exact version is on npm. Only a clear `E404` counts as
   unpublished; any other npm error fails the run instead of guessing.
2. If the version is unpublished, it runs `npm ci`, `npm test` and a runtime
   dependency audit, then `npm publish --provenance --access public`.
3. It waits (up to about five minutes) for npm to serve the new version.
4. If the GitHub release `vX.Y.Z` is missing, it creates it and the tag at the
   commit on `main` that set the version in `package.json`.

## Verify

```bash
npm view avoid-ai-writing-mcp@X.Y.Z version dist.integrity
npm audit signatures            # in a project that installs it: provenance
gh release view vX.Y.Z
```

## When a run fails part-way

npm sometimes takes longer than the wait step allows to serve a version it
accepted. Do not bump the version and do not publish by hand. Once
`npm view avoid-ai-writing-mcp@X.Y.Z version` answers, re-run the workflow on
`main`:

```bash
gh workflow run publish.yml --ref main
```

Every step checks its own target first, so the re-run skips what already exists
and finishes the rest. Never reuse or move a release tag after publication.
