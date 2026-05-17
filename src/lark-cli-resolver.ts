import {execSync} from "child_process";
import {existsSync} from "fs";
import {join, resolve} from "path";
import {homedir} from "os";

const COMMON_PATHS = [
	"~/.local/bin/lark-cli",
	"/usr/local/bin/lark-cli",
	"/opt/homebrew/bin/lark-cli",
	"/usr/bin/lark-cli",
	"~/.cargo/bin/lark-cli",
	"~/.nix-profile/bin/lark-cli",
];

function expandHome(path: string): string {
	if (path.startsWith("~/")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

/**
 * Try to find lark-cli executable automatically.
 * Returns the resolved path, or undefined if not found.
 */
export function resolveLarkCliPath(): string | undefined {
	// 1. Common static paths
	for (const p of COMMON_PATHS) {
		const expanded = expandHome(p);
		if (existsSync(expanded)) {
			return expanded;
		}
	}

	// 2. npm global prefix + lark-cli location
	const npmGlobalPath = resolveNpmGlobalLarkCli();
	if (npmGlobalPath) {
		return npmGlobalPath;
	}

	// 3. Shell "which lark-cli" (picks up fnm, nvm, asdf, etc.)
	const whichPath = resolveViaWhich();
	if (whichPath) {
		return whichPath;
	}

	return undefined;
}

function resolveNpmGlobalLarkCli(): string | undefined {
	try {
		const prefix = execSync("npm prefix -g", {
			encoding: "utf8",
			timeout: 5000,
		}).trim();

		// npm global bin
		const binPath = resolve(prefix, "bin", "lark-cli");
		if (existsSync(binPath)) {
			return binPath;
		}

		// npm global lib/node_modules/@larksuite/cli/bin/lark-cli
		const libPath = resolve(prefix, "lib", "node_modules", "@larksuite", "cli", "bin", "lark-cli");
		if (existsSync(libPath)) {
			return libPath;
		}
	} catch {
		// npm not available or failed
	}
	return undefined;
}

function resolveViaWhich(): string | undefined {
	try {
		const result = execSync("command -v lark-cli || which lark-cli", {
			shell: "/bin/sh",
			encoding: "utf8",
			timeout: 5000,
		}).trim();

		if (result && existsSync(result)) {
			return result;
		}
	} catch {
		// which not available or lark-cli not found
	}
	return undefined;
}

/**
 * Get the effective lark-cli path, falling back from user setting to auto-detection.
 */
export function getEffectiveLarkCliPath(userSetting: string): string {
	// If user explicitly set a non-default path, trust it
	if (userSetting && userSetting !== "lark-cli") {
		return userSetting;
	}

	// Try auto-detection
	const resolved = resolveLarkCliPath();
	if (resolved) {
		return resolved;
	}

	// Fallback to default; will likely fail with ENOENT but gives a clear error
	return userSetting || "lark-cli";
}
