import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const isLinuxArm64 = process.platform === "linux" && os.arch() === "arm64";

if (!isLinuxArm64) {
  process.exit(0);
}

const nativePackageName = "lightningcss-linux-arm64-gnu";

try {
  require.resolve(nativePackageName);
  process.exit(0);
} catch {
  // Continue below and install the missing native package.
}

let lightningCssVersion;

try {
  const entry = require.resolve("lightningcss");
  // Suche das nächstgelegene package.json oberhalb des Entrypoints.
  let dir = path.dirname(entry);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf8"));
      if (pkg && pkg.name === "lightningcss") {
        lightningCssVersion = pkg.version;
        break;
      }
    } catch {
      // package.json hier nicht vorhanden – weiter nach oben.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
} catch {
  // ignorieren – Fallback ohne Version-Pin unten
}

const installSpec = lightningCssVersion
  ? `${nativePackageName}@${lightningCssVersion}`
  : nativePackageName;

if (!lightningCssVersion) {
  console.warn(
    "Konnte lightningcss-Version nicht ermitteln – installiere ARM64-Binary ohne Version-Pin.",
  );
}

console.log(`Installiere fehlendes LightningCSS ARM64-Binary: ${installSpec}`);

execFileSync(
  "npm",
  ["install", "--no-save", "--no-audit", "--no-fund", installSpec],
  { stdio: "inherit" },
);