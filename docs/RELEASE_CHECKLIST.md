# Release Checklist

## Pre-release

- Ensure `npm run build` passes.
- Ensure `npm test` passes.
- Confirm `PROJECT_PLAN.md` status is up to date.
- Confirm `openclaw.plugin.json` version and `package.json` version match.
- Confirm plugin config schema changes are documented.

## Versioning

Use semantic versioning:

- `MAJOR`: breaking tool/config/schema changes.
- `MINOR`: backward-compatible feature additions.
- `PATCH`: fixes and non-breaking improvements.

## Publish Dry Run

- Run `npm pack` and inspect archive contents.
- Validate package includes:
  - `index.ts`
  - `openclaw.plugin.json`
  - `skills/`
  - runtime `src/` files

## Publish

- Tag release in git (`vX.Y.Z`).
- Publish package (`npm publish --access public`) when ready.
- Verify install flow with:
  - `openclaw plugins install <npm-spec>`
  - `openclaw plugins enable openclaw-iota-wallet`
  - `openclaw plugins doctor`
  - Confirm postinstall wallet bootstrap behavior (`mainnet` env + first address creation when keystore is empty)

## Post-release

- Record release notes.
- Pin plugin version in deployment configs.
- Monitor early adopter issues.
