// Tab "Sicherheit": Passwort, Recovery-Code, Auto-Lock.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSicherheit, useUpdateSicherheit } from "@/hooks/useApi";
import type { SicherheitsEinstellungen } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { PasswortAendernDialog } from "./PasswortAendernDialog";
import { RecoveryRotateDialog } from "./RecoveryRotateDialog";

export function SicherheitTab() {
  const { data, isLoading } = useSicherheit();
  const update = useUpdateSicherheit();
  const [form, setForm] = useState<SicherheitsEinstellungen | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  return (
    <div className="space-y-5 pb-24">
      <Section title="Passwort" description="Anmelde-Passwort dieses Geräts ändern.">
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setPwOpen(true)}>
            <KeyRound className="mr-1.5 h-4 w-4" /> Passwort ändern
          </Button>
        </div>
      </Section>

      <Section
        title="Recovery-Code"
        description="Falls du dein Passwort vergisst, ist der Recovery-Code der einzige Weg zurück. Erzeuge bei Bedarf einen neuen — der alte wird sofort ungültig."
      >
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setRecOpen(true)}>
            <ShieldCheck className="mr-1.5 h-4 w-4" /> Neuen Recovery-Code erzeugen
          </Button>
        </div>
      </Section>

      <Section title="Auto-Lock" description="App sperrt sich automatisch nach Inaktivität.">
        <Field
          label={`Inaktivität: ${form.autoLockMinuten} Minuten`}
          hint="Zwischen 1 und 60 Minuten."
        >
          <Input
            type="range"
            min={1}
            max={60}
            value={form.autoLockMinuten}
            onChange={(e) => setForm({ ...form, autoLockMinuten: Number(e.target.value) })}
          />
        </Field>
      </Section>

      <PasswortAendernDialog open={pwOpen} onOpenChange={setPwOpen} />
      <RecoveryRotateDialog open={recOpen} onOpenChange={setRecOpen} />

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={() =>
          update.mutate(form, {
            onSuccess: () => toast.success("Sicherheits-Einstellungen gespeichert"),
          })
        }
      />
    </div>
  );
}
