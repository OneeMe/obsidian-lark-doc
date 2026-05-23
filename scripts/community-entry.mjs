import {readFileSync} from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const repo = process.env.GITHUB_REPOSITORY ?? normalizeRepository(pkg.repository);

if (!repo) {
	console.error("GitHub repository is required. Set GITHUB_REPOSITORY or package.json repository.");
	process.exit(1);
}

const entry = {
	id: manifest.id,
	name: manifest.name,
	author: manifest.author,
	description: manifest.description,
	repo,
};

console.log(JSON.stringify(entry, null, "\t"));

function normalizeRepository(repository) {
	if (typeof repository === "string") {
		return repository
			.replace(/^git\+/, "")
			.replace(/^https:\/\/github\.com\//, "")
			.replace(/^git@github\.com:/, "")
			.replace(/\.git$/, "");
	}
	if (repository && typeof repository.url === "string") {
		return normalizeRepository(repository.url);
	}
	return undefined;
}
