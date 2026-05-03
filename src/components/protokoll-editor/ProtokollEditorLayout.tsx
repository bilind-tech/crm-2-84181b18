// 2-Spalten-Editor für Protokolle: links Live-Preview, rechts Felder.
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, Loader2, Pencil, RotateCcw, Save } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ProtokollLivePreview } from "./ProtokollLivePreview";
import { UebergabePanel } from "./UebergabePanel";
import { SchluesselPanel } from "./SchluesselPanel";
import { useProtokollEditor } from "@/hooks/useProtokollEditor";
import { useAbschliessenProtokoll, useFirmendaten, useKunde, useObjekte } from "@/hooks/useApi";
import { generateProtokollPdf, protokollDateiname, protokollTitel } from "@/lib/pdf/werkzeugePdf";
import { blobToDataUrl } from "@/lib/dokumente/blobToDataUrl";
import type { Protokoll, UebergabeProtokoll, SchluesselProtokoll } from "@/lib/api/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResizablePanelGroup = Group as any;
const ResizablePanel = Panel;
const PanelResizeHandle = Separator;

interface Props {
  protokoll: Protokoll;
}

export function ProtokollEditorLayout({ protokoll }: Props) {
  const navigate = useNavigate();
  const editor = useProtokollEditor(protokoll);
  const draft = editor.draft;
  const firmaQ = useFirmendaten();
  const kundeQ = useKunde(draft.kundeId ?? "");
  const objekteQ = useObjekte(draft.kundeId);
  const objekt = draft.objektId ? objekteQ.data?.find((o) => o.id === draft.objektId) : undefined;
  const abschliessen = useAbschliessenProtokoll(draft.id);
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const [busy, setBusy] = useState(false);

  const titlePrefix = protokollTitel(draft);

  const onAbschliessen = async () => {
    if (!draft.kundeId) { toast.error("Bitte zuerst einen Kunden auswählen."); return; }
    setBusy(true);
    try {
      await editor.save(true);
      const blob = await generateProtokollPdf(draft, kundeQ.data, objekt, firmaQ.data);
      const dateiname = protokollDateiname(draft, kundeQ.data, objekt);
      const url = await blobToDataUrl(blob);
      await abschliessen.mutateAsync({ dateiname, mimeType: "application/pdf", groesseBytes: blob.size, url });
      toast.success("Abgeschlossen — in Dokumenten gespeichert");
      void navigate({ to: "/protokolle/$id", params: { id: draft.id } });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Konnte nicht abschließen");
    } finally {
      setBusy(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setTyped = editor.set as any;

  const editorEl = (
    <div className="h-full overflow-y-auto px-4 py-4">
      {draft.kind === "uebergabe" ? (
        <UebergabePanel
          draft={draft as UebergabeProtokoll}
          kunde={kundeQ.data}
          objekt={objekt}
          set={setTyped}
          onKundeChange={() => { /* handled via set kundeId */ }}
          onObjektChange={() => { /* handled via set objektId */ }}
        />
      ) : (
        <SchluesselPanel
          draft={draft as SchluesselProtokoll}
          kunde={kundeQ.data}
          objekt={objekt}
          set={setTyped}
          onKundeChange={() => {}}
          onObjektChange={() => {}}
        />
      )}
    </div>
  );

  const previewEl = (
    <ProtokollLivePreview draft={draft} kunde={kundeQ.data} objekt={objekt} firma={firmaQ.data} />
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] min-h-[600px] flex-col sm:-m-6 sm:h-[calc(100dvh-4rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-5 sm:py-3">
        <Button variant="ghost" size="sm" asChild className="rounded-full">
          <Link to="/protokolle"><ArrowLeft className="mr-1 h-4 w-4" />Zurück</Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold sm:text-base">
            {titlePrefix} <span className="font-mono">{draft.nummer}</span>
            <span className="ml-2 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">{draft.status}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {editor.saving ? (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Loader2 className="h-3 w-3 animate-spin" />Speichere…</span>
          ) : editor.isDirty ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">Ungespeichert</span>
          ) : (
            <span className="hidden text-xs text-muted-foreground sm:inline">Alles gespeichert</span>
          )}
          <Button variant="outline" size="sm" onClick={editor.discard} disabled={!editor.isDirty || editor.saving} className="rounded-full">
            <RotateCcw className="mr-1 h-3.5 w-3.5" /><span className="hidden sm:inline">Verwerfen</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void editor.save(false)} disabled={!editor.isDirty || editor.saving} className="rounded-full">
            <Save className="mr-1 h-3.5 w-3.5" />Speichern
          </Button>
          <Button size="sm" onClick={onAbschliessen} disabled={busy || !draft.kundeId} className="rounded-full">
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
            Abschließen
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 border-b border-border bg-muted/30 p-1.5 lg:hidden">
        <button type="button" onClick={() => setMobileView("editor")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${mobileView === "editor" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
          <Pencil className="h-3.5 w-3.5" />Bearbeiten
        </button>
        <button type="button" onClick={() => setMobileView("preview")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${mobileView === "preview" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
          <Eye className="h-3.5 w-3.5" />Vorschau
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="hidden h-full lg:block">
          <ResizablePanelGroup direction="horizontal" className="flex h-full w-full">
            <ResizablePanel defaultSize={55} minSize={30}>{previewEl}</ResizablePanel>
            <PanelResizeHandle className="relative w-px bg-border transition hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary" />
            <ResizablePanel defaultSize={45} minSize={30}><div className="h-full bg-background">{editorEl}</div></ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <div className="h-full lg:hidden">
          {mobileView === "preview" ? <div className="h-full">{previewEl}</div> : <div className="h-full bg-background">{editorEl}</div>}
        </div>
      </div>
    </div>
  );
}
