import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: [
			"main.js",
			"preview/preview.js",
			"node_modules/**",
			"coverage/**",
			"**/*.test.ts",
			"vitest.config.ts",
			"esbuild.config.mjs",
			"scripts/**",
			"version-bump.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts", "preview/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
		rules: {
			// Preview uses browser DOM without Obsidian globals.
			"obsidianmd/sample-names": "off",
		},
	},
	{
		files: ["preview/**/*.ts"],
		rules: {
			// Browser preview is not an Obsidian plugin context.
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"obsidianmd/rule-custom-message": "off",
			"obsidianmd/prefer-create-el": "off",
			"obsidianmd/ui/sentence-case": "off",
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			// Sentence-case nits are noisy for product strings (ICS, Google Calendar).
			"obsidianmd/ui/sentence-case": "off",
			// Preview / detached DOM fallbacks.
			"obsidianmd/prefer-create-el": "warn",
		},
	},
	{
		files: ["src/settings.ts"],
		rules: {
			// Compact ICS list must be imperative; declarative sibling rows are discarded.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			"obsidianmd/settings-tab/prefer-update-over-display": "off",
			"obsidianmd/settings-tab/no-deprecated-display": "off",
			"@typescript-eslint/no-deprecated": "off",
		},
	},
]);
