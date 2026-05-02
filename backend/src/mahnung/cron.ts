// Mahn-Cron: täglich gemäß Settings (cronZeit, nurAnWerktagen).
// Leichtgewichtiger Scheduler analog dokumente/fristen-cron.ts.
import { ladeMahnEinstellungen, runMahnAutomatik } from "./automatik.js";

let timer: NodeJS.Timeout | null = null;
let lastRunDay = "";

function shouldRun(now: Date, cronZeit: string, nurWerktage: boolean, lastRun: string): boolean {
  const day = now.toISOString().slice(0, 10);
  if (day === lastRun) return false;
  if (nurWerktage) {
    const wd = now.getDay(); // 0=So, 6=Sa
    if (wd === 0 || wd === 6) return false;
  }
  const [hh, mm] = cronZeit.split(":").map((s) => parseInt(s, 10));
  const minNow = now.getHours() * 60 + now.getMinutes();
  const minTarget = hh * 60 + mm;
  return minNow >= minTarget;
}

function tick(): void {
  try {
    const cfg = ladeMahnEinstellungen();
    if (cfg.modus === "aus") return;
    const now = new Date();
    if (!shouldRun(now, cfg.cronZeit, cfg.nurAnWerktagen, lastRunDay)) return;
    runMahnAutomatik({ quelle: "cron" });
    lastRunDay = now.toISOString().slice(0, 10);
  } catch {
    /* swallow — Lauf-Tabelle hält Fehler fest */
  }
}

export function startMahnScheduler(): void {
  if (timer) return;
  timer = setInterval(tick, 5 * 60_000);
  timer.unref?.();
  setTimeout(tick, 10_000).unref?.();
}

export function stopMahnScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  lastRunDay = "";
}
