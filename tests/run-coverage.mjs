import assert from "node:assert/strict";
import {readdir, readFile, rm} from "node:fs/promises";
import {join, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";

const COVERAGE_TARGETS = [
	"base-manager.ts",
	"feishu-frontmatter.ts",
	"i18n.ts",
	"indexer.ts",
	"lark-cli-resolver.ts",
	"lark-cli.ts",
	"lark-file.ts",
	"lark-note.ts",
	"title-sync.ts",
	"types.ts",
];

await cleanCoverageTempDirs();
await rm("coverage", {recursive: true, force: true});

const testFiles = (await readdir("tests"))
	.filter(file => file.endsWith(".test.mjs"))
	.sort()
	.map(file => join("tests", file));

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, [
	"c8",
	"--all",
	"--src", "src",
	"--reporter=json",
	"node",
	"--enable-source-maps",
	"--test",
	...testFiles,
], {
	stdio: "inherit",
	env: process.env,
});

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

const coverage = JSON.parse(await readFile("coverage/coverage-final.json", "utf8"));
const rows = COVERAGE_TARGETS.map(file => summarizeFileCoverage(coverage, file));
printCoverageTable(rows);

const failures = rows.flatMap(row => {
	return Object.entries(row.metrics)
		.filter(([, value]) => value !== 100)
		.map(([metric, value]) => `${row.file} ${metric}=${value.toFixed(2)}%`);
});

await cleanCoverageTempDirs();

if (failures.length > 0) {
	console.error("\nCoverage threshold failed:");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log("\nCore unit coverage: 100% statements, branches, functions, and lines.");

function summarizeFileCoverage(coverage, file) {
	const normalizedSuffix = `${sep}src${sep}${file}`;
	const key = Object.keys(coverage).find(path => path.endsWith(normalizedSuffix));
	assert.ok(key, `Missing coverage for src/${file}`);

	const fileCoverage = coverage[key];
	const statements = Object.values(fileCoverage.s);
	const functions = Object.values(fileCoverage.f);
	const branches = Object.values(fileCoverage.b).flat();
	const lineHits = new Map();

	for (const [id, statement] of Object.entries(fileCoverage.statementMap)) {
		const line = statement.start.line;
		lineHits.set(line, (lineHits.get(line) ?? 0) + fileCoverage.s[id]);
	}

	return {
		file,
		metrics: {
			statements: percent(statements.filter(count => count > 0).length, statements.length),
			branches: percent(branches.filter(count => count > 0).length, branches.length),
			functions: percent(functions.filter(count => count > 0).length, functions.length),
			lines: percent([...lineHits.values()].filter(count => count > 0).length, lineHits.size),
		},
	};
}

function percent(covered, total) {
	return total === 0 ? 100 : (covered / total) * 100;
}

function printCoverageTable(rows) {
	const header = ["File", "Stmts", "Branch", "Funcs", "Lines"];
	const widths = [28, 8, 8, 8, 8];
	const formatRow = values => values.map((value, index) => String(value).padEnd(widths[index])).join(" ");

	console.log("");
	console.log(formatRow(header));
	console.log(formatRow(widths.map(width => "-".repeat(width - 1))));
	for (const row of rows) {
		console.log(formatRow([
			row.file,
			formatPercent(row.metrics.statements),
			formatPercent(row.metrics.branches),
			formatPercent(row.metrics.functions),
			formatPercent(row.metrics.lines),
		]));
	}
}

function formatPercent(value) {
	return `${value.toFixed(2)}%`;
}

async function cleanCoverageTempDirs() {
	const cwd = resolve(".");
	const entries = await readdir(cwd, {withFileTypes: true});
	await Promise.all(entries
		.filter(entry => entry.isDirectory() && /^obsidian-(?:feishu|lark)(?:-.*)?-test-/.test(entry.name))
		.map(entry => rm(join(cwd, entry.name), {recursive: true, force: true})));
}
