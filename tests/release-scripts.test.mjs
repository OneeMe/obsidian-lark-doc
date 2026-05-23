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
			name: "Lark Doc",
			version: "1.2.3",
			minAppVersion: "1.7.2",
			description: "Bridge your vault with Lark and Feishu documents.",
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
		manifest.name = "Obsidian Lark Doc";
		await writeJson(manifestPath, manifest);

		const result = runScript("scripts/validate-release.mjs", [], dir);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /must not contain "obsidian"/i);
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

test("changelog-section prints release notes for a version", async () => {
	await withReleaseFixture(async (dir) => {
		const result = runScript("scripts/changelog-section.mjs", ["1.2.3"], dir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /### Added/);
		assert.match(result.stdout, /Initial fixture release/);
		assert.doesNotMatch(result.stdout, /Unreleased/);
	});
});

test("community-entry creates the official plugin catalog entry from manifest metadata", async () => {
	await withReleaseFixture(async (dir) => {
		const result = runScript("scripts/community-entry.mjs", [], dir, {
			GITHUB_REPOSITORY: "OneeMe/obsidian-lark-doc",
		});

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout), {
			id: "lark-doc",
			name: "Lark Doc",
			author: "OneeMe",
			description: "Bridge your vault with Lark and Feishu documents.",
			repo: "OneeMe/obsidian-lark-doc",
		});
	});
});

test("update-community-plugins inserts a missing plugin entry", async () => {
	await withReleaseFixture(async (dir) => {
		const registryPath = join(dir, "community-plugins.json");
		const entryPath = join(dir, "entry.json");
		await writeFile(registryPath, '[ {"id":"other","name":"Other","author":"A","description":"D","repo":"a/b"} ]\n');
		await writeJson(entryPath, {
			id: "lark-doc",
			name: "Lark Doc",
			author: "OneeMe",
			description: "Bridge your vault with Lark and Feishu documents.",
			repo: "OneeMe/obsidian-lark-doc",
		});

		const result = runScript("scripts/update-community-plugins.mjs", [
			registryPath,
			entryPath,
		], dir);

		assert.equal(result.status, 0, result.stderr);
		const registry = await readJson(registryPath);
		const output = await readFile(registryPath, "utf8");
		assert.equal(registry.at(-1).id, "lark-doc");
		assert.equal(output.includes('\n  {\n    "id": "lark-doc"'), true);
		assert.doesNotMatch(output, /\}, \{/);
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
