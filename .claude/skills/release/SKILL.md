---
name: release
description: Cut a release: run the gates, bump the version, write the changelog entry, commit and tag. Use when the user says release, ship, bump or tag.
disable-model-invocation: true
---

# Release

Versions follow semver; while the app is `0.x`, a feature raises the middle number and a fix the last (see the top of `CHANGELOG.md`).

1. `git status` must be clean apart from the release. If not, stop and say what is dirty.
2. Run the `verify-app` skill. `pnpm lint`, `pnpm test` and `pnpm build` must all exit 0. Do not continue on a failure.
3. Run `pnpm audit`. A high finding in a runtime dependency blocks the release; a dev-only one with no patch is noted in the changelog.
4. Decide the bump from `git log <last tag>..HEAD`: any `feat:` → minor, only `fix:`/`docs:`/`chore:` → patch.
5. Edit `package.json` `version`, and add a section at the top of `CHANGELOG.md`: `## X.Y.Z — YYYY-MM-DD` followed by user-facing bullets (what changed for the person using the app, not file names).
6. Commit `chore: release X.Y.Z`, then `git tag vX.Y.Z`. Do not push unless the user asked.
7. Report the version, the tag and the three gate results.
