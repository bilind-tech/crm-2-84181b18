// Übergabe-/Abnahmeprotokoll — Einstiegsseite mit Konfigurationsformular.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { SlideOver } from "@/components/ui/slide-over";
import { UebergabeProtokollForm } from "@/components/forms/UebergabeProtokollForm";
import { useProtokolle } from "@/hooks/useApi";

export const Route = createFileRoute("/werkzeuge/uebergabeprotokoll")({ component: Page });

function Page() {
  const [open, setOpen] = useState(false);
  const list = useProtokolle();
  const recent = (list.data ?? []).filter((p) => p.kind === "uebergabe").slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Übergabe-/Abnahmeprotokoll"
        subtitle="Erfasse ein Protokoll. Wird live gespeichert und im Bereich Protokolle archiviert."
        actions={<PrimaryAction icon={Plus} label="Neues Protokoll" onClick={() => setOpen(true)} />}
      />

      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Klicke auf <span className="font-medium text-foreground">„Neues Protokoll"</span>, wähle Kunde und Eckdaten — danach öffnet sich der Live-Editor mit Vorschau, genau wie bei Angeboten und Rechnungen.
      </div>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Zuletzt bearbeitet</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to="/protokolle/$id" params={{ id: p.id }} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{p.nummer}</span>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">{p.status}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{p.datum}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SlideOver
        open={open}
        onOpenChange={setOpen}
        title="Neues Übergabe-/Abnahmeprotokoll"
        description="Kunde, Objekt und Eckdaten erfassen — danach öffnet sich der Live-Editor."
      >
        {open && <UebergabeProtokollForm onClose={() => setOpen(false)} />}
      </SlideOver>
    </div>
  );
}
