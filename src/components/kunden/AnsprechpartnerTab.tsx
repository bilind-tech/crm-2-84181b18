import { useState } from "react";
import { Pencil, Plus, Star, Trash2, User } from "lucide-react";
import {
  useCreateAnsprechpartner,
  useUpdateAnsprechpartner,
  useDeleteAnsprechpartner,
} from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import type { Ansprechpartner } from "@/lib/api/types";

interface Props {
  kundeId: string;
  liste: Ansprechpartner[];
}

type Anrede = "herr" | "frau" | "divers" | "keine";
type Mode = "create" | "edit";

export function AnsprechpartnerTab({ kundeId, liste }: Props) {
  const create = useCreateAnsprechpartner(kundeId);
  const update = useUpdateAnsprechpartner(kundeId);
  const remove = useDeleteAnsprechpartner(kundeId);

  const [mode, setMode] = useState<Mode>("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [anrede, setAnrede] = useState<Anrede>("keine");
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [primaer, setPrimaer] = useState(liste.length === 0);

  function reset() {
    setAnrede("keine");
    setVorname("");
    setNachname("");
    setPosition("");
    setEmail("");
    setTelefon("");
    setPrimaer(liste.length === 0);
    setEditId(null);
    setMode("create");
  }

  function openCreate() {
    reset();
    setPrimaer(liste.length === 0);
    setMode("create");
    setShowForm(true);
  }

  function openEdit(a: Ansprechpartner) {
    setMode("edit");
    setEditId(a.id);
    setAnrede((a.anrede as Anrede) ?? "keine");
    setVorname(a.vorname ?? "");
    setNachname(a.nachname ?? "");
    setPosition(a.position ?? "");
    setEmail(a.email ?? "");
    setTelefon(a.telefon ?? "");
    setPrimaer(a.primaer);
    setShowForm(true);
  }

  async function setAlsPrimaer(id: string) {
    try {
      await Promise.all(
        liste
          .filter((a) => a.id !== id && a.primaer)
          .map((a) => update.mutateAsync({ id: a.id, primaer: false }))
      );
      await update.mutateAsync({ id, primaer: true });
      toast.success("Primärer Ansprechpartner gesetzt");
    } catch {
      toast.error("Konnte nicht aktualisiert werden");
    }
  }

  async function handleSave() {
    if (!nachname.trim() && !vorname.trim()) {
      toast.error("Bitte mindestens Vor- oder Nachname angeben");
      return;
    }
    try {
      if (mode === "edit" && editId) {
        await update.mutateAsync({
          id: editId,
          anrede,
          vorname: vorname || undefined,
          nachname: nachname || undefined,
          position: position || undefined,
          email: email || undefined,
          telefon: telefon || undefined,
          primaer,
        });
        if (primaer) {
          await Promise.all(
            liste
              .filter((a) => a.id !== editId && a.primaer)
              .map((a) => update.mutateAsync({ id: a.id, primaer: false }))
          );
        }
        toast.success("Ansprechpartner aktualisiert");
      } else {
        const created = await create.mutateAsync({
          anrede,
          vorname: vorname || undefined,
          nachname: nachname || undefined,
          position: position || undefined,
          email: email || undefined,
          telefon: telefon || undefined,
          primaer: primaer || liste.length === 0,
        });
        if ((primaer || liste.length === 0) && created?.id) {
          await Promise.all(
            liste
              .filter((a) => a.primaer)
              .map((a) => update.mutateAsync({ id: a.id, primaer: false }))
          );
          if (!created.primaer) {
            await update.mutateAsync({ id: created.id, primaer: true });
          }
        }
        toast.success("Ansprechpartner angelegt");
      }
      setShowForm(false);
      reset();
    } catch {
      toast.error("Speichern fehlgeschlagen");
    }
  }

  async function handleDelete(id: string) {
    const wasPrimary = liste.find((a) => a.id === id)?.primaer ?? false;
    try {
      await remove.mutateAsync(id);
      const rest = liste.filter((a) => a.id !== id);
      if (wasPrimary && rest.length > 0 && !rest.some((r) => r.primaer)) {
        await update.mutateAsync({ id: rest[0].id, primaer: true });
      }
      toast.success("Ansprechpartner gelöscht");
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setConfirmDeleteId(null);
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={openCreate}
          variant="outline"
          className="rounded-full"
          disabled={showForm}
        >
          <Plus className="mr-1 h-4 w-4" /> Neuer Ansprechpartner
        </Button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold">
            {mode === "edit" ? "Ansprechpartner bearbeiten" : "Neuer Ansprechpartner"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Anrede">
              <Select value={anrede} onValueChange={(v) => setAnrede(v as Anrede)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keine">—</SelectItem>
                  <SelectItem value="herr">Herr</SelectItem>
                  <SelectItem value="frau">Frau</SelectItem>
                  <SelectItem value="divers">Divers</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Position">
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="z. B. Geschäftsführer" />
            </Field>
            <Field label="Vorname">
              <Input value={vorname} onChange={(e) => setVorname(e.target.value)} />
            </Field>
            <Field label="Nachname *">
              <Input value={nachname} onChange={(e) => setNachname(e.target.value)} />
            </Field>
            <Field label="E-Mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Telefon">
              <Input value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox
              checked={primaer}
              onCheckedChange={(v) => setPrimaer(Boolean(v))}
              disabled={mode === "create" && liste.length === 0}
            />
            <span>
              Als primären Ansprechpartner setzen
              {mode === "create" && liste.length === 0 && (
                <span className="ml-1 text-xs text-muted-foreground">(automatisch, da erster)</span>
              )}
            </span>
          </label>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isPending} className="rounded-md px-6">
              {isPending ? "Speichere…" : "Speichern"}
            </Button>
          </div>
        </div>
      )}

      {liste.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <User className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Ansprechpartner hinterlegt.</p>
        </div>
      ) : (
        liste.length > 0 && (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {liste.map((a) => {
              const name = `${a.vorname ?? ""} ${a.nachname ?? ""}`.trim() || "—";
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{name}</p>
                      {a.primaer && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Star className="h-3 w-3 fill-current" /> Primär
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[a.position, a.email, a.telefon].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!a.primaer && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setAlsPrimaer(a.id)}
                        disabled={update.isPending}
                      >
                        <Star className="mr-1 h-3.5 w-3.5" /> Als primär
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => openEdit(a)}
                      disabled={showForm}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmDeleteId(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent className="bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Ansprechpartner löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
