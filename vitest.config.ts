import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: [
				"src/dates.ts",
				"src/format.ts",
				"src/year-grid.ts",
				"src/segments.ts",
				"src/ics.ts",
				"src/note-model.ts",
			],
			thresholds: {
				lines: 80,
				functions: 80,
				statements: 80,
				branches: 70,
			},
		},
	},
});
