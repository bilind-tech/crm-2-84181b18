import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, Mail, Trash2, ChevronRight, SlidersHorizontal, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PdfViewButton } from "@/components/pdf/PdfViewButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAngebote, useDeleteAngebot, useKunde, useUpdateAngebot, useRechnungen } from "@/hooks/useApi";
import { toast } from "sonner";
import { useAngebotPdf } from "@/hooks/useBelegPdf";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { formatEUR, formatDate } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { SlideOver } from "@/components/ui/slide-over";
import { MobileListCard } from "@/components/ui/mobile-list-card";
import { AngebotForm } from "@/components/forms/AngebotForm";
import { FlowBar } from "@/components/flow/FlowBar";
import { angebotFlow } from "@/lib/flow/flows";
import {
  ZeitraumFilter,
  ZEITRAUM_ALLE,
  passtInZeitraum,
  type ZeitraumState,
} from "@/components/filters/ZeitraumFilter";
import type { Angebot } from "@/lib/api/types";
import { useConfirm } from "@/hooks/useConfirm";

export const Route = createFileRoute("/angebote")({ component: Layout });

function Layout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (path !== "/angebote") return <Outlet />;
  return <Page />;
}

const statusLabel: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  abgelaufen: "Abgelaufen",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    entwurf: "bg-muted text-foreground/70 border-border",
    versendet: "bg-primary/10 text-primary border-primary/20",
    angenommen: "bg-success/10 text-success border-success/20",
    abgelehnt: "bg-destructive/10 text-destructive border-destructive/20",
    abgelaufen: "bg-warning/10 text-warning border-warning/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.entwurf}`}
    >
      {statusLabel[status] ?? status}
    </span>
  );
}

function summe(a: Angebot) {
  return (
    a.positionen.reduce((acc, p) => acc + p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100), 0) *
    (1 + a.steuersatz / 100)
  );
}

function Page() {
  const { data: alle = [] } = useAngebote();
  const { data: alleRechnungen = [] } = useRechnungen();
  const navigate = useNavigate();
  const del = useDeleteAngebot();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const angebotMitRechnung = useMemo(
    () => new Set(alleRechnungen.map((r) => r.quellAngebotId).filter(Boolean) as string[]),
    [alleRechnungen],
  );
  const [filter, setFilter] = useState<string>("alle");
  const [q, setQ] = useState("");
  const [zeitraum, setZeitraum] = useState<ZeitraumState>(ZEITRAUM_ALLE);
  const [open, setOpen] = useState(false);
  const [emailFuer, setEmailFuer] = useState<Angebot | null>(null);

  const counts = useMemo(
    () => ({
      gesamt: alle.length,
      entwurf: alle.filter((a) => a.status === "entwurf").length,
      versendet: alle.filter((a) => a.status === "versendet").length,
      angenommen: alle.filter((a) => a.status === "angenommen").length,
      offenesVolumen: alle
        .filter((a) => a.status === "entwurf" || a.status === "versendet")
        .reduce((acc, a) => acc + summe(a), 0),
    }),
    [alle]
  );

  const filtered = useMemo(() => {
    let list = alle;
    if (filter !== "alle") list = list.filter((a) => a.status === filter);
    list = list.filter((a) => passtInZeitraum(a.erstelltAm, zeitraum));
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (a) => a.nummer.toLowerCase().includes(t) || a.titel.toLowerCase().includes(t)
      );
    }
    return [...list].sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm));
  }, [alle, filter, q, zeitraum]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Angebote"
        subtitle="Angebote erstellen, versenden und nachverfolgen."
        actions={
          <PrimaryAction onClick={() => setOpen(true)} label="Neues Angebot" />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Entwürfe" value={counts.entwurf} />
        <KpiCard label="Versendet" value={counts.versendet} />
        <KpiCard label="Offenes Volumen" value={formatEUR(counts.offenesVolumen)} tone="success" />
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
          { value: "angenommen", label: "Angenommen" },
        ]}
        placeholder="Suche nach Nummer, Titel, Kunde…"
      />

      <ZeitraumFilter
        value={zeitraum}
        onChange={setZeitraum}
        verfuegbareDaten={alle.map((a) => a.erstelltAm)}
      />

      {/* Mobil: Card-View */}
      <div className="space-y-2 md:hidden">
        {filtered.map((a) => (
          <MobileListCard
            key={a.id}
            onClick={() => navigate({ to: "/angebote/$id", params: { id: a.id } })}
            title={a.titel}
            meta={
              <>
                <span className="font-mono">{a.nummer}</span>
                <span>· gültig bis {formatDate(a.gueltigBis)}</span>
              </>
            }
            trailing={formatEUR(summe(a))}
            badge={statusBadge(a.status)}
            footer={<FlowBar steps={angebotFlow(a, angebotMitRechnung.has(a.id)).steps} size="sm" />}
            actions={
              <>
                <AngebotAnnahmeButtons angebot={a} />
                <PdfViewButton kind="angebot" beleg={a} />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEmailFuer(a); }}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-primary"
                  title="Per E-Mail versenden"
                >
                  <Mail className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    confirm(
                      {
                        title: "Angebot löschen?",
                        description: `Angebot ${a.nummer} dauerhaft entfernen.`,
                        variant: "destructive",
                        confirmLabel: "Löschen",
                      },
                      () => del.mutate(a.id),
                    )
                  }
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            }
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Keine Angebote gefunden.
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
              <th className="px-4 py-3 font-medium">Titel</th>
              <th className="px-4 py-3 font-medium">Kunde</th>
              <th className="px-4 py-3 font-medium">Gültig bis</th>
              <th className="px-4 py-3 text-right font-medium">Summe</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Fortschritt</th>
              <th className="px-4 py-3 text-right font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr
                key={a.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate({ to: "/angebote/$id", params: { id: a.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate({ to: "/angebote/$id", params: { id: a.id } });
                  }
                }}
                className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
              >
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.nummer}</td>
                <td className="px-4 py-3 font-medium">{a.titel}</td>
                <td className="px-4 py-3 text-muted-foreground">—</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(a.gueltigBis)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatEUR(summe(a))}</td>
                <td className="px-4 py-3">{statusBadge(a.status)}</td>
                <td className="px-4 py-3">
                  <FlowBar steps={angebotFlow(a, angebotMitRechnung.has(a.id)).steps} size="sm" />
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1 text-muted-foreground">
                    <AngebotAnnahmeButtons angebot={a} size="sm" />
                    <PdfViewButton kind="angebot" beleg={a} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEmailFuer(a); }}
                      className="rounded-md p-1.5 hover:bg-muted hover:text-primary"
                      title="Per E-Mail versenden"
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        confirm(
                          {
                            title: "Angebot löschen?",
                            description: `Angebot ${a.nummer} dauerhaft entfernen.`,
                            variant: "destructive",
                            confirmLabel: "Löschen",
                          },
                          () => del.mutate(a.id),
                        )
                      }
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Keine Angebote gefunden.
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
        title="Neues Angebot"
        description="Leistungen, Optionen und Texte erfassen — wird sofort als Entwurf gespeichert."
      >
        <AngebotForm onClose={() => setOpen(false)} />
      </SlideOver>

      {emailFuer && (
        <AngebotEmailLauncher
          angebot={emailFuer}
          onClose={() => setEmailFuer(null)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function AngebotEmailLauncher({ angebot, onClose }: { angebot: Angebot; onClose: () => void }) {
  const { data: kunde } = useKunde(angebot.kundeId);
  const pdf = useAngebotPdf(angebot);
  return (
    <EmailVersandDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      kontext="angebot"
      kunde={kunde}
      angebot={angebot}
      pdfBlobUrl={pdf.url}
      pdfDateiname={`${angebot.nummer}.pdf`}
      pdfStatus={pdf.status}
    />
  );
}

function AngebotAnnahmeButtons({ angebot, size = "md" }: { angebot: Angebot; size?: "sm" | "md" }) {
  const upd = useUpdateAngebot(angebot.id);
  if (angebot.status !== "versendet") return null;
  const setStatus = (s: "angenommen" | "abgelehnt", e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    upd.mutate(
      { status: s },
      {
        onSuccess: () =>
          toast.success(
            s === "angenommen"
              ? `Angebot ${angebot.nummer} als angenommen markiert`
              : `Angebot ${angebot.nummer} als abgelehnt markiert`,
          ),
      },
    );
  };
  const sm = size === "sm";
  const base = sm
    ? "h-8 px-2.5 text-xs gap-1"
    : "h-9 px-3 text-sm gap-1.5";
  return (
    <>
      <button
        type="button"
        onClick={(e) => setStatus("angenommen", e)}
        className={`inline-flex items-center rounded-md border border-success/30 bg-success/10 font-medium text-success hover:bg-success/20 ${base}`}
        title="Angebot wurde vom Kunden angenommen"
      >
        <ThumbsUp className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} />
        <span>Annehmen</span>
      </button>
      <button
        type="button"
        onClick={(e) => setStatus("abgelehnt", e)}
        className={`inline-flex items-center rounded-md border border-border bg-background font-medium text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive ${base}`}
        title="Angebot wurde vom Kunden abgelehnt"
      >
        <ThumbsDown className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} />
        <span>Ablehnen</span>
      </button>
    </>
  );
}

interface FilterBarProps {
  filter: string;
  setFilter: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  tabs: { value: string; label: string; count?: number }[];
  placeholder: string;
  extra?: React.ReactNode;
}

export function FilterBar(props: FilterBarProps) {
  return (
    <>
      {/* Mobile: kompakte Such-Leiste + Filter-Sheet */}
      <div className="md:hidden">
        <MobileFilterBar {...props} />
      </div>
      {/* Desktop/Tablet: Pillen-Leiste wie gehabt */}
      <div className="hidden md:block">
        <DesktopFilterBar {...props} />
      </div>
    </>
  );
}

function DesktopFilterBar({ filter, setFilter, q, setQ, tabs, placeholder, extra }: FilterBarProps) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === t.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {extra}
      <div className="relative ml-auto w-full min-w-0 flex-1 sm:w-auto">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-full rounded-full border-border bg-background pl-9"
        />
      </div>
    </div>
  );
}

function MobileFilterBar({ filter, setFilter, q, setQ, tabs, placeholder }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const aktiv = tabs.find((t) => t.value === filter);
  return (
    <>
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-xl border-border bg-card pl-9 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
          aria-label="Filter wählen"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="max-w-[7rem] truncate">{aktiv?.label ?? "Alle"}</span>
        </button>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t bg-background p-0"
        >
          <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="px-5 pb-2 pt-3 text-left">
            <SheetTitle className="text-base">Filter</SheetTitle>
          </SheetHeader>
          <div className="px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {tabs.map((t) => {
              const istAktiv = t.value === filter;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setFilter(t.value);
                    setSheetOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                    istAktiv ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      istAktiv ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {istAktiv && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 font-medium">{t.label}</span>
                  {typeof t.count === "number" && (
                    <span className="text-xs text-muted-foreground">{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
