# Releasing

Releases publish automatically from `main` through
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), using npm
Trusted Publishing (OIDC). There is no npm token for this package, and nobody
publishes by hand. The npm trusted publisher matches this repository and the
workflow filename, not the branch: until it also names a GitHub environment
restricted to `main`, anyone who can push a branch here can publish from it.

npm package versions are immutable, so complete the preflight before merging a
version bump.

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

Merging a change to `package.json` on `main` runs the Publish workflow. Its jobs
run only on `main`:

1. **check** fails if `package.json` and `package-lock.json` disagree on the
   version. It then asks npm whether this exact version is published. Only npm's
   `E404` counts as unpublished; any other error fails the run instead of guessing.
2. **verify** (only for an unpublished version) runs `npm ci`, `npm test` and a
   runtime dependency audit. It has no write permission and no OIDC token.
3. **publish** runs `npm publish --provenance --access public` without installing
   anything, then waits (up to about five minutes) for npm to serve the version.
   It is the only job that can mint the npm OIDC token.
4. **release** creates the GitHub release and tag `vX.Y.Z` if they are missing,
   at exactly the commit npm recorded as published (`gitHead`). It stops instead
   of guessing when npm errors or that commit is not on `main`, and it refuses a
   stray `vX.Y.Z` tag that points anywhere else.

GitHub keeps only the newest pending run in the `publish` concurrency group, so
after several quick version bumps, check that each version published.

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

`npm publish` and the GitHub release each check their own target first, so a
dispatch or "Re-run failed jobs" skips what already exists and finishes the rest.
Never reuse or move a release tag after publication.
