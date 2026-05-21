// Angebot → Rechnung umwandeln. Idempotent: zweiter Aufruf liefert die existierende Rechnung.
import { getDatabase } from "../db/index.js";
import { createRechnung } from "./rechnungen-repo.js";
import { getAngebot } from "./angebote-repo.js";
import { getRechnung } from "./rechnungen-repo.js";
import type { ApiRechnung } from "./mappers.js";

export function angebotInRechnungUmwandeln(angebotId: string): ApiRechnung | null {
  const db = getDatabase();
  // Idempotenz: existiert schon eine Rechnung mit diesem Angebot als Quelle?
  const existing = db
    .prepare(`SELECT id FROM rechnung WHERE quell_angebot_id = ? ORDER BY erstellt_am ASC LIMIT 1`)
    .get(angebotId) as { id: string } | undefined;
  if (existing) return getRechnung(existing.id);

  const src = getAngebot(angebotId);
  if (!src) return null;

  const rechnung = createRechnung({
    kundeId: src.kundeId,
    objektId: src.objektId,
    ansprechpartnerId: src.ansprechpartnerId,
    quellAngebotId: src.id,
    titel: src.titel,
    introText: src.introText,
    outroText: src.outroText,
    positionen: src.positionen.map((p) => ({
      beschreibung: p.beschreibung,
      menge: p.menge,
      einheit: p.einheit,
      einzelpreisNetto: p.einzelpreisNetto,
      steuersatz: p.steuersatz,
      rabatt: p.rabatt,
      modus: p.modus,
      pauschalpreisNetto: p.pauschalpreisNetto,
    })),
    rabattGesamt: src.rabattGesamt,
    steuersatz: src.steuersatz,
    einsatzVon: src.einsatzVon,
    einsatzBis: src.einsatzBis,
    notizen: src.notizen,
    optionen: src.optionen,
  });

  // Angebot-Status auf 'angenommen' (terminal)
  db.prepare(`UPDATE angebot SET status='angenommen' WHERE id = ? AND status NOT IN ('angenommen')`)
    .run(angebotId);

  return rechnung;
}
