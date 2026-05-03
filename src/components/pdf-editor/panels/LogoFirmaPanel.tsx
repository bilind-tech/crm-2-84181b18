import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Angebot, Rechnung, Firmendaten, BelegOptionen } from "@/lib/api/types";

interface Props {
  draft: Angebot | Rechnung;
  firma: Firmendaten;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOption: (key: keyof BelegOptionen, value: any) => void;
}

const FIRMA_FIELDS: { key: keyof Firmendaten; label: string }[] = [
  { key: "firmenname", label: "Firmenname" },
  { key: "strasse", label: "Straße" },
  { key: "plz", label: "PLZ" },
  { key: "ort", label: "Ort" },
  { key: "telefon", label: "Telefon" },
  { key: "email", label: "E-Mail" },
  { key: "webseite", label: "Webseite" },
  { key: "ustId", label: "USt-IdNr." },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
  { key: "bankName", label: "Bank" },
  { key: "geschaeftsfuehrer", label: "Geschäftsführer" },
];

export function LogoFirmaPanel({ draft, firma, setOption }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const o = draft.optionen ?? {
    materialBereitgestellt: true,
    standardAnschreiben: true,
    wiederkehrend: false,
  };
  const logoOverride = o.logoOverride;
  const firmaOverride = o.firmaOverride ?? {};

  function onLogoFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setOption("logoOverride", reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function setFirmaField(key: keyof Firmendaten, value: string) {
    const next = { ...firmaOverride };
    if (value.trim() === "") {
      delete next[key];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = value;
    }
    setOption("firmaOverride", Object.keys(next).length === 0 ? undefined : next);
  }

  return (
    <div className="space-y-6">
      <div data-feld-id="logo" className="space-y-3">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Logo (nur für diesen Beleg)
        </Label>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="grid h-16 w-28 shrink-0 place-content-center overflow-hidden rounded bg-background ring-1 ring-border">
            {logoOverride ? (
              <img
                src={logoOverride}
                alt="Logo-Override"
                className="max-h-full max-w-full object-contain"
              />
            ) : firma.logoUrl ? (
              <img
                src={firma.logoUrl}
                alt="Standard-Logo"
                className="max-h-full max-w-full object-contain opacity-60"
              />
            ) : (
              <span className="text-[10px] text-muted-foreground">Kein Logo</span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onLogoFile(e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {logoOverride ? "Anderes Logo wählen" : "Eigenes Logo hochladen"}
            </Button>
            {logoOverride && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setOption("logoOverride", undefined)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Override entfernen
              </Button>
            )}
          </div>
        </div>
        {!logoOverride && (
          <p className="text-xs text-muted-foreground">
            Aktuell wird das Standard-Logo aus den{" "}
            <Link to="/einstellungen" className="text-primary hover:underline">
              Einstellungen
            </Link>{" "}
            verwendet.
          </p>
        )}
      </div>

      <div data-feld-id="firma.absender" className="space-y-3">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Firmendaten (nur für diesen Beleg überschreiben)
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIRMA_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                className="mt-1 h-9"
                value={(firmaOverride[f.key] as string | undefined) ?? ""}
                onChange={(e) => setFirmaField(f.key, e.target.value)}
                placeholder={(firma[f.key] as string | undefined) ?? ""}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Leere Felder = Standard aus Einstellungen wird benutzt. Wirkt nur auf dieses PDF.
        </p>
      </div>
    </div>
  );
}
