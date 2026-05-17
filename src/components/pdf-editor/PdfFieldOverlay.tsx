// Klickbare Hotspot-Layer über einer einzelnen PDF-Seite.
// Erwartet Hotspots bereits seitenrelativ in PDF-Punkten und skaliert auf die
// gerenderte CSS-Pixelbreite. Hover zeichnet eine saubere Box-Umrandung
// (mit kleinem Außenversatz) — nicht eng am Text.

import { useState, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RuntimeHotspot } from "@/lib/pdf/hotspotTracker";
import { metaForId as defaultMetaForId } from "@/lib/pdf/fieldMap";

export interface RowAction {
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDuplicate: (id: string) => void;
  onInsertBelow: (id: string) => void;
  onDelete: (id: string) => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
}

export interface TableAction {
  onAddRow: () => void;
  onAddStundenRow: () => void;
  onAddPauschalRow: () => void;
}

interface Props {
  hotspots: RuntimeHotspot[];
  /** Skalierungsfaktor von PDF-Punkten zu CSS-Pixeln (renderWidth / pageWidthPt) */
  scale: number;
  /** ID des aktuell offenen Hotspots (nur einer offen pro Editor) */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** Inline-Editor, gerendert im Popover-Inhalt für den offenen Hotspot. */
  renderEditor: (fieldId: string, close: () => void) => React.ReactNode;
  /** Optional: alternative Lookup-Funktion (z. B. für Protokolle). */
  metaForId?: (id: string) => { label: string };
  /** Aktionen für `pos:`-Zeilen (rauf/runter/dup/ins/del). Optional. */
  rowActions?: RowAction;
  /** Aktionen für den `tabelle`-Hotspot (neue Zeile etc.). Optional. */
  tableActions?: TableAction;
}

export function PdfFieldOverlay({
  hotspots,
  scale,
  openId,
  onOpenChange,
  renderEditor,
  metaForId,
  rowActions,
  tableActions,
}: Props) {
  const lookup = metaForId ?? defaultMetaForId;
  return (
    <div className="pointer-events-none absolute inset-0">
      {hotspots.map((h) => {
        const meta = lookup(h.id);
        const isOpen = openId === h.id;
        const isRow = h.id.startsWith("pos:");
        const isTable = h.id === "tabelle";
        const rowId = isRow ? h.id.slice(4) : "";

        // Tabellen-Hotspot: kein Popover, nur Top-Toolbar beim Hover.
        if (isTable && tableActions) {
          return (
            <div
              key={h.id}
              className="group pointer-events-auto absolute rounded-md border-2 border-transparent transition hover:border-dashed hover:border-primary/40 hover:bg-primary/5"
              style={{
                left: `${h.x * scale - 4}px`,
                top: `${h.y * scale - 4}px`,
                width: `${h.w * scale + 8}px`,
                height: `${h.h * scale + 8}px`,
              }}
            >
              <div className="pointer-events-none absolute -top-3 right-2 flex items-center gap-1 rounded-full bg-background px-1 py-0.5 opacity-0 shadow-md ring-1 ring-border transition group-hover:pointer-events-auto group-hover:opacity-100">
                <ToolbarButton
                  label="Neue Zeile"
                  onClick={(e) => {
                    e.stopPropagation();
                    tableActions.onAddRow();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium">Zeile</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Stunden-Zeile"
                  onClick={(e) => {
                    e.stopPropagation();
                    tableActions.onAddStundenRow();
                  }}
                >
                  <span className="text-[10px] font-medium">+ Std</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Pauschal-Zeile"
                  onClick={(e) => {
                    e.stopPropagation();
                    tableActions.onAddPauschalRow();
                  }}
                >
                  <span className="text-[10px] font-medium">+ Pauschal</span>
                </ToolbarButton>
              </div>
            </div>
          );
        }

        return (
          <Popover key={h.id} open={isOpen} onOpenChange={(o) => onOpenChange(o ? h.id : null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Bearbeiten: ${meta.label}`}
                title={`Bearbeiten: ${meta.label}`}
                className={`pointer-events-auto group absolute flex items-start justify-end rounded-md border-2 transition ${
                  isOpen
                    ? "border-primary bg-primary/10 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
                    : isRow
                      ? "border-transparent hover:border-l-4 hover:border-l-primary hover:bg-primary/5 focus-visible:border-primary"
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
                {isRow && rowActions && !isOpen && (
                  <RowHoverToolbar
                    rowId={rowId}
                    rowActions={rowActions}
                  />
                )}
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

function ToolbarButton({
  children,
  onClick,
  label,
  destructive = false,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-1 transition hover:bg-muted ${
        destructive ? "text-destructive hover:bg-destructive/10" : "text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function RowHoverToolbar({
  rowId,
  rowActions,
}: {
  rowId: string;
  rowActions: RowAction;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const armDelete = (e: React.MouseEvent) => {
    stop(e);
    if (confirmDelete) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirmDelete(false);
      rowActions.onDelete(rowId);
      return;
    }
    setConfirmDelete(true);
    timerRef.current = setTimeout(() => setConfirmDelete(false), 2000);
  };
  return (
    <div
      className="pointer-events-auto absolute -right-1 top-1/2 hidden -translate-y-1/2 translate-x-full items-center gap-0.5 rounded-full bg-background px-1 py-0.5 shadow-md ring-1 ring-border group-hover:flex"
      onMouseDown={stop}
    >
      <ToolbarButton
        label="Nach oben"
        onClick={(e) => {
          stop(e);
          rowActions.onMoveUp(rowId);
        }}
      >
        <ArrowUp className="h-3 w-3" />
      </ToolbarButton>
      <ToolbarButton
        label="Nach unten"
        onClick={(e) => {
          stop(e);
          rowActions.onMoveDown(rowId);
        }}
      >
        <ArrowDown className="h-3 w-3" />
      </ToolbarButton>
      <ToolbarButton
        label="Zeile darunter einfügen"
        onClick={(e) => {
          stop(e);
          rowActions.onInsertBelow(rowId);
        }}
      >
        <Plus className="h-3 w-3" />
      </ToolbarButton>
      <ToolbarButton
        label="Duplizieren"
        onClick={(e) => {
          stop(e);
          rowActions.onDuplicate(rowId);
        }}
      >
        <Copy className="h-3 w-3" />
      </ToolbarButton>
      <ToolbarButton label={confirmDelete ? "Wirklich löschen?" : "Löschen"} onClick={armDelete} destructive>
        {confirmDelete ? (
          <span className="text-[10px] font-semibold">Sicher?</span>
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </ToolbarButton>
    </div>
  );
}
