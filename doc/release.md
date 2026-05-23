# Release workflow

This repository publishes the plugin as `lark-doc` / `Lark Doc`.

## Prerequisites

- GitHub Actions must have **Read and write permissions** for repository contents.
- The repository must have a GitHub secret named `OBSIDIAN_RELEASES_TOKEN` before running the community submission workflow. Use a personal access token that can fork public repositories and open pull requests against `obsidianmd/obsidian-releases` (`public_repo` is enough for a classic token).
- The release tag must exactly match `manifest.json.version`; do not prefix tags with `v`.

## Release to GitHub

Run **Actions -> Release**.

Use the `version` input as follows:

- `current`: publish the current `manifest.json.version` without bumping metadata. Use this for the first `1.0.0` release.
- `patch`, `minor`, or `major`: bump `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, commit the metadata change, tag the new version, and create a GitHub release.
- `x.y.z`: set an explicit SemVer version greater than the current package version.

The workflow runs:

```bash
npm ci
npm run lint
npm test
npm run test:coverage
npm run build
npm run release:validate
```

Then it creates a GitHub release and uploads the Obsidian release assets:

- `main.js`
- `manifest.json`
- `styles.css`

The GitHub Release body is generated from the matching version section in `CHANGELOG.md`.

## Changelog policy

Keep pending work under `## [Unreleased]` while developing. Before running the release workflow, move those bullets into a versioned section:

```markdown
## [1.0.1] - 2026-06-01

### Added

- Added ...
```

`npm run release:validate` fails if `CHANGELOG.md` does not contain a non-empty section for `manifest.json.version`.

## Submit to the official community directory

Run **Actions -> Submit community plugin** after a GitHub release exists for the current `manifest.json.version`. The workflow verifies that release before opening the community registry PR.

The workflow:

1. Builds and validates the plugin release metadata.
2. Generates a `community-plugins.json` entry from `manifest.json`.
3. Checks out `obsidianmd/obsidian-releases`.
4. Adds the `lark-doc` entry if it is missing.
5. Pushes a branch to your fork of `obsidian-releases`.
6. Opens a pull request against `obsidianmd/obsidian-releases`.

If your `obsidian-releases` fork is owned by a different account or organization, pass that owner through the `fork_owner` workflow input.

Official review is still required. After the plugin is accepted, normal updates only need the GitHub release workflow; Obsidian installs updates from release assets tagged with the same version as `manifest.json`.

## Local commands

Prepare a metadata-only version bump:

```bash
npm run release:prepare -- patch
```

Validate the release state after building:

```bash
npm run build
npm run release:validate
```

Generate the community registry entry:

```bash
npm run release:community-entry
```
