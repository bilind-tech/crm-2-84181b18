import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Smartphone, Receipt, Image as ImageIcon, FileText } from "lucide-react";
import { useDokumente } from "@/hooks/useApi";
import { formatEUR } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { FilterBar } from "@/routes/angebote";
import { DokumentUploader } from "@/components/dokumente/DokumentUploader";
import { HandyScanDialog } from "@/components/dokumente/HandyScanDialog";

export const Route = createFileRoute("/dokumente")({ component: Page });

function Page() {
  const { data: alle = [] } = useDokumente();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const jahr = new Date().getFullYear();

  const counts = useMemo(() => {
    const steuer = alle.filter((d) => d.steuerrelevant && d.dokumentdatum?.startsWith(String(jahr)));
    return {
      gesamt: alle.length,
      quittungen: alle.filter((d) => d.typ === "beleg").length,
      steuerrelevant: steuer.length,
      summe: steuer.reduce((a, d) => a + (d.betrag ?? 0), 0),
    };
  }, [alle, jahr]);

  const filtered = useMemo(() => {
    let list = alle;
    if (filter === "quittungen") list = list.filter((d) => d.typ === "beleg");
    else if (filter === "steuer") list = list.filter((d) => d.steuerrelevant);
    else if (filter === "bilder") list = list.filter((d) => d.typ === "bild");
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (d) => d.titel.toLowerCase().includes(t) || d.dateiname.toLowerCase().includes(t),
      );
    }
    return [...list].sort(
      (a, b) => new Date(b.hochgeladenAm).getTime() - new Date(a.hochgeladenAm).getTime(),
    );
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente"
        subtitle="Quittungen, Rechnungen und steuerrelevante Belege zentral ablegen."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              <Smartphone className="h-4 w-4" />
              Vom Handy scannen
            </button>
            <DokumentUploader compact />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Dokumente gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Quittungen" value={counts.quittungen} tone="success" />
        <KpiCard label={`Steuerrelevant ${jahr}`} value={counts.steuerrelevant} tone="success" />
        <KpiCard label={`Brutto-Summe ${jahr}`} value={formatEUR(counts.summe)} tone="success" />
      </div>

      <DokumentUploader />

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle" },
          { value: "quittungen", label: "Quittungen" },
          { value: "bilder", label: "Bilder" },
          { value: "steuer", label: "Steuer" },
        ]}
        placeholder="Suche nach Titel, Dateiname…"
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold">Noch keine Dokumente</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Lade deine erste Quittung oder Rechnung oben per Drag & Drop hoch — oder scanne sie mit dem Handy.
          </p>
        </div>
      ) : (
        <>
          {/* Mobil: Karten-Liste */}
          <div className="grid gap-3 sm:hidden">
            {filtered.map((d) => (
              <DokumentCard key={d.id} d={d} />
            ))}
          </div>

          {/* Desktop: Tabelle */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Titel</th>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Datum</th>
                  <th className="px-4 py-3 font-medium">Quelle</th>
                  <th className="px-4 py-3 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {d.url && d.mimeType.startsWith("image/") ? (
                          <img
                            src={d.url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
                          />
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
                    <td className="px-4 py-3 text-muted-foreground">{d.dokumentdatum ?? "—"}</td>
                    <td className="px-4 py-3">
                      {d.quelle === "handy-scan" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Smartphone className="h-3 w-3" />
                          Handy
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Upload</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{d.betrag ? formatEUR(d.betrag) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HandyScanDialog open={scanOpen} onOpenChange={setScanOpen} />
    </div>
  );
}

function DokumentCard({ d }: { d: { id: string; titel: string; dateiname: string; url: string; mimeType: string; typ: string; dokumentdatum?: string; betrag?: number; quelle?: string } }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
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
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="capitalize text-muted-foreground">{d.typ}</span>
          {d.dokumentdatum && <span className="text-muted-foreground">· {d.dokumentdatum}</span>}
          {d.quelle === "handy-scan" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
              <Smartphone className="h-3 w-3" />
              Handy
            </span>
          )}
        </div>
      </div>
      {d.betrag ? <div className="text-right text-sm font-semibold">{formatEUR(d.betrag)}</div> : null}
    </div>
  );
}
