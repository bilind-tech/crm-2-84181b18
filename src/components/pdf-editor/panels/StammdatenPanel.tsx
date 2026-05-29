import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnsprechpartnerPicker } from "@/components/forms/AnsprechpartnerPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVertraege } from "@/hooks/useApi";
import type { Angebot, Rechnung, Kunde } from "@/lib/api/types";

interface Props {
  kind: "angebot" | "rechnung";
  draft: Angebot | Rechnung;
  kunde: Kunde;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (key: any, value: any) => void;
}

export function StammdatenPanel({ kind, draft, kunde, set }: Props) {
  const { data: vertraege = [] } = useVertraege(kind === "rechnung" ? kunde.id : "");
  return (
    <div className="space-y-5">
      <Section label="Empfänger" feldId="kunde">
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <p className="font-medium">
            {kunde.firmenname || `${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim() || "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[kunde.strasse, [kunde.plz, kunde.ort].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ") || "Keine Adresse hinterlegt"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Zum Ändern: Kundenstammdaten bearbeiten.
          </p>
        </div>
      </Section>

      <Section label="Ansprechpartner" feldId="ansprechpartner">
        <AnsprechpartnerPicker
          kundeId={kunde.id}
          value={draft.ansprechpartnerId}
          onChange={(id) => set("ansprechpartnerId", id)}
        />
      </Section>

      {kind === "rechnung" && vertraege.length > 0 && (
        <Section label="Vertragsbezug" feldId="vertrag">
          <Select
            value={(draft as Rechnung).vertragId ?? "__none__"}
            onValueChange={(v) => set("vertragId", v === "__none__" ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— ohne Vertragsbezug —</SelectItem>
              {vertraege.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {(v.bezeichnung || "Vertrag")} · ab {v.startDatum}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      )}

      <Section label="Titel" feldId="titel">
        <Input
          value={draft.titel}
          onChange={(e) => set("titel", e.target.value)}
          placeholder="z. B. Unterhaltsreinigung Hauptsitz"
        />
      </Section>

      <Section label="Meta-Daten" feldId="meta">
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "angebot" ? (
            <Field label="Gültig bis">
              <Input
                type="date"
                value={(draft as Angebot).gueltigBis ?? ""}
                onChange={(e) => set("gueltigBis", e.target.value || undefined)}
              />
            </Field>
          ) : (
            <>
              <Field label="Rechnungsdatum">
                <Input
                  type="date"
                  value={(draft as Rechnung).rechnungsdatum}
                  onChange={(e) => set("rechnungsdatum", e.target.value)}
                />
              </Field>
              <Field label="Fällig am">
                <Input
                  type="date"
                  value={(draft as Rechnung).faelligkeitsdatum}
                  onChange={(e) => set("faelligkeitsdatum", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      </Section>

      <Section label="Steuersatz & Rabatt" feldId="steuersatz">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="MwSt %">
            <Input
              type="number"
              inputMode="decimal"
              value={draft.steuersatz}
              onChange={(e) => set("steuersatz", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Gesamtrabatt %">
            <Input
              type="number"
              inputMode="decimal"
              value={draft.rabattGesamt}
              onChange={(e) => set("rabattGesamt", Number(e.target.value) || 0)}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function Section({
  label,
  feldId,
  children,
}: {
  label: string;
  feldId: string;
  children: React.ReactNode;
}) {
  return (
    <div data-feld-id={feldId} className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
