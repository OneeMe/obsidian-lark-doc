import {readFileSync} from "node:fs";

const version = process.argv[2] ?? JSON.parse(readFileSync("manifest.json", "utf8")).version;
const changelog = readFileSync("CHANGELOG.md", "utf8");
const section = extractChangelogSection(changelog, version);

if (!section) {
	console.error(`CHANGELOG.md is missing a section for ${version}.`);
	process.exit(1);
}

console.log(section);

export function extractChangelogSection(changelog, version) {
	const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?: - .*)?$`, "m");
	const match = heading.exec(changelog);
	if (!match) return undefined;

	const start = match.index + match[0].length;
	const nextHeading = /^## \[/m.exec(changelog.slice(start));
	const end = nextHeading ? start + nextHeading.index : changelog.length;
	const section = changelog.slice(start, end).trim();
	return section.length > 0 ? section : undefined;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
