// argon2id Passwort-Hashing.

import { hash, verify, Algorithm } from "@node-rs/argon2";

const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}
