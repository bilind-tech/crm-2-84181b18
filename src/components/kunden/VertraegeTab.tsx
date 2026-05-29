import { useState } from "react";
import { Pencil, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  useVertraege,
  useCreateVertrag,
  useUpdateVertrag,
  useDeleteVertrag,
} from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDate, todayISO } from "@/lib/format";
import type { Vertrag } from "@/lib/api/types";

interface Props {
  kundeId: string;
}

type Mode = "create" | "edit";

export function VertraegeTab({ kundeId }: Props) {
  const { data: liste = [], isLoading } = useVertraege(kundeId);
  const create = useCreateVertrag(kundeId);
  const update = useUpdateVertrag(kundeId);
  const del = useDeleteVertrag(kundeId);

  const [mode, setMode] = useState<Mode | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [startDatum, setStartDatum] = useState(todayISO());
  const [endDatum, setEndDatum] = useState("");
  const [notiz, setNotiz] = useState("");
  const [delId, setDelId] = useState<string | null>(null);

  function reset() {
    setBezeichnung("");
    setStartDatum(todayISO());
    setEndDatum("");
    setNotiz("");
    setEditId(null);
    setMode(null);
  }

  function startCreate() {
    reset();
    setMode("create");
  }

  function startEdit(v: Vertrag) {
    setEditId(v.id);
    setBezeichnung(v.bezeichnung ?? "");
    setStartDatum(v.startDatum);
    setEndDatum(v.endDatum ?? "");
    setNotiz(v.notiz ?? "");
    setMode("edit");
  }

  async function submit() {
    if (!startDatum) {
      toast.error("Startdatum ist erforderlich");
      return;
    }
    try {
      if (mode === "create") {
        await create.mutateAsync({
          bezeichnung: bezeichnung.trim() || undefined,
          startDatum,
          endDatum: endDatum || null,
          notiz: notiz.trim() || null,
        });
        toast.success("Vertrag angelegt");
      } else if (mode === "edit" && editId) {
        await update.mutateAsync({
          id: editId,
          bezeichnung: bezeichnung.trim(),
          startDatum,
          endDatum: endDatum || null,
          notiz: notiz.trim() || null,
        });
        toast.success("Vertrag aktualisiert");
      }
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  async function loeschen(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success("Vertrag gelöscht");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setDelId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Verträge dieses Kunden. Werden bei der Rechnungserstellung optional referenziert.
        </p>
        {mode === null && (
          <Button size="sm" onClick={startCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Neuer Vertrag
          </Button>
        )}
      </div>

      {mode !== null && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium text-muted-foreground">Bezeichnung</Label>
              <Input
                className="mt-1.5"
                placeholder="z. B. Unterhaltsreinigung"
                value={bezeichnung}
                onChange={(e) => setBezeichnung(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Startdatum *</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={startDatum}
                onChange={(e) => setStartDatum(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Enddatum (optional)
              </Label>
              <Input
                type="date"
                className="mt-1.5"
                value={endDatum}
                onChange={(e) => setEndDatum(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium text-muted-foreground">Notiz (optional)</Label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={submit} disabled={create.isPending || update.isPending}>
              {mode === "create" ? "Anlegen" : "Speichern"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : liste.length === 0 && mode === null ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Noch keine Verträge angelegt.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {liste.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {v.bezeichnung || "Vertrag (ohne Bezeichnung)"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ab {formatDate(v.startDatum)}
                  {v.endDatum ? ` · bis ${formatDate(v.endDatum)}` : ""}
                </p>
                {v.notiz && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {v.notiz}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => startEdit(v)} title="Bearbeiten">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDelId(v.id)}
                  title="Löschen"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vertrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bestehende Rechnungen behalten den Vertragsbezug im PDF. Der Vertrag wird nur aus der
              Auswahl entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => delId && loeschen(delId)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}