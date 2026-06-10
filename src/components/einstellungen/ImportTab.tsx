// Einstellungen → Import: JSON aus altem CRM einfügen und Kunden + Ansprechpartner anlegen.
// Felder werden gemäß Mapping (siehe Plan) übersetzt. Backend-Endpunkte:
//   POST /kunden              -> legt Kunde an
//   POST /ansprechpartner     -> legt primären Ansprechpartner an
// Bei Kürzel-Konflikten antwortet das Backend mit 409 → wird als „übersprungen" markiert.
import { useMemo, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import type { Kunde, Ansprechpartner } from "@/lib/api/types";
import { qk } from "@/hooks/useApi";

type Gender = "Male" | "Female" | null;

interface ImportRow {
  firmenname: string | null;
  adresse: string | null;
  rechnungskuerzel: string | null;
  plz: string | null;
  ort: string | null;
  vertragsdatum: string | null;
  ansprechpartner: string | null;
  gender: Gender;
}

interface PreviewEntry {
  index: number;
  row: ImportRow;
  warnings: string[];
}

type ResultStatus = "ok" | "skipped" | "error";

interface ResultEntry {
  index: number;
  label: string;
  kuerzel: string | null;
  status: ResultStatus;
  message?: string;
}

const BEISPIEL = `{
  "kunden": [
    {
      "firmenname": "Beispiel GmbH",
      "adresse": "Musterstraße 1",
      "rechnungskuerzel": "Bsp",
      "plz": "12345",
      "ort": "Berlin",
      "vertragsdatum": "01.01.2024",
      "ansprechpartner": "Max Mustermann",
      "gender": "Male"
    }
  ]
}`;

function parseInput(text: string): { rows: ImportRow[]; error?: string } {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data?.kunden) ? data.kunden : Array.isArray(data) ? data : null;
    if (!list) return { rows: [], error: 'JSON muss ein Feld "kunden" mit einer Liste enthalten.' };
    const rows: ImportRow[] = list.map((r: Record<string, unknown>) => ({
      firmenname: toStr(r.firmenname),
      adresse: toStr(r.adresse),
      rechnungskuerzel: toStr(r.rechnungskuerzel),
      plz: toStr(r.plz),
      ort: toStr(r.ort),
      vertragsdatum: toStr(r.vertragsdatum),
      ansprechpartner: toStr(r.ansprechpartner),
      gender: r.gender === "Male" || r.gender === "Female" ? r.gender : null,
    }));
    return { rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "JSON konnte nicht gelesen werden." };
  }
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function splitName(name: string): { vorname?: string; nachname?: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { nachname: parts[0] };
  return { vorname: parts.slice(0, -1).join(" "), nachname: parts[parts.length - 1] };
}

function formatVertragsdatum(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  // TT.MM.JJJJ
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
  // MM.JJJJ
  m = t.match(/^(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}.${m[2]}`;
  return t; // unverändert übernehmen
}

function buildLabel(row: ImportRow): string {
  return row.firmenname ?? row.ansprechpartner ?? "(ohne Namen)";
}

function rowWarnings(row: ImportRow): string[] {
  const w: string[] = [];
  if (!row.firmenname && !row.ansprechpartner) w.push("Weder Firmenname noch Ansprechpartner");
  if (!row.rechnungskuerzel) w.push("Kein Kürzel");
  return w;
}

export function ImportTab() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const qc = useQueryClient();

  const summary = useMemo(() => {
    const ok = results.filter((r) => r.status === "ok").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const error = results.filter((r) => r.status === "error").length;
    return { ok, skipped, error };
  }, [results]);

  function handlePreview() {
    setResults([]);
    setProgress(0);
    const { rows, error } = parseInput(text);
    if (error) {
      setParseError(error);
      setPreview(null);
      return;
    }
    setParseError(null);
    setPreview(
      rows.map((row, index) => ({ index, row, warnings: rowWarnings(row) })),
    );
  }

  async function handleImport() {
    if (!preview) return;
    setRunning(true);
    setResults([]);
    setProgress(0);
    const accumulated: ResultEntry[] = [];

    for (let i = 0; i < preview.length; i++) {
      const entry = preview[i];
      const row = entry.row;
      const label = buildLabel(row);
      const kuerzel = row.rechnungskuerzel;

      const firmenname = row.firmenname ?? (row.ansprechpartner ? undefined : "Unbekannt");
      const vertragHinweis = formatVertragsdatum(row.vertragsdatum);
      const notizen = vertragHinweis ? `Vertrag seit ${vertragHinweis}` : undefined;

      const payload: Partial<Kunde> = {
        typ: "firma",
        status: "aktiv",
        firmenname,
        strasse: row.adresse ?? undefined,
        plz: row.plz ?? undefined,
        ort: row.ort ?? undefined,
        kuerzel: kuerzel ?? undefined,
        notizen,
      };

      try {
        const kunde = await api.post<Kunde>("/kunden", payload);

        if (row.ansprechpartner) {
          const { vorname, nachname } = splitName(row.ansprechpartner);
          const anrede =
            row.gender === "Male" ? "herr" : row.gender === "Female" ? "frau" : undefined;
          try {
            await api.post<Ansprechpartner>("/ansprechpartner", {
              kundeId: kunde.id,
              vorname,
              nachname,
              anrede,
              primaer: true,
            });
          } catch (e) {
            // Kunde wurde angelegt; Ansprechpartner-Fehler nur als Hinweis
            accumulated.push({
              index: entry.index,
              label,
              kuerzel,
              status: "ok",
              message: `Kunde angelegt, Ansprechpartner-Fehler: ${errMsg(e)}`,
            });
            setResults([...accumulated]);
            setProgress(i + 1);
            continue;
          }
        }

        accumulated.push({ index: entry.index, label, kuerzel, status: "ok" });
      } catch (e) {
        const status: ResultStatus =
          e instanceof ApiError && e.status === 409 ? "skipped" : "error";
        accumulated.push({
          index: entry.index,
          label,
          kuerzel,
          status,
          message: errMsg(e),
        });
      }

      setResults([...accumulated]);
      setProgress(i + 1);
    }

    qc.invalidateQueries({ queryKey: qk.kunden });
    setRunning(false);
  }

  function handleReset() {
    setText("");
    setPreview(null);
    setParseError(null);
    setResults([]);
    setProgress(0);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <Upload className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">Kunden aus JSON importieren</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Füge dein JSON aus dem alten CRM ein. Pro Eintrag wird ein neuer Kunde angelegt und
              — falls vorhanden — ein primärer Ansprechpartner.
              {" "}Bei Kürzel-Konflikten wird der betroffene Kunde übersprungen.
            </p>
          </div>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={BEISPIEL}
          className="min-h-[260px] font-mono text-xs"
          disabled={running}
          spellCheck={false}
        />

        {parseError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {parseError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePreview} disabled={running || !text.trim()} variant="outline">
            Vorschau prüfen
          </Button>
          <Button
            onClick={handleImport}
            disabled={!preview || preview.length === 0 || running}
          >
            {running ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Import läuft… {progress}/{preview?.length ?? 0}
              </>
            ) : (
              <>Import starten{preview ? ` (${preview.length})` : ""}</>
            )}
          </Button>
          {(preview || results.length > 0) && !running && (
            <Button onClick={handleReset} variant="ghost">
              Zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {preview && results.length === 0 && (
        <PreviewTable preview={preview} />
      )}

      {results.length > 0 && (
        <ResultPanel results={results} summary={summary} total={preview?.length ?? results.length} />
      )}
    </div>
  );
}

function PreviewTable({ preview }: { preview: PreviewEntry[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        Vorschau · {preview.length} Kunde{preview.length === 1 ? "" : "n"}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Kürzel</th>
              <th className="px-4 py-2 font-medium">Ort</th>
              <th className="px-4 py-2 font-medium">Ansprechpartner</th>
              <th className="px-4 py-2 font-medium">Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((e) => (
              <tr key={e.index} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{e.index + 1}</td>
                <td className="px-4 py-2">{buildLabel(e.row)}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.row.rechnungskuerzel ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {[e.row.plz, e.row.ort].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {e.row.ansprechpartner ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {e.warnings.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {e.warnings.join(", ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultPanel({
  results,
  summary,
  total,
}: {
  results: ResultEntry[];
  summary: { ok: number; skipped: number; error: number };
  total: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-sm">
        <span className="font-medium">Ergebnis</span>
        <span className="text-muted-foreground">{results.length}/{total}</span>
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> {summary.ok} angelegt
        </span>
        <span className="inline-flex items-center gap-1 text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" /> {summary.skipped} übersprungen
        </span>
        <span className="inline-flex items-center gap-1 text-destructive">
          <XCircle className="h-3.5 w-3.5" /> {summary.error} Fehler
        </span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {results.map((r) => (
          <li key={r.index} className="flex flex-wrap items-start gap-2 px-4 py-2">
            <span className="text-muted-foreground">#{r.index + 1}</span>
            <span className="font-medium">{r.label}</span>
            {r.kuerzel && <span className="font-mono text-xs text-muted-foreground">{r.kuerzel}</span>}
            <span className="ml-auto">
              {r.status === "ok" && (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> angelegt
                </span>
              )}
              {r.status === "skipped" && (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> übersprungen
                </span>
              )}
              {r.status === "error" && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> Fehler
                </span>
              )}
            </span>
            {r.message && (
              <div className="w-full pl-6 text-xs text-muted-foreground">{r.message}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return "Kürzel bereits vergeben";
    return `${e.status}: ${e.message}`;
  }
  return e instanceof Error ? e.message : "Unbekannter Fehler";
}