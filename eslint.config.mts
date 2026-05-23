import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/ui/sentence-case": ["error", {
				acronyms: ["API", "CLI", "CSS", "OK", "PDF", "URL"],
				brands: ["Feishu", "GitHub", "Google Drive", "Lark", "Obsidian", "Obsidian Publish"],
				enforceCamelCaseLower: true,
			}],
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"scripts/*.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
