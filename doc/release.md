# Release workflow

This repository publishes the plugin as `lark-doc` / `Lark Wiki`.

## Prerequisites

- GitHub Actions must have **Read and write permissions** for repository contents.
- GitHub Actions must allow artifact attestations. The release workflow grants `id-token: write` and `attestations: write` for this.
- The repository must be public before it is submitted to the Obsidian Community directory.
- The release tag must exactly match `manifest.json.version`; do not prefix tags with `v`.
- `manifest.json` must not include `Obsidian` in `id`, `name`, or `description`; the directory context already implies that.

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

Before the release is created, the workflow generates GitHub artifact attestations for those assets with `actions/attest`. You can verify a downloaded asset with:

```bash
gh attestation verify main.js --repo OneeMe/obsidian-lark-doc
gh attestation verify styles.css --repo OneeMe/obsidian-lark-doc
```

The runtime plugin code intentionally does not probe the filesystem for `lark-cli`. Users should configure an absolute `Lark CLI path` if the desktop app cannot resolve `lark-cli` from its PATH.

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

Obsidian now accepts new plugin submissions through the [Community directory website](https://community.obsidian.md), not through pull requests to `obsidianmd/obsidian-releases`. The official process is documented in [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

Run **Actions -> Community submission check** after a GitHub release exists for the current `manifest.json.version`. This workflow verifies the repository state before you submit it manually.

The workflow:

1. Builds and validates the plugin release metadata.
2. Verifies that a GitHub Release exists for the current `manifest.json.version`.
3. Verifies that the release includes `main.js`, `manifest.json`, and `styles.css`.
4. Verifies GitHub artifact attestations for those release assets.
5. Prints the manual submission instructions in the GitHub Actions summary.

Then submit the repository URL at `https://community.obsidian.md`:

1. Sign in with your Obsidian account.
2. Link your GitHub account.
3. Select **Plugins -> New plugin**.
4. Submit `https://github.com/OneeMe/obsidian-lark-doc`.
5. Review and accept the developer policies.

The directory reads `manifest.json` from the default branch and downloads assets from the GitHub release whose tag matches `manifest.json.version`.

Official review is still required. If review feedback requires repository changes, update the repository, move the changelog entries into a new version section, publish an incremented GitHub release, and submit again from the Community directory. After the plugin is accepted, normal updates only need the GitHub release workflow.

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

Check the current state before manual Community directory submission:

```bash
npm run build
npm run release:validate
gh release view "$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version)")"
```
