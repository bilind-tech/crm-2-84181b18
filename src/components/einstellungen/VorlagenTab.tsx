// Tab "Textbausteine & Vorlagen": Positionsvorlagen + Textvorlagen verwalten.
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePositionsvorlagen,
  useCreatePositionsvorlage,
  useUpdatePositionsvorlage,
  useDeletePositionsvorlage,
  useTextvorlagen,
  useCreateTextvorlage,
  useUpdateTextvorlage,
  useDeleteTextvorlage,
} from "@/hooks/useApi";
import type { Positionsvorlage, Textvorlage, TextvorlageZweck, Einheit } from "@/lib/api/types";
import { Section, Field } from "./_shared";
import { useConfirm } from "@/hooks/useConfirm";

const EINHEITEN: { value: Einheit; label: string }[] = [
  { value: "stk", label: "Stück" },
  { value: "h", label: "Stunde" },
  { value: "m2", label: "m²" },
  { value: "pauschal", label: "Pauschal" },
  { value: "tag", label: "Tag" },
  { value: "monat", label: "Monat" },
];

const ZWECKE: { value: TextvorlageZweck; label: string }[] = [
  { value: "angebot_intro", label: "Angebot — Einleitung" },
  { value: "angebot_outro", label: "Angebot — Schluss" },
  { value: "rechnung_intro", label: "Rechnung — Einleitung" },
  { value: "rechnung_outro", label: "Rechnung — Schluss" },
  { value: "email_angebot", label: "E-Mail — Angebot" },
  { value: "email_rechnung", label: "E-Mail — Rechnung" },
];

export function VorlagenTab() {
  return (
    <div className="space-y-5 pb-12">
      <PositionsvorlagenSektion />
      <TextvorlagenSektion />
    </div>
  );
}

// ---------- Positionsvorlagen ----------

function PositionsvorlagenSektion() {
  const { data: list = [] } = usePositionsvorlagen();
  const create = useCreatePositionsvorlage();
  const update = useUpdatePositionsvorlage();
  const del = useDeletePositionsvorlage();
  const [editing, setEditing] = useState<Positionsvorlage | null>(null);
  const [creating, setCreating] = useState(false);
  const { confirm, dialog } = useConfirm();

  return (
    <Section
      title="Positionsvorlagen"
      description="Wiederverwendbare Positionen für Angebote und Rechnungen."
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)} className="rounded-lg">
          <Plus className="mr-1.5 h-4 w-4" /> Neue Position
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Noch keine Vorlagen.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.bezeichnung}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {v.einzelpreisNetto.toFixed(2)} € / {v.einheit} · {v.steuersatz}%
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    confirm(
                      {
                        title: "Vorlage löschen?",
                        description: `„${v.bezeichnung}" entfernen.`,
                        variant: "destructive",
                        confirmLabel: "Löschen",
                      },
                      () => del.mutate(v.id, { onSuccess: () => toast.success("Vorlage gelöscht") }),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(editing || creating) && (
        <PositionsvorlageDialog
          vorlage={editing}
          open
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(data) => {
            if (editing) {
              update.mutate(
                { id: editing.id, ...data },
                {
                  onSuccess: () => {
                    toast.success("Vorlage gespeichert");
                    setEditing(null);
                  },
                },
              );
            } else {
              create.mutate(data, {
                onSuccess: () => {
                  toast.success("Vorlage angelegt");
                  setCreating(false);
                },
              });
            }
          }}
        />
      )}
      {dialog}
    </Section>
  );
}

function PositionsvorlageDialog({
  vorlage,
  open,
  onClose,
  onSave,
}: {
  vorlage: Positionsvorlage | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Positionsvorlage>) => void;
}) {
  const [bezeichnung, setBezeichnung] = useState(vorlage?.bezeichnung ?? "");
  const [beschreibung, setBeschreibung] = useState(vorlage?.beschreibung ?? "");
  const [einheit, setEinheit] = useState<Einheit>(vorlage?.einheit ?? "stk");
  const [preis, setPreis] = useState<number>(vorlage?.einzelpreisNetto ?? 0);
  const [steuer, setSteuer] = useState<number>(vorlage?.steuersatz ?? 19);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-background">
        <DialogHeader>
          <DialogTitle>{vorlage ? "Vorlage bearbeiten" : "Neue Positionsvorlage"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Bezeichnung" required>
            <Input value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
          </Field>
          <Field label="Beschreibung">
            <Textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={3}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Einheit">
              <Select value={einheit} onValueChange={(v) => setEinheit(v as Einheit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EINHEITEN.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Preis (€ netto)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={preis}
                onChange={(e) => setPreis(Number(e.target.value))}
              />
            </Field>
            <Field label="MwSt (%)">
              <Input
                type="number"
                inputMode="decimal"
                value={steuer}
                onChange={(e) => setSteuer(Number(e.target.value))}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() =>
              onSave({
                bezeichnung,
                beschreibung,
                einheit,
                einzelpreisNetto: preis,
                steuersatz: steuer,
              })
            }
            disabled={!bezeichnung.trim()}
          >
            <Check className="mr-1.5 h-4 w-4" /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Textvorlagen ----------

function TextvorlagenSektion() {
  const { data: list = [] } = useTextvorlagen();
  const create = useCreateTextvorlage();
  const update = useUpdateTextvorlage();
  const del = useDeleteTextvorlage();
  const [editing, setEditing] = useState<Textvorlage | null>(null);
  const [creating, setCreating] = useState(false);
  const { confirm, dialog } = useConfirm();

  const grouped = ZWECKE.map((z) => ({
    ...z,
    items: list.filter((v) => v.zweck === z.value),
  }));

  return (
    <Section
      title="Textvorlagen"
      description="Standard-Anschreiben & Schluss-Texte für Belege und E-Mails."
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)} className="rounded-lg">
          <Plus className="mr-1.5 h-4 w-4" /> Neue Textvorlage
        </Button>
      </div>

      <div className="space-y-5">
        {grouped.map((g) => (
          <div key={g.value}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </h3>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {g.items.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{v.bezeichnung}</p>
                      <p className="truncate text-xs text-muted-foreground">{v.inhalt}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          confirm(
                            {
                              title: "Textvorlage löschen?",
                              description: `„${v.bezeichnung}" entfernen.`,
                              variant: "destructive",
                              confirmLabel: "Löschen",
                            },
                            () =>
                              del.mutate(v.id, {
                                onSuccess: () => toast.success("Textvorlage gelöscht"),
                              }),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <TextvorlageDialog
          vorlage={editing}
          open
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(data) => {
            if (editing) {
              update.mutate(
                { id: editing.id, ...data },
                {
                  onSuccess: () => {
                    toast.success("Textvorlage gespeichert");
                    setEditing(null);
                  },
                },
              );
            } else {
              create.mutate(data, {
                onSuccess: () => {
                  toast.success("Textvorlage angelegt");
                  setCreating(false);
                },
              });
            }
          }}
        />
      )}
      {dialog}
    </Section>
  );
}

function TextvorlageDialog({
  vorlage,
  open,
  onClose,
  onSave,
}: {
  vorlage: Textvorlage | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Textvorlage>) => void;
}) {
  const [bezeichnung, setBezeichnung] = useState(vorlage?.bezeichnung ?? "");
  const [zweck, setZweck] = useState<TextvorlageZweck>(vorlage?.zweck ?? "angebot_intro");
  const [inhalt, setInhalt] = useState(vorlage?.inhalt ?? "");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-background">
        <DialogHeader>
          <DialogTitle>{vorlage ? "Textvorlage bearbeiten" : "Neue Textvorlage"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Bezeichnung" required>
            <Input value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
          </Field>
          <Field label="Zweck">
            <Select value={zweck} onValueChange={(v) => setZweck(v as TextvorlageZweck)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZWECKE.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Inhalt" hint="Platzhalter wie {kunde.name} sind erlaubt.">
            <Textarea value={inhalt} onChange={(e) => setInhalt(e.target.value)} rows={8} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => onSave({ bezeichnung, zweck, inhalt })}
            disabled={!bezeichnung.trim() || !inhalt.trim()}
          >
            <Check className="mr-1.5 h-4 w-4" /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
