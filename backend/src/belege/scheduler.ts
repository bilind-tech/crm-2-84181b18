// Tagesjob für überfällige Rechnungen. Wird beim Backup-Scheduler-Tick mit aufgerufen.
//
// Fehler werden NICHT mehr verschluckt: jeder Tick-Fehler erzeugt eine klare
// Error-Zeile im Log. Nach 3 Fehlern in Folge zusätzlich eine Warn-Zeile,
// damit bei dauerhaft scheiterndem Scheduler in den Pi-Logs sofort sichtbar
// wird, dass etwas grundlegend kaputt ist.
import { markOverdueRechnungen } from "./status.js";

let timer: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;

function isMissingTablesError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "");
  return /no such table|SQLITE_ERROR.*no such/i.test(msg);
}

function runTick(isBootstrap: boolean): void {
  try {
    markOverdueRechnungen();
    if (consecutiveFailures > 0) {
      console.log(
        `[belege-scheduler] wieder ok nach ${consecutiveFailures} Fehlern`,
      );
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures += 1;
    // Beim Bootstrap: fehlende Tabellen sind erwartbar (Migrations laufen evtl. parallel).
    if (isBootstrap && isMissingTablesError(err)) {
      console.log(
        "[belege-scheduler] Tabellen noch nicht vorhanden — Versuch wird wiederholt.",
      );
      return;
    }
    const e = err as Error;
    console.error(
      `[belege-scheduler] markOverdueRechnungen fehlgeschlagen (${consecutiveFailures}x in Folge):`,
      e?.message ?? e,
    );
    if (e?.stack) console.error(e.stack);
    if (consecutiveFailures >= 3) {
      console.warn(
        `[belege-scheduler] WARNUNG: Scheduler scheitert dauerhaft (${consecutiveFailures} Versuche). Bitte prüfen.`,
      );
    }
  }
}

export function startBelegeScheduler(intervalMs: number = 60 * 60_000): void {
  if (timer) return;
  // Sofort einmal laufen
  runTick(true);
  timer = setInterval(() => runTick(false), intervalMs);
  timer.unref?.();
}

export function stopBelegeScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  consecutiveFailures = 0;
}
