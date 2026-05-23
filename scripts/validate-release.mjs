import {existsSync, readFileSync} from "node:fs";

const pkg = readJson("package.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");
const failures = [];

requireString(manifest.id, "manifest.id");
requireString(manifest.name, "manifest.name");
requireString(manifest.version, "manifest.version");
requireString(manifest.minAppVersion, "manifest.minAppVersion");
requireString(manifest.description, "manifest.description");
requireString(manifest.author, "manifest.author");

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
	failures.push("manifest.version must use x.y.z SemVer format.");
}
if (pkg.version !== manifest.version) {
	failures.push(`package.json version ${pkg.version} must match manifest version ${manifest.version}.`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
	failures.push(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}.`);
}
if (!/^[a-z0-9-]+$/.test(manifest.id)) {
	failures.push("manifest.id must use lowercase letters, numbers, and hyphens only.");
}
if (/obsidian/i.test(manifest.id)) {
	failures.push('manifest.id must not contain "obsidian".');
}
if (/obsidian/i.test(manifest.name)) {
	failures.push('manifest.name must not contain "Obsidian" for community directory submission.');
}
if (typeof manifest.isDesktopOnly !== "boolean") {
	failures.push("manifest.isDesktopOnly must be a boolean.");
}
if (!hasChangelogSection(manifest.version)) {
	failures.push(`CHANGELOG.md must contain a non-empty section for ${manifest.version}.`);
}
if (!existsSync("main.js")) {
	failures.push("main.js release asset is missing. Run npm run build first.");
}
if (!existsSync("manifest.json")) {
	failures.push("manifest.json release asset is missing.");
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log(`Release validation passed for ${manifest.name} ${manifest.version}.`);

function requireString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) {
		failures.push(`${field} is required.`);
	}
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function hasChangelogSection(version) {
	if (!existsSync("CHANGELOG.md")) return false;
	const changelog = readFileSync("CHANGELOG.md", "utf8");
	const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?: - .*)?$`, "m");
	const match = heading.exec(changelog);
	if (!match) return false;

	const start = match.index + match[0].length;
	const nextHeading = /^## \[/m.exec(changelog.slice(start));
	const end = nextHeading ? start + nextHeading.index : changelog.length;
	return changelog.slice(start, end).trim().length > 0;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
