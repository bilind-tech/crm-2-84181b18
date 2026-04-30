import { createFileRoute } from "@tanstack/react-router";
import { Download, Send, FileCheck2 } from "lucide-react";
import { useAngebot, useSendeAngebot, useAngebotInRechnung } from "@/hooks/useApi";
import { useAngebotPdf } from "@/hooks/useBelegPdf";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatEUR, formatDate } from "@/lib/format";
import { summenRechnung } from "@/lib/mock/backend";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/angebote/$id")({ component: Page });

function Page() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: a } = useAngebot(id);
  const send = useSendeAngebot(id);
  const inRechnung = useAngebotInRechnung(id);
  const pdf = useAngebotPdf(a);

  if (!a) return <p className="text-sm text-muted-foreground">Lade …</p>;
  const s = summenRechnung(a.positionen, a.rabattGesamt);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/" className="flex items-center hover:text-foreground"><Home className="h-3.5 w-3.5" /></Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/angebote" className="hover:text-foreground">Angebote</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{a.nummer}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{a.titel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{a.nummer}</span> · Status <span className="capitalize">{a.status}</span>
            {a.gueltigBis ? ` · gültig bis ${formatDate(a.gueltigBis)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pdf.url && (
            <Button asChild variant="outline" className="rounded-full">
              <a href={pdf.url} download={`${a.nummer}.pdf`}>
                <Download className="mr-1.5 h-4 w-4" /> PDF herunterladen
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              send.mutate(undefined, {
                onSuccess: () => toast.success("Angebot versendet"),
              });
            }}
          >
            <Send className="mr-1.5 h-4 w-4" /> Senden
          </Button>
          <Button
            className="rounded-full"
            onClick={() => {
              inRechnung.mutate(undefined, {
                onSuccess: (r) => {
                  toast.success(`Rechnung ${r.nummer} erstellt`);
                  navigate({ to: "/rechnungen/$id", params: { id: r.id } });
                },
              });
            }}
          >
            <FileCheck2 className="mr-1.5 h-4 w-4" /> In Rechnung umwandeln
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Beträge</p>
            <Row label="Netto" value={formatEUR(s.netto)} />
            <Row label={`MwSt ${a.steuersatz}%`} value={formatEUR(s.steuer)} />
            <div className="my-2 h-px bg-border" />
            <Row label="Brutto" value={formatEUR(s.brutto)} bold />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Positionen</p>
            <ul className="space-y-2">
              {a.positionen.map((p, i) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {i + 1}. {p.beschreibung}
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {p.menge} × {formatEUR(p.einzelpreisNetto)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {a.optionen && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Optionen</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>{a.optionen.materialBereitgestellt ? "✓" : "✗"} Material bereitgestellt</li>
                <li>{a.optionen.standardAnschreiben ? "✓" : "✗"} Standard-Anschreiben</li>
                <li>{a.optionen.wiederkehrend ? "✓" : "✗"} Wiederkehrend</li>
              </ul>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm">
          {pdf.status === "loading" && (
            <div className="grid h-[800px] place-content-center text-sm text-muted-foreground">PDF wird erzeugt …</div>
          )}
          {pdf.status === "error" && (
            <div className="grid h-[800px] place-content-center px-6 text-center text-sm text-destructive">
              PDF konnte nicht erzeugt werden.<br />{pdf.error}
            </div>
          )}
          {pdf.url && (
            <iframe title="Angebot PDF" src={pdf.url} className="block h-[900px] w-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${bold ? "text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "text-lg font-semibold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}
