import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { DetailSkeleton } from "@/components/layout/DetailSkeleton";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { useObjekt } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ObjektBearbeitenDialog } from "@/components/forms/ObjektBearbeitenDialog";

export const Route = createFileRoute("/objekte/$id")({ component: Page });
function Page() {
  const { id } = Route.useParams();
  const { data: o, isLoading } = useObjekt(id);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <DetailSkeleton variant="objekt" />;
  if (!o) {
    return (
      <NotFoundState
        title="Objekt nicht gefunden"
        description="Dieses Objekt wurde gelöscht oder die Adresse ist ungültig."
        backTo="/objekte"
        backLabel="Zurück zu den Objekten"
      />
    );
  }

  const adresse = [o.strasse, `${o.plz ?? ""} ${o.ort ?? ""}`.trim()].filter(Boolean).join(", ") || "—";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/objekte" className="text-xs text-muted-foreground hover:underline">← Objekte</Link>
          <h1 className="text-2xl font-semibold">{o.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{o.nummer}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Bearbeiten
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><span className="text-muted-foreground">Adresse: </span>{adresse}</div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Status: </span>
            <span className="capitalize">{o.status}</span>
          </div>
        </CardContent>
      </Card>

      <ObjektBearbeitenDialog objekt={o} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
