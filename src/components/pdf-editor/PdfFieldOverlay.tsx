// Klickbare Hotspot-Layer über einer einzelnen PDF-Seite.
// Erwartet Hotspots bereits seitenrelativ in PDF-Punkten und skaliert auf die
// gerenderte CSS-Pixelbreite. Hover zeichnet eine saubere Box-Umrandung
// (mit kleinem Außenversatz) — nicht eng am Text.

import { Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RuntimeHotspot } from "@/lib/pdf/hotspotTracker";
import { metaForId } from "@/lib/pdf/fieldMap";

interface Props {
  hotspots: RuntimeHotspot[];
  /** Skalierungsfaktor von PDF-Punkten zu CSS-Pixeln (renderWidth / pageWidthPt) */
  scale: number;
  /** ID des aktuell offenen Hotspots (nur einer offen pro Editor) */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** Inline-Editor, gerendert im Popover-Inhalt für den offenen Hotspot. */
  renderEditor: (fieldId: string, close: () => void) => React.ReactNode;
}

export function PdfFieldOverlay({ hotspots, scale, openId, onOpenChange, renderEditor }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {hotspots.map((h) => {
        const meta = metaForId(h.id);
        const isOpen = openId === h.id;
        return (
          <Popover
            key={h.id}
            open={isOpen}
            onOpenChange={(o) => onOpenChange(o ? h.id : null)}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Bearbeiten: ${meta.label}`}
                title={`Bearbeiten: ${meta.label}`}
                className={`pointer-events-auto group absolute flex items-start justify-end rounded-md border-2 transition ${
                  isOpen
                    ? "border-primary bg-primary/10 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
                    : "border-transparent hover:border-dashed hover:border-primary/70 hover:bg-primary/5 focus-visible:border-primary"
                }`}
                style={{
                  // 4 px Außenversatz, damit die Border um die Box liegt, nicht am Glyph
                  left: `${h.x * scale - 4}px`,
                  top: `${h.y * scale - 4}px`,
                  width: `${h.w * scale + 8}px`,
                  height: `${h.h * scale + 8}px`,
                }}
              >
                <span className="pointer-events-none m-1 hidden items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm group-hover:inline-flex group-focus-visible:inline-flex">
                  <Pencil className="h-2.5 w-2.5" />
                  {meta.label}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              collisionPadding={12}
              className="z-50 w-auto p-3"
            >
              {renderEditor(h.id, () => onOpenChange(null))}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
