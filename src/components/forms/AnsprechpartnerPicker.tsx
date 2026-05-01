import { useEffect, useMemo, useState } from "react";
import { Plus, UserCircle2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKunde, useCreateAnsprechpartner } from "@/hooks/useApi";
import type { Ansprechpartner } from "@/lib/api/types";
import { toast } from "sonner";

interface Props {
  kundeId: string;
  value?: string;
  onChange: (id: string | undefined) => void;
}

function anredeText(a?: Ansprechpartner) {
  if (!a) return "Sehr geehrte Damen und Herren,";
  const name = a.nachname?.trim() || "";
  if (a.anrede === "herr") return `Sehr geehrter Herr ${name},`;
  if (a.anrede === "frau") return `Sehr geehrte Frau ${name},`;
  if (a.vorname || a.nachname) return `Hallo ${[a.vorname, a.nachname].filter(Boolean).join(" ")},`;
  return "Sehr geehrte Damen und Herren,";
}

function fullName(a: Ansprechpartner) {
  const anr = a.anrede === "herr" ? "Herr" : a.anrede === "frau" ? "Frau" : "";
  return [anr, a.vorname, a.nachname].filter(Boolean).join(" ") || "Ansprechpartner";
}

export function AnsprechpartnerPicker({ kundeId, value, onChange }: Props) {
  const { data: kunde } = useKunde(kundeId);
  const create = useCreateAnsprechpartner(kundeId);
  const list = useMemo<Ansprechpartner[]>(() => kunde?.ansprechpartner ?? [], [kunde]);

  // Initial: primärer oder erster
  useEffect(() => {
    if (!kundeId) return;
    if (list.length === 0) {
      if (value) onChange(undefined);
      return;
    }
    if (!value || !list.find((a) => a.id === value)) {
      const primaer = list.find((a) => a.primaer) ?? list[0];
      onChange(primaer.id);
    }
  }, [kundeId, list, value, onChange]);

  const [showSelect, setShowSelect] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Inline-Form
  const [anrede, setAnrede] = useState<"herr" | "frau" | "divers" | "keine">("herr");
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");

  const aktiv = list.find((a) => a.id === value);

  if (!kundeId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Erst Kunde wählen, dann Ansprechpartner.
      </div>
    );
  }

  async function speichern() {
    if (!nachname.trim()) return toast.error("Nachname ist erforderlich");
    const neu = await create.mutateAsync({
      anrede,
      vorname: vorname.trim() || undefined,
      nachname: nachname.trim(),
      position: position.trim() || undefined,
      email: email.trim() || undefined,
      primaer: list.length === 0,
    });
    onChange(neu.id);
    setShowNew(false);
    setVorname("");
    setNachname("");
    setPosition("");
    setEmail("");
    toast.success("Ansprechpartner angelegt");
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ansprechpartner
        </p>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Ansprechpartner
        </button>
      </div>

      {list.length === 0 && !showNew && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Noch kein Ansprechpartner für diesen Kunden.
        </div>
      )}

      {aktiv && (
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-primary/10 text-primary">
            <UserCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{fullName(aktiv)}</p>
            {aktiv.position && (
              <p className="truncate text-xs text-muted-foreground">{aktiv.position}</p>
            )}
            <p className="mt-1 text-xs italic text-muted-foreground">
              Anschreiben: „{anredeText(aktiv)}"
            </p>
          </div>
          {list.length > 1 && (
            <button
              type="button"
              onClick={() => setShowSelect((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Wechseln <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {showSelect && list.length > 1 && (
        <div className="space-y-1 rounded-lg border border-border bg-background p-2">
          {list.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => {
                onChange(a.id);
                setShowSelect(false);
              }}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                a.id === value ? "bg-primary/10 font-medium text-primary" : ""
              }`}
            >
              <span>{fullName(a)}</span>
              {a.position && <span className="text-xs text-muted-foreground">{a.position}</span>}
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Anrede</Label>
              <Select value={anrede} onValueChange={(v) => setAnrede(v as typeof anrede)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="herr">Herr</SelectItem>
                  <SelectItem value="frau">Frau</SelectItem>
                  <SelectItem value="divers">Divers</SelectItem>
                  <SelectItem value="keine">—</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Vorname</Label>
              <Input className="mt-1 h-9" value={vorname} onChange={(e) => setVorname(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nachname *</Label>
              <Input className="mt-1 h-9" value={nachname} onChange={(e) => setNachname(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Position</Label>
              <Input className="mt-1 h-9" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">E-Mail</Label>
              <Input className="mt-1 h-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Abbrechen</Button>
            <Button size="sm" onClick={speichern} disabled={create.isPending}>Speichern</Button>
          </div>
        </div>
      )}
    </div>
  );
}
