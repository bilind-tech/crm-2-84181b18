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

// Liste der ARM64-Native-Bindings, die auf dem Pi häufig fehlen,
// weil `npm ci --ignore-scripts` Postinstall-Downloads überspringt.
const nativePackages = [
  { parent: "lightningcss", native: "lightningcss-linux-arm64-gnu" },
  { parent: "@tailwindcss/oxide", native: "@tailwindcss/oxide-linux-arm64-gnu" },
];

function readParentVersion(parentName) {
  try {
    const entry = require.resolve(parentName);
    let dir = path.dirname(entry);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = path.join(dir, "package.json");
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8"));
        if (pkg && pkg.name === parentName) {
          return pkg.version;
        }
      } catch {
        // weiter nach oben
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch {
    return null;
  }
}

const toInstall = [];

for (const { parent, native } of nativePackages) {
  try {
    require.resolve(native);
    continue;
  } catch {
    // fehlt – nachinstallieren
  }

  const version = readParentVersion(parent);
  const spec = version ? `${native}@${version}` : native;

  if (!version) {
    console.warn(
      `Konnte ${parent}-Version nicht ermitteln – installiere ${native} ohne Version-Pin.`,
    );
  }

  toInstall.push(spec);
}

if (toInstall.length === 0) {
  process.exit(0);
}

console.log(`Installiere fehlende ARM64-Native-Bindings: ${toInstall.join(", ")}`);

execFileSync(
  "npm",
  ["install", "--no-save", "--no-audit", "--no-fund", ...toInstall],
  { stdio: "inherit" },
);