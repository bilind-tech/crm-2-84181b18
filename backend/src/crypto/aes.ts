// AES-256-GCM Verschlüsselung sensibler Settings.
// Format: "v1:" + base64( iv(12) | tag(16) | ciphertext )

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadMasterKey } from "./masterkey.js";
import { config } from "../config.js";

const VERSION = "v1";
const IV_LEN = 12;
const TAG_LEN = 16;

let _key: Buffer | null = null;
function key(): Buffer {
  if (!_key) {
    _key = loadMasterKey(config.keyPath);
    if (_key.length !== 32) {
      throw new Error("Master-Key hat falsche Länge");
    }
  }
  return _key;
}

export function encryptString(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, ct]);
  return `${VERSION}:${blob.toString("base64")}`;
}

export function decryptString(token: string): string {
  const idx = token.indexOf(":");
  if (idx < 0) throw new Error("Ungültiges Crypto-Token");
  const version = token.slice(0, idx);
  if (version !== VERSION) throw new Error(`Unbekannte Crypto-Version: ${version}`);
  const blob = Buffer.from(token.slice(idx + 1), "base64");
  if (blob.length < IV_LEN + TAG_LEN + 1) throw new Error("Crypto-Blob zu kurz");
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function isEncryptedToken(s: unknown): boolean {
  return typeof s === "string" && s.startsWith(`${VERSION}:`);
}
