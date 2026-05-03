// Schlüsselübergabe — Einstiegsseite mit Konfigurationsformular.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { SlideOver } from "@/components/ui/slide-over";
import { SchluesselProtokollForm } from "@/components/forms/SchluesselProtokollForm";
import { useProtokolle } from "@/hooks/useApi";

export const Route = createFileRoute("/werkzeuge/schluesseluebergabe")({ component: Page });

function Page() {
  const [open, setOpen] = useState(false);
  const list = useProtokolle();
  const recent = (list.data ?? []).filter((p) => p.kind === "schluessel").slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schlüsselübergabe"
        subtitle="Erfasse eine Schlüsselübergabe. Wird live gespeichert und im Bereich Protokolle archiviert."
        actions={<PrimaryAction icon={Plus} label="Neue Übergabe" onClick={() => setOpen(true)} />}
      />

      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Klicke auf <span className="font-medium text-foreground">„Neue Übergabe"</span>, erfasse Kunde, Schlüssel und Pfand — danach öffnet sich der Live-Editor mit Vorschau, genau wie bei Angeboten und Rechnungen.
      </div>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Zuletzt bearbeitet</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to="/protokolle/$id" params={{ id: p.id }} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <KeyRound className="h-4 w-4" />
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
        title="Neue Schlüsselübergabe"
        description="Kunde, Schlüssel und Pfand erfassen — danach öffnet sich der Live-Editor."
      >
        {open && <SchluesselProtokollForm onClose={() => setOpen(false)} />}
      </SlideOver>
    </div>
  );
}
