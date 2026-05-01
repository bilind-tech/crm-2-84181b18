import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Smartphone, Receipt, Image as ImageIcon, FileText, AlertTriangle } from "lucide-react";
import { useDokumente } from "@/hooks/useApi";
import { formatEUR, formatDate } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";
import { DokumentUploader } from "@/components/dokumente/DokumentUploader";
import { HandyScanDialog } from "@/components/dokumente/HandyScanDialog";
import { DokumentBearbeitenDialog } from "@/components/dokumente/DokumentBearbeitenDialog";
import { fristStatus, FRIST_LABEL, fristBadgeClass } from "@/lib/dokument/frist";
import type { Dokument } from "@/lib/api/types";

export const Route = createFileRoute("/dokumente")({ component: Page });

function Page() {
  const { data: alle = [] } = useDokumente();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<Dokument | null>(null);
  const jahr = new Date().getFullYear();

  const counts = useMemo(() => {
    const ueberfaellig = alle.filter((d) => fristStatus(d) === "ueberfaellig").length;
    const offen = alle.filter((d) => {
      const s = fristStatus(d);
      return s === "offen" || s === "bald" || s === "ueberfaellig";
    }).length;
    const steuer = alle.filter((d) => d.steuerrelevant && d.dokumentdatum?.startsWith(String(jahr)));
    return {
      gesamt: alle.length,
      offen,
      ueberfaellig,
      steuerrelevant: steuer.length,
      summe: steuer.reduce((a, d) => a + (d.betrag ?? 0), 0),
    };
  }, [alle, jahr]);

  const tabCounts = useMemo(() => ({
    alle: alle.length,
    offen: alle.filter((d) => {
      const s = fristStatus(d);
      return s === "offen" || s === "bald" || s === "ueberfaellig";
    }).length,
    ueberfaellig: alle.filter((d) => fristStatus(d) === "ueberfaellig").length,
    erledigt: alle.filter((d) => fristStatus(d) === "erledigt").length,
    bilder: alle.filter((d) => d.typ === "bild").length,
    steuer: alle.filter((d) => d.steuerrelevant).length,
  }), [alle]);

  const filtered = useMemo(() => {
    let list = alle;
    if (filter === "offen") {
      list = list.filter((d) => {
        const s = fristStatus(d);
        return s === "offen" || s === "bald" || s === "ueberfaellig";
      });
    } else if (filter === "ueberfaellig") {
      list = list.filter((d) => fristStatus(d) === "ueberfaellig");
    } else if (filter === "erledigt") {
      list = list.filter((d) => fristStatus(d) === "erledigt");
    } else if (filter === "bilder") {
      list = list.filter((d) => d.typ === "bild");
    } else if (filter === "steuer") {
      list = list.filter((d) => d.steuerrelevant);
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (d) => d.titel.toLowerCase().includes(t) || d.dateiname.toLowerCase().includes(t),
      );
    }
    return [...list].sort((a, b) => {
      // Überfällige zuerst, dann nach Frist, dann nach Hochgeladen-Datum
      const sa = fristStatus(a);
      const sb = fristStatus(b);
      const prio: Record<string, number> = { ueberfaellig: 0, bald: 1, offen: 2, ohne: 3, erledigt: 4 };
      if (prio[sa] !== prio[sb]) return prio[sa] - prio[sb];
      return new Date(b.hochgeladenAm).getTime() - new Date(a.hochgeladenAm).getTime();
    });
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente"
        subtitle="Quittungen, Rechnungen und Belege zentral ablegen — mit Frist und Erinnerung."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryAction
              icon={Smartphone}
              label="Vom Handy scannen"
              onClick={() => setScanOpen(true)}
            />
            <DokumentUploader compact />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Dokumente gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Offen" value={counts.offen} tone={counts.offen > 0 ? "warning" : "default"} />
        <KpiCard label="Überfällig" value={counts.ueberfaellig} tone={counts.ueberfaellig > 0 ? "danger" : "default"} />
        <KpiCard label={`Steuerrelevant ${jahr}`} value={counts.steuerrelevant} tone="success" sublabel={formatEUR(counts.summe)} />
      </div>

      <DokumentUploader />

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle", count: tabCounts.alle },
          { value: "offen", label: "Offen", count: tabCounts.offen },
          { value: "ueberfaellig", label: "Überfällig", count: tabCounts.ueberfaellig },
          { value: "erledigt", label: "Erledigt", count: tabCounts.erledigt },
          { value: "bilder", label: "Bilder", count: tabCounts.bilder },
          { value: "steuer", label: "Steuer", count: tabCounts.steuer },
        ]}
        placeholder="Suche nach Titel, Dateiname…"
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold">Keine Dokumente</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Lade dein erstes Dokument oben per Drag & Drop hoch — oder scanne es mit dem Handy.
          </p>
        </div>
      ) : (
        <>
          {/* Mobil: Karten-Liste */}
          <div className="grid gap-3 sm:hidden">
            {filtered.map((d) => (
              <DokumentCard key={d.id} d={d} onClick={() => setEditing(d)} />
            ))}
          </div>

          {/* Desktop: Tabelle */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Titel</th>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Frist</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const status = fristStatus(d);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setEditing(d)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {d.url && d.mimeType.startsWith("image/") ? (
                            <img src={d.url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              {d.typ === "bild" ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{d.titel}</p>
                            <p className="truncate text-xs text-muted-foreground">{d.dateiname}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{d.typ}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {d.faelligAm ? formatDate(d.faelligAm) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {status !== "ohne" && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${fristBadgeClass(status)}`}>
                            {status === "ueberfaellig" && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {FRIST_LABEL[status]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{d.betrag ? formatEUR(d.betrag) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HandyScanDialog open={scanOpen} onOpenChange={setScanOpen} />
      <DokumentBearbeitenDialog
        dokument={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </div>
  );
}

function DokumentCard({ d, onClick }: { d: Dokument; onClick: () => void }) {
  const status = fristStatus(d);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition active:bg-muted"
    >
      {d.url && d.mimeType.startsWith("image/") ? (
        <img src={d.url} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {d.typ === "bild" ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{d.titel}</p>
        <p className="truncate text-xs text-muted-foreground">{d.dateiname}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {status !== "ohne" && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${fristBadgeClass(status)}`}>
              {status === "ueberfaellig" && <AlertTriangle className="mr-0.5 h-3 w-3" />}
              {FRIST_LABEL[status]}
            </span>
          )}
          {d.faelligAm && status !== "erledigt" && (
            <span className="text-muted-foreground">bis {formatDate(d.faelligAm)}</span>
          )}
          {!d.faelligAm && d.dokumentdatum && (
            <span className="text-muted-foreground">{formatDate(d.dokumentdatum)}</span>
          )}
        </div>
      </div>
      {d.betrag ? <div className="text-right text-sm font-semibold">{formatEUR(d.betrag)}</div> : null}
    </button>
  );
}
