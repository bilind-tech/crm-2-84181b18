// Übergabe-/Abnahmeprotokoll — legt direkt einen Entwurf an und öffnet den Editor.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateProtokoll } from "@/hooks/useApi";

export const Route = createFileRoute("/werkzeuge/uebergabeprotokoll")({ component: Page });

function Page() {
  const navigate = useNavigate();
  const create = useCreateProtokoll();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const p = await create.mutateAsync({ kind: "uebergabe" });
        void navigate({ to: "/protokolle/$id/bearbeiten", params: { id: p.id }, replace: true });
      } catch (e) {
        console.error(e);
        toast.error("Konnte Protokoll nicht anlegen");
        void navigate({ to: "/protokolle", replace: true });
      }
    })();
  }, [create, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />Neues Protokoll wird angelegt …
    </div>
  );
}
