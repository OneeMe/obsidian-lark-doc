import {appendFileSync, createWriteStream} from "node:fs";
import {cp, mkdir, mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pipeline} from "node:stream/promises";
import {Readable} from "node:stream";
import {execFileSync} from "node:child_process";

if (process.platform !== "darwin") {
	throw new Error("Obsidian E2E installation requires macOS.");
}

const release = await fetchJson("https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest");
const tagName = typeof release.tag_name === "string" ? release.tag_name : "";
const version = tagName.replace(/^v/, "");
const assets = Array.isArray(release.assets) ? release.assets : [];
const dmgAsset = assets.find((asset) => {
	return typeof asset?.name === "string"
		&& asset.name.toLowerCase().endsWith(".dmg")
		&& typeof asset.browser_download_url === "string";
});

if (!version || !dmgAsset) {
	throw new Error("Could not resolve the latest Obsidian macOS release asset.");
}

const workDir = await mkdtemp(join(tmpdir(), "obsidian-e2e-"));
const dmgPath = join(workDir, "Obsidian.dmg");
const mountPoint = join(workDir, "mount");
const appPath = join(workDir, "Obsidian.app");

await downloadFile(dmgAsset.browser_download_url, dmgPath);
await mkdir(mountPoint);

let mounted = false;
try {
	execFileSync("hdiutil", ["attach", dmgPath, "-mountpoint", mountPoint, "-nobrowse", "-quiet"], {
		stdio: "inherit",
	});
	mounted = true;
	await cp(join(mountPoint, "Obsidian.app"), appPath, {recursive: true});
} finally {
	if (mounted) {
		execFileSync("hdiutil", ["detach", mountPoint, "-quiet"], {
			stdio: "ignore",
		});
	}
}

writeGitHubOutput("version", version);
writeGitHubOutput("app-path", appPath);
console.log(`Installed Obsidian ${version} at ${appPath}`);

async function fetchJson(url) {
	const response = await fetch(url, {
		headers: {
			"User-Agent": "obsidian-lark-doc-e2e",
			"Accept": "application/vnd.github+json",
		},
	});
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status} ${response.statusText}`);
	}
	return response.json();
}

async function downloadFile(url, path) {
	const response = await fetch(url, {
		headers: {"User-Agent": "obsidian-lark-doc-e2e"},
	});
	if (!response.ok || !response.body) {
		throw new Error(`Download failed: ${response.status} ${response.statusText}`);
	}
	await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
}

function writeGitHubOutput(name, value) {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (outputPath) {
		appendFileSync(outputPath, `${name}=${value}\n`);
	}
}
