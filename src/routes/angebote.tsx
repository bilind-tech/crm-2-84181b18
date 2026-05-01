import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, Eye, Send, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAngebote, useDeleteAngebot, useSendeAngebot } from "@/hooks/useApi";
import { formatEUR, formatDate } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { SlideOver } from "@/components/ui/slide-over";
import { AngebotForm } from "@/components/forms/AngebotForm";
import type { Angebot } from "@/lib/api/types";

export const Route = createFileRoute("/angebote")({ component: Page });

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
  const navigate = useNavigate();
  const del = useDeleteAngebot();
  const send = useSendeAngebot("");
  const [filter, setFilter] = useState<string>("alle");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

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
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (a) => a.nummer.toLowerCase().includes(t) || a.titel.toLowerCase().includes(t)
      );
    }
    return [...list].sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm));
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Angebote"
        title="Angebote"
        subtitle="Angebote erstellen, versenden und nachverfolgen."
        hint="Aus Angeboten lassen sich per Klick Rechnungen generieren."
        actions={
          <PrimaryAction onClick={() => setOpen(true)} label="Neues Angebot" />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nummer</th>
              <th className="px-4 py-3 font-medium">Titel</th>
              <th className="px-4 py-3 font-medium">Kunde</th>
              <th className="px-4 py-3 font-medium">Gültig bis</th>
              <th className="px-4 py-3 text-right font-medium">Summe</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1 text-muted-foreground">
                    <Link
                      to="/angebote/$id"
                      params={{ id: a.id }}
                      className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"
                      title="Ansehen"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => send.mutate()}
                      className="rounded-md p-1.5 hover:bg-muted hover:text-primary"
                      title="Senden"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Angebot ${a.nummer} löschen?`)) del.mutate(a.id);
                      }}
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
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Keine Angebote gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={open}
        onOpenChange={setOpen}
        title="Neues Angebot"
        description="Leistungen, Optionen und Texte erfassen — wird sofort als Entwurf gespeichert."
      >
        <AngebotForm onClose={() => setOpen(false)} />
      </SlideOver>
    </div>
  );
}

interface FilterBarProps {
  filter: string;
  setFilter: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  tabs: { value: string; label: string }[];
  placeholder: string;
  extra?: React.ReactNode;
}

export function FilterBar({ filter, setFilter, q, setQ, tabs, placeholder, extra }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex gap-1 rounded-full bg-muted p-1">
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
      <div className="relative ml-auto min-w-[200px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 rounded-full border-border bg-background pl-9"
        />
      </div>
    </div>
  );
}
