import { createFileRoute, Link } from "@tanstack/react-router";
import { DetailSkeleton } from "@/components/layout/DetailSkeleton";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { useState } from "react";
import { Pencil, Archive, Building2, Plus } from "lucide-react";
import { useKunde } from "@/hooks/useApi";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { SlideOver } from "@/components/ui/slide-over";
import { ObjektForm } from "@/components/forms/ObjektForm";
import { AnsprechpartnerTab } from "@/components/kunden/AnsprechpartnerTab";
import { AngebotForm } from "@/components/forms/AngebotForm";
import { RechnungForm } from "@/components/forms/RechnungForm";
import { KundeBearbeitenDialog } from "@/components/forms/KundeBearbeitenDialog";
import { formatEUR, formatDate } from "@/lib/format";
import { summenRechnung } from "@/lib/mock/backend";
import { FlowBar } from "@/components/flow/FlowBar";
import { angebotFlow, rechnungFlow } from "@/lib/flow/flows";

export const Route = createFileRoute("/kunden/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { data: k, isLoading } = useKunde(id);
  const [openObjekt, setOpenObjekt] = useState(false);
  const [openAngebot, setOpenAngebot] = useState(false);
  const [openRechnung, setOpenRechnung] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  if (isLoading) return <DetailSkeleton variant="kunde" />;
  if (!k) {
    return (
      <NotFoundState
        title="Kunde nicht gefunden"
        description="Dieser Kunde wurde gelöscht oder die Adresse ist ungültig."
        backTo="/kunden"
        backLabel="Zurück zur Kundenliste"
      />
    );
  }

  const fullName = k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim();
  const initialen =
    (k.firmenname ? k.firmenname.slice(0, 2) : `${(k.vorname ?? "")[0] ?? ""}${(k.nachname ?? "")[0] ?? ""}`)
      .toUpperCase()
      .slice(0, 2) || "K";

  const aktiveObjekte = k.objekte.filter((o) => o.status === "aktiv").length;

  const statusToneMap: Record<string, string> = {
    aktiv: "bg-success/10 text-success border-success/20",
    interessent: "bg-primary/10 text-primary border-primary/20",
    inaktiv: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName}
        subtitle={
          <>
            <span className="font-mono">{k.nummer}</span> ·{" "}
            {k.typ === "firma" ? "Firma" : "Privatkunde"}
          </>
        }
        actions={
          <>
            <Button variant="outline" className="rounded-lg" onClick={() => setOpenEdit(true)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Bearbeiten
            </Button>
            <Button variant="outline" className="rounded-lg">
              <Archive className="mr-1.5 h-4 w-4" /> Archivieren
            </Button>
          </>
        }
      />

      {/* Header card */}
      <div className="flex items-center gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid h-16 w-16 place-content-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
          {initialen}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{fullName}</h2>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusToneMap[k.status] ?? statusToneMap.aktiv}`}>
              {k.status}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" /> {aktiveObjekte} aktive {aktiveObjekte === 1 ? "Objekt" : "Objekte"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="uebersicht">
        <TabsList className="no-scrollbar flex h-11 w-full justify-start gap-1 overflow-x-auto rounded-full bg-muted p-1">
          <TabsTrigger value="uebersicht" className="shrink-0 rounded-full px-3 sm:px-5">Übersicht</TabsTrigger>
          <TabsTrigger value="ansprechpartner" className="shrink-0 rounded-full px-3 sm:px-5">
            Ansprechpartner ({k.ansprechpartner.length})
          </TabsTrigger>
          <TabsTrigger value="objekte" className="shrink-0 rounded-full px-3 sm:px-5">
            Objekte ({k.objekte.length})
          </TabsTrigger>
          <TabsTrigger value="angebote" className="shrink-0 rounded-full px-3 sm:px-5">
            Angebote ({k.angebote.length})
          </TabsTrigger>
          <TabsTrigger value="rechnungen" className="shrink-0 rounded-full px-3 sm:px-5">
            Rechnungen ({k.rechnungen.length})
          </TabsTrigger>
          <TabsTrigger value="belege" className="shrink-0 rounded-full px-3 sm:px-5">
            Belege ({k.dokumente.length})
          </TabsTrigger>
          <TabsTrigger value="notizen" className="shrink-0 rounded-full px-3 sm:px-5">
            Notizen ({k.notizen.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uebersicht" className="mt-6 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Stammdaten">
            <Row label="Kundennummer" value={k.nummer} mono />
            {k.kuerzel && <Row label="Kürzel" value={k.kuerzel} mono />}
            <Row label="Typ" value={k.typ === "firma" ? "Firma" : "Privat"} />
            {k.firmenname && <Row label="Firma" value={k.firmenname} />}
            {(k.vorname || k.nachname) && <Row label="Person" value={`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()} />}
            {k.email && <Row label="E-Mail" value={k.email} />}
            {k.telefon && <Row label="Telefon" value={k.telefon} />}
            {k.mobil && <Row label="Mobil" value={k.mobil} />}
            {k.webseite && <Row label="Webseite" value={k.webseite} />}
          </SectionCard>

          <SectionCard title="Adresse">
            <Row label="Straße" value={k.strasse ?? "—"} />
            <Row label="PLZ / Ort" value={`${k.plz ?? ""} ${k.ort ?? ""}`.trim() || "—"} />
            <Row label="Land" value={k.land ?? "Deutschland"} />
          </SectionCard>

          <SectionCard title="Steuer & Zahlung">
            <Row label="Zahlungsziel" value={`${k.zahlungszielTage} Tage`} />
            <Row label="Standard-Steuer" value={`${k.standardSteuersatz}%`} />
            <Row label="Standard-Rabatt" value={`${k.standardRabatt}%`} />
            {k.ustId && <Row label="USt-IdNr." value={k.ustId} />}
            {k.steuernummer && <Row label="Steuernummer" value={k.steuernummer} />}
          </SectionCard>

          <SectionCard title="Tags & Notizen">
            {k.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {k.tags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Tags.</p>
            )}
            {k.notizen ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{k.notizen}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Keine Notizen.</p>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="ansprechpartner" className="mt-6">
          <AnsprechpartnerTab kundeId={k.id} liste={k.ansprechpartner} />
        </TabsContent>

        <TabsContent value="objekte" className="mt-6 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setOpenObjekt(true)} variant="outline" className="rounded-full">
              <Plus className="mr-1 h-4 w-4" /> Neues Objekt
            </Button>
          </div>
          {k.objekte.length === 0 ? (
            <Empty text="Noch keine Objekte für diesen Kunden." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nummer</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Frequenz</th>
                    <th className="px-4 py-3 text-right font-medium">m²</th>
                  </tr>
                </thead>
                <tbody>
                  {k.objekte.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.nummer}</td>
                      <td className="px-4 py-3 font-medium">
                        <Link to="/objekte/$id" params={{ id: o.id }} className="hover:text-primary">{o.name}</Link>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{o.frequenz.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-right">{o.qmZuReinigen ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="angebote" className="mt-6 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setOpenAngebot(true)} variant="outline" className="rounded-full">
              <Plus className="mr-1 h-4 w-4" /> Neues Angebot
            </Button>
          </div>
          {k.angebote.length === 0 ? (
            <Empty text="Noch keine Angebote für diesen Kunden." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nummer</th>
                    <th className="px-4 py-3 font-medium">Titel</th>
                    <th className="px-4 py-3 font-medium">Gültig bis</th>
                    <th className="px-4 py-3 text-right font-medium">Brutto</th>
                    <th className="px-4 py-3 font-medium">Fortschritt</th>
                  </tr>
                </thead>
                <tbody>
                  {k.angebote.map((a) => {
                    const s = summenRechnung(a.positionen, a.rabattGesamt);
                    const hatRechnung = k.rechnungen.some((r) => r.quellAngebotId === a.id);
                    const flow = angebotFlow(a, hatRechnung);
                    return (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.nummer}</td>
                        <td className="px-4 py-3 font-medium">
                          <Link to="/angebote/$id" params={{ id: a.id }} className="hover:text-primary">{a.titel}</Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(a.gueltigBis)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatEUR(s.brutto)}</td>
                        <td className="px-4 py-3">
                          <FlowBar steps={flow.steps} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rechnungen" className="mt-6 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setOpenRechnung(true)} variant="outline" className="rounded-full">
              <Plus className="mr-1 h-4 w-4" /> Neue Rechnung
            </Button>
          </div>
          {k.rechnungen.length === 0 ? (
            <Empty text="Noch keine Rechnungen für diesen Kunden." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nummer</th>
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Fällig</th>
                    <th className="px-4 py-3 text-right font-medium">Brutto / Offen</th>
                    <th className="px-4 py-3 font-medium">Fortschritt</th>
                  </tr>
                </thead>
                <tbody>
                  {k.rechnungen.map((r) => {
                    const s = summenRechnung(r.positionen, r.rabattGesamt);
                    const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
                    const offen = Math.max(0, s.brutto - bezahlt);
                    const flow = rechnungFlow(r);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.nummer}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.rechnungsdatum)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.faelligkeitsdatum)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to="/rechnungen/$id" params={{ id: r.id }} className="font-semibold hover:text-primary">
                            {formatEUR(s.brutto)}
                          </Link>
                          {offen > 0 && offen < s.brutto && (
                            <div className="text-xs text-warning">{formatEUR(offen)} offen</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <FlowBar steps={flow.steps} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="belege" className="mt-6">
          {k.dokumente.length === 0 ? (
            <Empty text="Noch keine Belege/Dokumente." />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {k.dokumente.map((d) => (
                <li key={d.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{d.titel}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.dateiname} · {(d.groesseBytes / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{d.typ}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="notizen" className="mt-6">
          {k.notizen.length === 0 ? (
            <Empty text="Noch keine Notizen." />
          ) : (
            <ul className="space-y-3">
              {k.notizen.map((n) => (
                <li key={n.id} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-medium">{n.titel}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.inhalt}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <SlideOver open={openObjekt} onOpenChange={setOpenObjekt} title="Neues Objekt">
        <ObjektForm kompakt onClose={() => setOpenObjekt(false)} defaultKundeId={k.id} />
      </SlideOver>
      <SlideOver open={openAngebot} onOpenChange={setOpenAngebot} title="Neues Angebot" description={`Für ${fullName}`}>
        <AngebotForm onClose={() => setOpenAngebot(false)} defaultKundeId={k.id} />
      </SlideOver>
      <SlideOver open={openRechnung} onOpenChange={setOpenRechnung} title="Neue Rechnung" description={`Für ${fullName}`}>
        <RechnungForm onClose={() => setOpenRechnung(false)} defaultKundeId={k.id} />
      </SlideOver>
      <KundeBearbeitenDialog kunde={k} open={openEdit} onOpenChange={setOpenEdit} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
