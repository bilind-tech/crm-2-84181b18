// Liste aller Protokolle.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, FileText, KeyRound, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useProtokolle, useCreateProtokoll, useKunden } from "@/hooks/useApi";
import type { Protokoll, ProtokollKind } from "@/lib/api/types";

export const Route = createFileRoute("/protokolle")({ component: Page });

function Page() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"alle" | ProtokollKind>("alle");
  const [q, setQ] = useState("");
  const list = useProtokolle();
  const kundenQ = useKunden();
  const create = useCreateProtokoll();

  const kundenById = useMemo(() => {
    const m = new Map<string, string>();
    (kundenQ.data ?? []).forEach((k) => m.set(k.id, k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(" ") || k.nummer));
    return m;
  }, [kundenQ.data]);

  const filtered = useMemo(() => {
    let arr: Protokoll[] = list.data ?? [];
    if (tab !== "alle") arr = arr.filter((p) => p.kind === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      arr = arr.filter((p) =>
        p.nummer.toLowerCase().includes(s) ||
        (p.kundeId ? (kundenById.get(p.kundeId) ?? "").toLowerCase().includes(s) : false));
    }
    return arr;
  }, [list.data, tab, q, kundenById]);

  const neu = async (kind: ProtokollKind) => {
    try {
      const p = await create.mutateAsync({ kind });
      void navigate({ to: "/protokolle/$id/bearbeiten", params: { id: p.id } });
    } catch (e) {
      console.error(e); toast.error("Konnte nicht anlegen");
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Protokolle"
        subtitle="Übergabe-/Abnahmeprotokolle und Schlüsselübergaben."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => neu("uebergabe")} disabled={create.isPending}>
              <Plus className="mr-1.5 h-4 w-4" />Übergabe
            </Button>
            <Button variant="outline" size="sm" onClick={() => neu("schluessel")} disabled={create.isPending}>
              <Plus className="mr-1.5 h-4 w-4" />Schlüssel
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche nach Nummer oder Kunde …" className="pl-8" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="alle">Alle</TabsTrigger>
          <TabsTrigger value="uebergabe">Übergabe / Abnahme</TabsTrigger>
          <TabsTrigger value="schluessel">Schlüssel</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {list.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lade …</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Noch keine Protokolle. Lege oben eines an.
            </div>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link to="/protokolle/$id" params={{ id: p.id }} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {p.kind === "schluessel" ? <KeyRound className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{p.nummer}</span>
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">{p.status}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {(p.kundeId ? kundenById.get(p.kundeId) : "Ohne Kunde") ?? "—"} · {p.datum}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
