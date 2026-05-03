// Inline-Mini-Editor, der per Popover/Sheet direkt am Hotspot geöffnet wird.
// Schreibt live in den Draft (über die übergebenen Setter aus useBelegEditor).
// Komplexere Felder bekommen am Ende einen "Erweitert bearbeiten"-Button, der
// das passende Tab im rechten Panel öffnet.

import { useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Angebot, Rechnung, Position } from "@/lib/api/types";
import { metaForId } from "@/lib/pdf/fieldMap";

type Draft = Angebot | Rechnung;

interface Props {
  fieldId: string;
  draft: Draft;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (key: any, value: any) => void;
  onOpenAdvanced: () => void;
  onClose: () => void;
}

export function HotspotInlineEditor({ fieldId, draft, set, onOpenAdvanced, onClose }: Props) {
  const meta = metaForId(fieldId);
  const firstRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => firstRef.current?.focus());
  }, [fieldId]);

  const Header = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-foreground">{meta.label}</p>
      <button
        type="button"
        onClick={onOpenAdvanced}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
        Erweitert
      </button>
    </div>
  );

  // Positions-Zeile
  if (fieldId.startsWith("pos:")) {
    const posId = fieldId.slice(4);
    const idx = draft.positionen.findIndex((p) => p.id === posId);
    const pos = idx >= 0 ? draft.positionen[idx] : undefined;
    if (!pos) return null;
    const updatePos = (patch: Partial<Position>) => {
      const next = draft.positionen.slice();
      next[idx] = { ...pos, ...patch };
      set("positionen", next);
    };
    return (
      <div className="w-[320px]">
        {Header}
        <div className="space-y-2">
          <Textarea
            ref={firstRef as React.RefObject<HTMLTextAreaElement>}
            value={pos.beschreibung}
            onChange={(e) => updatePos({ beschreibung: e.target.value })}
            rows={3}
            placeholder="Beschreibung"
            className="resize-none text-sm"
          />
          {pos.modus === "pauschal" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Ausführung"
                value={pos.ausfuehrung ?? ""}
                onChange={(e) => updatePos({ ausfuehrung: e.target.value })}
                className="text-sm"
              />
              <Input
                type="number"
                placeholder="Pauschalpreis"
                value={pos.pauschalpreisNetto ?? 0}
                onChange={(e) => updatePos({ pauschalpreisNetto: Number(e.target.value) })}
                className="text-sm"
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder="Menge"
                value={pos.menge}
                onChange={(e) => updatePos({ menge: Number(e.target.value) })}
                className="text-sm"
              />
              <Input
                placeholder="Einheit"
                value={pos.einheit}
                onChange={(e) => updatePos({ einheit: e.target.value as Position["einheit"] })}
                className="text-sm"
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Einzelpreis"
                value={pos.einzelpreisNetto}
                onChange={(e) => updatePos({ einzelpreisNetto: Number(e.target.value) })}
                className="text-sm"
              />
            </div>
          )}
        </div>
        <FooterDone onClose={onClose} />
      </div>
    );
  }

  switch (fieldId) {
    case "titel":
      return (
        <div className="w-[320px]">
          {Header}
          <Input
            ref={firstRef as React.RefObject<HTMLInputElement>}
            value={draft.titel}
            onChange={(e) => set("titel", e.target.value)}
            placeholder="Titel"
            className="text-sm"
          />
          <FooterDone onClose={onClose} />
        </div>
      );
    case "intro":
      return (
        <div className="w-[360px]">
          {Header}
          <Textarea
            ref={firstRef as React.RefObject<HTMLTextAreaElement>}
            value={draft.optionen?.eigenesIntro ?? draft.introText ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              const opt = draft.optionen ?? {
                materialBereitgestellt: true,
                standardAnschreiben: true,
                wiederkehrend: false,
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              set("optionen", { ...opt, eigenesIntro: v } as any);
            }}
            rows={5}
            className="resize-none text-sm"
            placeholder="Einleitungstext"
          />
          <FooterDone onClose={onClose} />
        </div>
      );
    case "outro":
      return (
        <div className="w-[360px]">
          {Header}
          <Textarea
            ref={firstRef as React.RefObject<HTMLTextAreaElement>}
            value={draft.optionen?.eigenesOutro ?? draft.outroText ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              const opt = draft.optionen ?? {
                materialBereitgestellt: true,
                standardAnschreiben: true,
                wiederkehrend: false,
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              set("optionen", { ...opt, eigenesOutro: v } as any);
            }}
            rows={5}
            className="resize-none text-sm"
            placeholder="Schlusstext"
          />
          <FooterDone onClose={onClose} />
        </div>
      );
    default:
      // Komplexe / strukturierte Bereiche: nur Hinweis + direkter Sprung ins Tab.
      return (
        <div className="w-[280px]">
          {Header}
          <p className="text-xs text-muted-foreground">
            Dieser Bereich wird im rechten Editor strukturiert bearbeitet.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={onClose}>
              Schließen
            </Button>
            <Button size="sm" className="rounded-full" onClick={onOpenAdvanced}>
              <Pencil className="mr-1 h-3 w-3" />
              Bearbeiten
            </Button>
          </div>
        </div>
      );
  }
}

function FooterDone({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-2 flex justify-end">
      <Button size="sm" variant="ghost" className="rounded-full" onClick={onClose}>
        Fertig
      </Button>
    </div>
  );
}
