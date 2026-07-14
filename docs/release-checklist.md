# Mac Release Checklist

OpenFolio currently ships the macOS app from `apps/mac` through GitHub Releases.

## Before tagging

- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `pnpm audit --audit-level moderate` or `pnpm qa` for the combined local
  quality gate.
- Run `pnpm build`.
- Run `pnpm --filter @openfolio/mac dist:mac`.
- Run `codesign --verify --deep --strict --verbose=1 apps/mac/dist/mac-arm64/OpenFolio.app`.
- Complete the first-run QA pass in `docs/qa-checklist.md`.
- Run `pnpm bench:search` after `pnpm build` when search or indexing code changes.
- Inspect the packaged artifact with `pnpm --filter @openfolio/mac verify:artifact`.
- Confirm the bundled model manifest, hashes, license files, and offline smoke
  test pass without a network fallback.
- Capture PID-attributed network traffic for the signed/notarized app and every
  bundled helper. The release gate is zero outbound requests, not merely zero
  requests to OpenFolio servers.
- Confirm any schema change has an in-place migration, a pre-migration backup,
  and a forward-version refusal test. The app must not reset local user data as
  an update strategy.

## Version rules

- Keep `apps/mac/package.json` in sync with the `v*` release tag.
- Root `package.json` is the monorepo version and is not used by the macOS app.
- Do not tag a release until the packaged app version and release tag match.

## Current signing state

- Local `dist:mac` signing works with the configured Developer ID certificate.
- Notarization is not configured yet; electron-builder reports that notarize
  options cannot be generated.
- Public release work should either configure notarization credentials or state
  clearly that the build is signed but not notarized.

## Updating an installation

OpenFolio does not check for or download updates. Download the new release,
quit OpenFolio, and replace the app in `/Applications`. The local library stays
in `~/Library/Application Support/OpenFolio`; replacing the app does not replace
or upload that data. Back up that folder before changing versions.
