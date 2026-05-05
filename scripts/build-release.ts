#!/usr/bin/env node
/**
 * MyCleanCenter — Release-Bundler.
 *
 * Baut ein signiertes Release-ZIP, das man auf den Pi kopieren oder über die
 * System-Update-UI hochladen kann.
 *
 *   bun run release
 *   bun run release -- --skip-frontend --allow-same-version
 *   bun run release -- --key=/pfad/zu/master.key --out=./dist-release
 *
 * Voraussetzungen:
 *   - Versionen in package.json (root) und backend/package.json müssen synchron sein.
 *   - master.key muss existieren (Default: ~/.mycleancenter/master.key).
 *     Anleitung zum Bootstrap siehe backend/deploy/README.md.
 */
import { execSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";

import path from "node:path";
import os from "node:os";
import { createHmac } from "node:crypto";

interface ManifestPayload {
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  minBackendVersion: string;
  hinweise?: string;
}

/**
 * Identische Signatur-Logik wie backend/src/system/manifest.ts → signManifest.
 * Wenn die Backend-Logik sich ändert, muss diese Funktion mitgezogen werden.
 * Test backend/test/release-bundle.spec.ts prüft Kompatibilität.
 */
function canonicalJson(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .forEach((k) => (sorted[k] = obj[k]));
  return JSON.stringify(sorted);
}

function signManifest(payload: ManifestPayload, key: Buffer): ManifestPayload & { signature: string } {
  const sig = createHmac("sha256", key)
    .update(canonicalJson({ ...payload, signature: undefined } as Record<string, unknown>))
    .digest("hex");
  return { ...payload, signature: sig };
}

interface Args {
  out: string;
  keyPath: string;
  allowSameVersion: boolean;
  skipFrontend: boolean;
  skipBackend: boolean;
  minBackendVersion?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: "dist-release",
    keyPath: path.join(os.homedir(), ".mycleancenter", "master.key"),
    allowSameVersion: false,
    skipFrontend: false,
    skipBackend: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a.startsWith("--key=")) args.keyPath = a.slice(6);
    else if (a === "--allow-same-version") args.allowSameVersion = true;
    else if (a === "--skip-frontend") args.skipFrontend = true;
    else if (a === "--skip-backend") args.skipBackend = true;
    else if (a.startsWith("--min-backend=")) args.minBackendVersion = a.slice(14);
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: bun run release [--out=dir] [--key=path] [--allow-same-version] [--skip-frontend] [--skip-backend] [--min-backend=x.y.z]",
      );
      process.exit(0);
    } else {
      console.error(`Unbekanntes Argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const stamp = (): string => new Date().toISOString().slice(11, 19);
const log = (msg: string): void => console.log(`\x1b[1;36m[release ${stamp()}]\x1b[0m ${msg}`);
const ok = (msg: string): void => console.log(`\x1b[1;32m  ✓\x1b[0m ${msg}`);
const fail = (msg: string): never => {
  console.error(`\x1b[1;31m  ✗ ${msg}\x1b[0m`);
  process.exit(1);
};

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

function highestSchemaVersion(): number {
  const dir = path.join(ROOT, "backend/src/db/migrations");
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f));
  if (files.length === 0) fail("Keine Migrationen gefunden");
  const max = files.map((f) => Number.parseInt(f.split("_")[0], 10)).reduce((a, b) => Math.max(a, b), 0);
  return max;
}

function loadKey(p: string): Buffer {
  if (!existsSync(p)) {
    fail(
      `master.key nicht gefunden unter ${p}.\n` +
        `Bootstrap: einmalig vom Pi kopieren:\n` +
        `  scp pi@mycleancenter.local:/var/lib/mycleancenter/keys/master.key ${p}\n` +
        `  chmod 0600 ${p}`,
    );
  }
  const k = readFileSync(p);
  if (k.length < 32) fail("master.key zu kurz (<32 Bytes)");
  return k;
}

function run(cmd: string, cwd: string): void {
  log(`> ${cmd}  (cwd=${path.relative(ROOT, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore", shell: "/bin/sh" });
    return true;
  } catch {
    return false;
  }
}

function runPackageScript(script: string, cwd: string): void {
  const runner = hasCommand("bun") ? "bun run" : "npm run";
  run(`${runner} ${script}`, cwd);
}

function copyTree(src: string, dest: string): void {
  if (!existsSync(src)) fail(`Quelle fehlt: ${src}`);
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const st = statSync(s);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".cache") continue;
      copyTree(s, d);
    } else {
      writeFileSync(d, readFileSync(s));
    }
  }
}

function createSpaIndex(frontendOutDir: string): void {
  const assetsDir = path.join(frontendOutDir, "assets");
  if (!existsSync(assetsDir)) fail(`Assets fehlen: ${assetsDir}`);
  const assets = readdirSync(assetsDir);
  const mainScript = assets.find((f) => /^main-[A-Za-z0-9_-]+\.js$/.test(f));
  if (!mainScript) fail("Frontend-Client-Entry main-*.js fehlt");
  const styleLinks = assets
    .filter((f) => /^styles-[A-Za-z0-9_-]+\.css$/.test(f))
    .map((f) => `    <link rel="stylesheet" href="/assets/${f}">`)
    .join("\n");
  writeFileSync(
    path.join(frontendOutDir, "index.html"),
    `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MCC Reinigungs-CRM</title>
    <meta name="description" content="Lokales CRM- und Rechnungssystem für den Reinigungsbetrieb.">
${styleLinks}
  </head>
  <body>
    <script type="module" src="/assets/${mainScript}"></script>
  </body>
</html>
`,
  );
}

async function zipDir(srcDir: string, outZip: string): Promise<void> {
  const JSZipMod = (await import("jszip")).default;
  const zip = new JSZipMod();
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (st.isDirectory()) walk(full, rel);
      else zip.file(rel, readFileSync(full));
    }
  }
  walk(srcDir, "");
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(outZip);
    ws.on("finish", () => resolve());
    ws.on("error", reject);
    ws.end(buf);
  });
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  log("Versionen prüfen");
  const rootPkg = readJson(path.join(ROOT, "package.json"));
  const backendPkg = readJson(path.join(ROOT, "backend/package.json"));
  const version = backendPkg.version as string;
  if (!version || typeof version !== "string") fail("backend/package.json: version fehlt");
  if (rootPkg.version && rootPkg.version !== version) {
    fail(`Versionen drift: root=${String(rootPkg.version)} backend=${version}`);
  }
  ok(`Version: ${version}`);

  const schemaVersion = highestSchemaVersion();
  ok(`schemaVersion: ${schemaVersion}`);

  const key = loadKey(args.keyPath);
  ok(`master.key geladen (${key.length} Bytes)`);

  const stagingRoot = path.join(ROOT, "tmp", "release-bundle");
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });

  if (!args.skipFrontend) {
    log("Frontend bauen");
    runPackageScript("build", ROOT);
    const frontendDist = path.join(ROOT, "dist");
    const frontendClientDist = path.join(frontendDist, "client");
    if (!existsSync(frontendDist)) fail("Frontend-Build hat dist/ nicht erzeugt");
    const stagedFrontend = path.join(stagingRoot, "dist");
    copyTree(existsSync(frontendClientDist) ? frontendClientDist : frontendDist, stagedFrontend);
    createSpaIndex(stagedFrontend);
    ok("Frontend kopiert");
  } else {
    log("Frontend übersprungen (--skip-frontend)");
  }

  if (!args.skipBackend) {
    log("Backend bauen");
    runPackageScript("build", path.join(ROOT, "backend"));
    const backendDist = path.join(ROOT, "backend/dist");
    if (!existsSync(backendDist)) fail("Backend-Build hat backend/dist/ nicht erzeugt");
    copyTree(backendDist, path.join(stagingRoot, "backend/dist"));
    ok("Backend kopiert");
  } else {
    log("Backend übersprungen (--skip-backend)");
  }

  log("Begleitdateien kopieren");
  mkdirSync(path.join(stagingRoot, "backend"), { recursive: true });
  writeFileSync(
    path.join(stagingRoot, "backend/package.json"),
    readFileSync(path.join(ROOT, "backend/package.json")),
  );
  const lockPath = path.join(ROOT, "backend/package-lock.json");
  if (existsSync(lockPath)) {
    writeFileSync(path.join(stagingRoot, "backend/package-lock.json"), readFileSync(lockPath));
  }
  copyTree(path.join(ROOT, "backend/src/db/migrations"), path.join(stagingRoot, "backend/src/db/migrations"));
  copyTree(path.join(ROOT, "backend/src/db/migrations"), path.join(stagingRoot, "backend/dist/db/migrations"));
  copyTree(path.join(ROOT, "backend/deploy"), path.join(stagingRoot, "backend/deploy"));
  ok("Begleitdateien kopiert");

  log("Manifest signieren");
  const releaseNotesPath = path.join(ROOT, "RELEASE_NOTES.md");
  let hinweise: string | undefined;
  if (existsSync(releaseNotesPath)) {
    hinweise = readFileSync(releaseNotesPath, "utf8").trim();
    if (hinweise.length > 4000) fail("RELEASE_NOTES.md > 4000 Zeichen");
    if (hinweise.length === 0) hinweise = undefined;
  }
  const manifest = signManifest(
    {
      appVersion: version,
      schemaVersion,
      createdAt: new Date().toISOString(),
      minBackendVersion: args.minBackendVersion ?? version,
      hinweise,
    },
    key,
  );
  writeFileSync(path.join(stagingRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  ok("Manifest signiert");

  log("ZIP packen");
  const outDir = path.resolve(ROOT, args.out);
  mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, `mycleancenter-v${version}.zip`);
  rmSync(zipPath, { force: true });
  await zipDir(stagingRoot, zipPath);
  const sha = sha256(zipPath);
  writeFileSync(`${zipPath}.sha256`, `${sha}  ${path.basename(zipPath)}\n`);
  const sizeMb = (statSync(zipPath).size / 1024 / 1024).toFixed(1);
  ok(`Bundle: ${path.relative(ROOT, zipPath)}  (${sizeMb} MB)`);
  ok(`SHA256: ${sha}`);

  log("Fertig.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
