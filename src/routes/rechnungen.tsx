import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { CheckCircle2, Trash2, ChevronRight, Mail } from "lucide-react";
import { PdfViewButton } from "@/components/pdf/PdfViewButton";
import { Button } from "@/components/ui/button";
import { useRechnungen, useDeleteRechnung, useKunde } from "@/hooks/useApi";
import { useRechnungPdf } from "@/hooks/useBelegPdf";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { formatEUR, formatDate } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";
import { SlideOver } from "@/components/ui/slide-over";
import { MobileListCard } from "@/components/ui/mobile-list-card";
import { RechnungForm } from "@/components/forms/RechnungForm";
import { ZahlungErfassenDialog } from "@/components/forms/ZahlungErfassenDialog";
import { useConfirm } from "@/hooks/useConfirm";
import { FlowBar } from "@/components/flow/FlowBar";
import { rechnungFlow } from "@/lib/flow/flows";
import type { Rechnung } from "@/lib/api/types";

export const Route = createFileRoute("/rechnungen")({ component: Layout });

function Layout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (path !== "/rechnungen") return <Outlet />;
  return <Page />;
}

const statusLabel: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  teilbezahlt: "Teilbez.",
  bezahlt: "Bezahlt",
  ueberfaellig: "Überfällig",
  storniert: "Storniert",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    entwurf: "bg-muted text-foreground/70 border-border",
    versendet: "bg-primary/10 text-primary border-primary/20",
    teilbezahlt: "bg-warning/10 text-warning border-warning/20",
    bezahlt: "bg-success/10 text-success border-success/20",
    ueberfaellig: "bg-destructive/10 text-destructive border-destructive/20",
    storniert: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.entwurf}`}
    >
      {statusLabel[status] ?? status}
    </span>
  );
}

function brutto(r: Rechnung) {
  return (
    r.positionen.reduce((a, p) => a + p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100), 0) *
    (1 + r.steuersatz / 100)
  );
}
function bezahlt(r: Rechnung) {
  return r.zahlungen.reduce((a, z) => a + z.betrag, 0);
}

function Page() {
  const { data: alle = [] } = useRechnungen();
  const navigate = useNavigate();
  const del = useDeleteRechnung();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [zahlungFuer, setZahlungFuer] = useState<Rechnung | null>(null);
  const [emailFuer, setEmailFuer] = useState<Rechnung | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const heute = new Date().toISOString().slice(0, 10);
  const monat = heute.slice(0, 7);

  const counts = useMemo(() => {
    const offen = alle.filter((r) => r.status !== "bezahlt" && r.status !== "storniert");
    const ueberfaellig = alle.filter((r) => r.status === "ueberfaellig" || (r.faelligkeitsdatum < heute && r.status !== "bezahlt" && r.status !== "storniert"));
    return {
      offenSumme: offen.reduce((a, r) => a + brutto(r) - bezahlt(r), 0),
      offenAnzahl: offen.length,
      ueberSumme: ueberfaellig.reduce((a, r) => a + brutto(r) - bezahlt(r), 0),
      ueberAnzahl: ueberfaellig.length,
      eingangMonat: alle
        .flatMap((r) => r.zahlungen.filter((z) => z.datum.startsWith(monat)))
        .reduce((a, z) => a + z.betrag, 0),
      gesamt: alle.length,
    };
  }, [alle, heute, monat]);

  const filtered = useMemo(() => {
    let list = alle;
    if (filter !== "alle") {
      if (filter === "teilbezahlt") list = list.filter((r) => r.status === "teilbezahlt");
      else list = list.filter((r) => r.status === filter);
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((r) => r.nummer.toLowerCase().includes(t) || r.titel.toLowerCase().includes(t));
    }
    return [...list].sort((a, b) => b.rechnungsdatum.localeCompare(a.rechnungsdatum));
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen"
        subtitle="Rechnungen erstellen, Zahlungen erfassen, Mahnungen senden."
        actions={
          <PrimaryAction onClick={() => setOpen(true)} label="Neue Rechnung" />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Offene Posten"
          value={formatEUR(counts.offenSumme)}
          sublabel={`${counts.offenAnzahl} Rechnung(en)`}
          tone="primary"
        />
        <KpiCard
          label="Überfällig"
          value={formatEUR(counts.ueberSumme)}
          sublabel={`${counts.ueberAnzahl} Rechnung(en)`}
          tone="danger"
        />
        <KpiCard
          label="Eingang diesen Monat"
          value={formatEUR(counts.eingangMonat)}
          sublabel="Bezahlt im Monat"
          tone="success"
        />
        <KpiCard label="Gesamt" value={counts.gesamt} sublabel="Alle Rechnungen" />
      </div>

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle" },
          { value: "entwurf", label: "Entwurf" },
          { value: "versendet", label: "Versendet" },
          { value: "teilbezahlt", label: "Teilbez." },
          { value: "ueberfaellig", label: "Überfällig" },
          { value: "bezahlt", label: "Bezahlt" },
        ]}
        placeholder="Suche nach Nummer, Titel, Kunde…"
      />

      {/* Mobil: Card-View */}
      <div className="space-y-2 md:hidden">
        {filtered.map((r) => {
          const b = brutto(r);
          const bez = bezahlt(r);
          const offen = b - bez;
          const tageUeber =
            r.status !== "bezahlt" && r.status !== "storniert" && r.faelligkeitsdatum < heute
              ? Math.floor((Date.parse(heute) - Date.parse(r.faelligkeitsdatum)) / 86400000)
              : 0;
          const letzteZahlung = r.zahlungen.length > 0
            ? r.zahlungen.reduce((max, z) => (z.datum > max ? z.datum : max), r.zahlungen[0].datum)
            : null;
          return (
            <MobileListCard
              key={r.id}
              onClick={() => navigate({ to: "/rechnungen/$id", params: { id: r.id } })}
              title={r.titel}
              meta={
                <>
                  <span className="font-mono">{r.nummer}</span>
                  <span>· {formatDate(r.rechnungsdatum)}</span>
                  <span>· fällig {formatDate(r.faelligkeitsdatum)}</span>
                </>
              }
              trailing={
                <div>
                  <div>{formatEUR(b)}</div>
                  {r.status === "bezahlt" && letzteZahlung && (
                    <div className="text-[10px] font-normal text-success">
                      ✓ bezahlt {formatDate(letzteZahlung)}
                    </div>
                  )}
                  {r.status === "teilbezahlt" && (
                    <div className="text-[10px] font-normal text-warning">
                      {formatEUR(bez)} von {formatEUR(b)}
                    </div>
                  )}
                  {tageUeber > 0 && r.status !== "bezahlt" && (
                    <div className="text-[10px] font-normal text-destructive">
                      überfällig seit {tageUeber} {tageUeber === 1 ? "Tag" : "Tagen"}
                    </div>
                  )}
                  {offen > 0 && r.status !== "teilbezahlt" && tageUeber === 0 && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      offen {formatEUR(offen)}
                    </div>
                  )}
                </div>
              }
              badge={statusBadge(r.status)}
              footer={<FlowBar steps={rechnungFlow(r).steps} size="sm" />}
              actions={
                <>
                  <PdfViewButton kind="rechnung" beleg={r} />
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEmailFuer(r); }}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Per E-Mail versenden"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                  {r.status !== "bezahlt" && r.status !== "storniert" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setZahlungFuer(r); }}
                      className="rounded-md p-2 text-success hover:bg-success/10"
                      title="Zahlung erfassen"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      confirm(
                        {
                          title: "Rechnung löschen?",
                          description: `Rechnung ${r.nummer} dauerhaft entfernen.`,
                          variant: "destructive",
                          confirmLabel: "Löschen",
                        },
                        () => del.mutate(r.id),
                      )
                    }
                    className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              }
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Keine Rechnungen gefunden.
          </div>
        )}
      </div>

      {/* Desktop: Tabelle */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nummer</th>
              <th className="px-4 py-3 font-medium">Kunde</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Fällig</th>
              <th className="px-4 py-3 text-right font-medium">Brutto</th>
              <th className="px-4 py-3 text-right font-medium">Offen</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Fortschritt</th>
              <th className="px-4 py-3 text-right font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const b = brutto(r);
              const offen = b - bezahlt(r);
              const tageUeber =
                r.status !== "bezahlt" && r.status !== "storniert" && r.faelligkeitsdatum < heute
                  ? Math.floor((Date.parse(heute) - Date.parse(r.faelligkeitsdatum)) / 86400000)
                  : 0;
              return (
                <tr
                  key={r.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate({ to: "/rechnungen/$id", params: { id: r.id } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate({ to: "/rechnungen/$id", params: { id: r.id } });
                    }
                  }}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.nummer}</td>
                  <td className="px-4 py-3 font-medium">{r.titel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.rechnungsdatum)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.faelligkeitsdatum)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatEUR(b)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${tageUeber > 0 ? "text-destructive" : r.status === "bezahlt" ? "text-success" : ""}`}>
                    {r.status === "bezahlt" ? (
                      <span className="inline-flex items-center gap-1 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> bezahlt</span>
                    ) : (
                      <>
                        {formatEUR(offen)}
                        {tageUeber > 0 && (
                          <div className="text-[10px] font-normal">+{tageUeber}d</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                  <td className="px-4 py-3">
                    <FlowBar steps={rechnungFlow(r).steps} size="sm" />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <PdfViewButton kind="rechnung" beleg={r} />
                      <button
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEmailFuer(r); }}
                        className="rounded-md p-1.5 hover:bg-muted hover:text-primary"
                        title="Per E-Mail versenden"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      {r.status !== "bezahlt" && r.status !== "storniert" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setZahlungFuer(r); }}
                          className="rounded-md p-1.5 text-success hover:bg-success/10"
                          title="Zahlung erfassen"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          confirm(
                            {
                              title: "Rechnung löschen?",
                              description: `Rechnung ${r.nummer} dauerhaft entfernen. Erfasste Zahlungen gehen verloren.`,
                              variant: "destructive",
                              confirmLabel: "Löschen",
                            },
                            () => del.mutate(r.id),
                          )
                        }
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Keine Rechnungen gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <SlideOver
        open={open}
        onOpenChange={setOpen}
        title="Neue Rechnung"
        description="Positionen, Fristen und Optionen erfassen — wird sofort als Entwurf gespeichert."
      >
        <RechnungForm onClose={() => setOpen(false)} />
      </SlideOver>

      {zahlungFuer && (
        <ZahlungErfassenDialog
          open={!!zahlungFuer}
          onOpenChange={(o) => !o && setZahlungFuer(null)}
          rechnung={zahlungFuer}
        />
      )}

      {emailFuer && (
        <RechnungEmailLauncher
          rechnung={emailFuer}
          onClose={() => setEmailFuer(null)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function RechnungEmailLauncher({ rechnung, onClose }: { rechnung: Rechnung; onClose: () => void }) {
  const { data: kunde } = useKunde(rechnung.kundeId);
  const pdf = useRechnungPdf(rechnung);
  return (
    <EmailVersandDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      kontext="rechnung"
      kunde={kunde}
      rechnung={rechnung}
      pdfBlobUrl={pdf.url}
      pdfDateiname={`${rechnung.nummer}.pdf`}
      pdfStatus={pdf.status}
    />
  );
}
