import { mkdirSync, rmSync, cpSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";

const pluginId = "linear-year-calendar";
const distDir = "dist";
const packageDir = join(distDir, pluginId);
const zipPath = join(distDir, `${pluginId}.zip`);

const required = ["main.js", "manifest.json", "styles.css"];
for (const file of required) {
	if (!existsSync(file)) {
		console.error(`Missing ${file}. Run \`npm run build\` first.`);
		process.exit(1);
	}
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
for (const file of required) {
	cpSync(file, join(packageDir, file));
}

execFileSync("zip", ["-r", `${pluginId}.zip`, pluginId], {
	cwd: distDir,
	stdio: "inherit",
});

console.log(`Packaged ${zipPath}`);
console.log("Zip contains only:");
for (const file of required) {
	console.log(`  - ${pluginId}/${file}`);
}
