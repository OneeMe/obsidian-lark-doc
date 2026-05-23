import {readFileSync, writeFileSync} from "node:fs";

const [communityPluginsPath, entryPath] = process.argv.slice(2);
if (!communityPluginsPath || !entryPath) {
	console.error("Usage: node scripts/update-community-plugins.mjs <community-plugins.json> <entry.json>");
	process.exit(1);
}

const original = readFileSync(communityPluginsPath, "utf8");
const plugins = JSON.parse(original);
const entry = JSON.parse(readFileSync(entryPath, "utf8"));

if (plugins.some((plugin) => plugin.id === entry.id)) {
	console.log(`Plugin ${entry.id} already exists in ${communityPluginsPath}; no changes made.`);
	process.exit(0);
}

const compactEntry = JSON.stringify(entry);
const trimmed = original.trimEnd();
const withoutClosingBracket = trimmed.replace(/\s*\]\s*$/, "");
const separator = /\}\s*$/.test(withoutClosingBracket) ? ", " : "";
writeFileSync(communityPluginsPath, `${withoutClosingBracket}${separator}${compactEntry} ]\n`);

console.log(`Added ${entry.id} to ${communityPluginsPath}.`);
