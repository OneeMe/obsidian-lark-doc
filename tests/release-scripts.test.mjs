import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function withReleaseFixture(callback) {
	const dir = await mkdtemp(join(tmpdir(), "obsidian-lark-doc-release-test-"));
	try {
		await writeJson(join(dir, "package.json"), {
			name: "obsidian-lark-doc",
			version: "1.2.3",
		});
		await writeJson(join(dir, "package-lock.json"), {
			name: "obsidian-lark-doc",
			version: "1.2.3",
			packages: {
				"": {
					name: "obsidian-lark-doc",
					version: "1.2.3",
				},
			},
		}, 2);
		await writeJson(join(dir, "manifest.json"), {
			id: "lark-doc",
			name: "Lark Wiki",
			version: "1.2.3",
			minAppVersion: "1.7.2",
			description: "Bridge your vault with Lark Wiki / Feishu cloud documents and Bases.",
			author: "OneeMe",
			isDesktopOnly: true,
		});
		await writeJson(join(dir, "versions.json"), {
			"1.2.3": "1.7.2",
		});
		await writeFile(join(dir, "CHANGELOG.md"), [
			"# Changelog",
			"",
			"## [Unreleased]",
			"",
			"## [1.2.3] - 2026-05-23",
			"",
			"### Added",
			"",
			"- Initial fixture release.",
			"",
		].join("\n"));
		await writeFile(join(dir, "main.js"), "module.exports = {};\n");
		await writeFile(join(dir, "styles.css"), ".lark-doc {}\n");
		await callback(dir);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
}

test("prepare-release synchronizes package, manifest, lockfile, and versions", async () => {
	await withReleaseFixture(async (dir) => {
		const result = runScript("scripts/prepare-release.mjs", ["minor"], dir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Prepared release 1\.3\.0/);

		const pkg = await readJson(join(dir, "package.json"));
		const lock = await readJson(join(dir, "package-lock.json"));
		const manifest = await readJson(join(dir, "manifest.json"));
		const versions = await readJson(join(dir, "versions.json"));

		assert.equal(pkg.version, "1.3.0");
		assert.equal(lock.version, "1.3.0");
		assert.equal(lock.packages[""].version, "1.3.0");
		assert.equal(manifest.version, "1.3.0");
		assert.equal(versions["1.3.0"], "1.7.2");
	});
});

test("validate-release rejects marketplace identifiers that contain Obsidian", async () => {
	await withReleaseFixture(async (dir) => {
		const manifestPath = join(dir, "manifest.json");
		const manifest = await readJson(manifestPath);
		manifest.id = "obsidian-lark-doc";
		manifest.name = "Obsidian Lark Wiki";
		await writeJson(manifestPath, manifest);

		const result = runScript("scripts/validate-release.mjs", [], dir);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /must not contain "obsidian"/i);
	});
});

test("validate-release rejects marketplace descriptions that contain Obsidian", async () => {
	await withReleaseFixture(async (dir) => {
		const manifestPath = join(dir, "manifest.json");
		const manifest = await readJson(manifestPath);
		manifest.description = "Bridge your Obsidian vault with Lark and Feishu documents.";
		await writeJson(manifestPath, manifest);

		const result = runScript("scripts/validate-release.mjs", [], dir);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /manifest\.description must not contain "Obsidian"/);
	});
});

test("validate-release rejects releases without matching changelog notes", async () => {
	await withReleaseFixture(async (dir) => {
		await writeFile(join(dir, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n");

		const result = runScript("scripts/validate-release.mjs", [], dir);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /CHANGELOG\.md must contain a non-empty section for 1\.2\.3/);
	});
});

test("validate-release rejects releases without styles.css", async () => {
	await withReleaseFixture(async (dir) => {
		await rm(join(dir, "styles.css"), {force: true});

		const result = runScript("scripts/validate-release.mjs", [], dir);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /styles\.css release asset is missing/);
	});
});

test("changelog-section prints release notes for a version", async () => {
	await withReleaseFixture(async (dir) => {
		const result = runScript("scripts/changelog-section.mjs", ["1.2.3"], dir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /### Added/);
		assert.match(result.stdout, /Initial fixture release/);
		assert.doesNotMatch(result.stdout, /Unreleased/);
	});
});

function runScript(script, args, cwd, env = {}) {
	return spawnSync(process.execPath, [resolve(repoRoot, script), ...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			...env,
		},
	});
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value, spaces = "\t") {
	await writeFile(path, `${JSON.stringify(value, null, spaces)}\n`);
}
