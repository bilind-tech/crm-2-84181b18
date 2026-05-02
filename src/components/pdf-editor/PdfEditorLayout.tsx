// 2-Spalten-Editor: links Live-Preview mit Click-to-Edit-Hotspots,
// rechts Editor-Panel mit Tabs. Mobile: gestapelt mit Vorschau/Bearbeiten-Toggle.

import { useState } from "react";
import { ArrowLeft, Download, Eye, Pencil, RotateCcw, Save, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Group, Panel, Separator } from "react-resizable-panels";
// react-resizable-panels v4 hat ungenaue Typings — Group nimmt `direction` zur Laufzeit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResizablePanelGroup = Group as any;
const ResizablePanel = Panel;
const PanelResizeHandle = Separator;
import { LivePdfPreview } from "./LivePdfPreview";
import { EditorPanel, type EditorTab } from "./EditorPanel";
import { useBelegEditor } from "@/hooks/useBelegEditor";
import type { Angebot, Rechnung, Kunde, Firmendaten, Ansprechpartner, BelegOptionen } from "@/lib/api/types";

type Props =
  | {
      kind: "angebot";
      beleg: Angebot;
      kunde: Kunde;
      firma: Firmendaten;
      ansprechpartner?: Ansprechpartner;
      backTo: { to: string; params?: Record<string, string> };
    }
  | {
      kind: "rechnung";
      beleg: Rechnung;
      kunde: Kunde;
      firma: Firmendaten;
      ansprechpartner?: Ansprechpartner;
      backTo: { to: string; params?: Record<string, string> };
    };

export function PdfEditorLayout(props: Props) {
  const { kind, beleg, kunde, firma, ansprechpartner, backTo } = props;
  const editor = useBelegEditor(kind, beleg);
  const [activeTab, setActiveTab] = useState<EditorTab>("stammdaten");
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");

  const titlePrefix = kind === "angebot" ? "Angebot" : "Rechnung";
  const draft = editor.draft;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHotspot = (h: any) => {
    setActiveTab(h.tab);
    setMobileView("editor");
    editor.focusField(h.fieldId);
  };

  const preview = (
    <LivePdfPreview
      kind={kind === "angebot" ? "angebot" : "rechnung"}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draft={draft as any}
      kunde={kunde}
      firma={firma}
      ansprechpartner={ansprechpartner}
      onHotspotClick={handleHotspot}
    />
  );

  const editorEl = (
    <EditorPanel
      kind={kind}
      draft={draft}
      kunde={kunde}
      firma={firma}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      set={editor.set}
      setOption={editor.setOption as (key: keyof BelegOptionen, value: unknown) => void}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-5 sm:py-3">
        <Button variant="ghost" size="sm" asChild className="rounded-full">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link to={backTo.to as any} params={backTo.params as any}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Zurück
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold sm:text-base">
            {titlePrefix} <span className="font-mono">{beleg.nummer}</span>
            <span className="ml-2 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {beleg.status}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{draft.titel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {editor.saving ? (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <Loader2 className="h-3 w-3 animate-spin" />
              Speichere…
            </span>
          ) : editor.isDirty ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">Ungespeicherte Änderungen</span>
          ) : (
            <span className="hidden text-xs text-muted-foreground sm:inline">Alles gespeichert</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={editor.discard}
            disabled={!editor.isDirty || editor.saving}
            className="rounded-full"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Verwerfen</span>
          </Button>
          <Button
            size="sm"
            onClick={() => void editor.save()}
            disabled={!editor.isDirty || editor.saving}
            className="rounded-full"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Speichern
          </Button>
        </div>
      </div>

      {/* Mobile Toggle */}
      <div className="flex items-center justify-center gap-1 border-b border-border bg-muted/30 p-1.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView("editor")}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            mobileView === "editor"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Bearbeiten
        </button>
        <button
          type="button"
          onClick={() => setMobileView("preview")}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            mobileView === "preview"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          Vorschau
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop: Resizable Split */}
        <div className="hidden h-full lg:block">
          <ResizablePanelGroup direction="horizontal" className="flex h-full w-full">
            <ResizablePanel defaultSize={55} minSize={30}>
              {preview}
            </ResizablePanel>
            <PanelResizeHandle className="relative w-px bg-border transition hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary" />
            <ResizablePanel defaultSize={45} minSize={30}>
              <div className="h-full bg-background">{editorEl}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Mobile/Tablet: Toggle */}
        <div className="h-full lg:hidden">
          {mobileView === "preview" ? (
            <div className="h-full">{preview}</div>
          ) : (
            <div className="h-full bg-background">{editorEl}</div>
          )}
        </div>
      </div>
    </div>
  );
}
