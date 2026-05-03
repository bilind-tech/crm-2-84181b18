import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StammdatenPanel } from "./panels/StammdatenPanel";
import { PositionenPanel } from "./panels/PositionenPanel";
import { TexteOptionenPanel } from "./panels/TexteOptionenPanel";
import { LogoFirmaPanel } from "./panels/LogoFirmaPanel";
import type { Angebot, Rechnung, Kunde, Firmendaten, BelegOptionen } from "@/lib/api/types";

export type EditorTab = "stammdaten" | "positionen" | "texte" | "logo";

interface Props {
  kind: "angebot" | "rechnung";
  draft: Angebot | Rechnung;
  kunde: Kunde;
  firma: Firmendaten;
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (key: any, value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOption: (key: keyof BelegOptionen, value: any) => void;
}

export function EditorPanel({
  kind,
  draft,
  kunde,
  firma,
  activeTab,
  onTabChange,
  set,
  setOption,
}: Props) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as EditorTab)}
      className="flex h-full flex-col"
    >
      <TabsList className="no-scrollbar mx-3 mt-3 flex h-10 justify-start gap-1 overflow-x-auto rounded-full bg-muted p-1">
        <TabsTrigger value="stammdaten" className="shrink-0 rounded-full px-3">
          Stammdaten
        </TabsTrigger>
        <TabsTrigger value="positionen" className="shrink-0 rounded-full px-3">
          Positionen
        </TabsTrigger>
        <TabsTrigger value="texte" className="shrink-0 rounded-full px-3">
          Texte
        </TabsTrigger>
        <TabsTrigger value="logo" className="shrink-0 rounded-full px-3">
          Logo & Firma
        </TabsTrigger>
      </TabsList>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <TabsContent value="stammdaten" className="m-0">
          <StammdatenPanel kind={kind} draft={draft} kunde={kunde} set={set} />
        </TabsContent>
        <TabsContent value="positionen" className="m-0">
          <PositionenPanel draft={draft} set={set} />
        </TabsContent>
        <TabsContent value="texte" className="m-0">
          <TexteOptionenPanel draft={draft} setOption={setOption} />
        </TabsContent>
        <TabsContent value="logo" className="m-0">
          <LogoFirmaPanel draft={draft} firma={firma} setOption={setOption} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
