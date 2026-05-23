import {existsSync, readFileSync, writeFileSync} from "node:fs";

const release = process.argv[2] ?? "patch";

const pkg = readJson("package.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

const currentVersion = pkg.version;
const targetVersion = resolveTargetVersion(currentVersion, release);

if (compareSemver(targetVersion, currentVersion) <= 0) {
	throw new Error(`Target version ${targetVersion} must be greater than current version ${currentVersion}.`);
}

pkg.version = targetVersion;
manifest.version = targetVersion;
versions[targetVersion] = manifest.minAppVersion;

writeJson("package.json", pkg, "\t");
writeJson("manifest.json", manifest, "\t");
writeJson("versions.json", versions, "\t");

if (existsSync("package-lock.json")) {
	const lock = readJson("package-lock.json");
	lock.version = targetVersion;
	if (lock.packages?.[""]) {
		lock.packages[""].version = targetVersion;
	}
	writeJson("package-lock.json", lock, 2);
}

console.log(`Prepared release ${targetVersion}`);

function resolveTargetVersion(current, input) {
	const semver = parseSemver(current);
	if (input === "major") {
		return `${semver.major + 1}.0.0`;
	}
	if (input === "minor") {
		return `${semver.major}.${semver.minor + 1}.0`;
	}
	if (input === "patch") {
		return `${semver.major}.${semver.minor}.${semver.patch + 1}`;
	}
	parseSemver(input);
	return input;
}

function compareSemver(a, b) {
	const left = parseSemver(a);
	const right = parseSemver(b);
	for (const key of ["major", "minor", "patch"]) {
		if (left[key] !== right[key]) {
			return left[key] > right[key] ? 1 : -1;
		}
	}
	return 0;
}

function parseSemver(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`Version must use x.y.z SemVer format: ${version}`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value, spaces) {
	writeFileSync(path, `${JSON.stringify(value, null, spaces)}\n`);
}
