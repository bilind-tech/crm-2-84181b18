import { createFileRoute, Link } from "@tanstack/react-router";
import { DetailSkeleton } from "@/components/layout/DetailSkeleton";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { useObjekt } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/objekte/$id")({ component: Page });
function Page() {
  const { id } = Route.useParams();
  const { data: o, isLoading } = useObjekt(id);
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
  return (
    <div className="space-y-4">
      <div><Link to="/objekte" className="text-xs text-muted-foreground hover:underline">← Objekte</Link>
        <h1 className="text-2xl font-semibold">{o.name}</h1>
        <p className="text-sm text-muted-foreground">{o.nummer}</p>
      </div>
      <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Typ: </span>{o.typ}</div>
          <div><span className="text-muted-foreground">Frequenz: </span>{o.frequenz}</div>
          <div><span className="text-muted-foreground">Tage: </span>{o.reinigungstage.join(", ") || "—"}</div>
          <div><span className="text-muted-foreground">m² gesamt / zu reinigen: </span>{o.qmGesamt ?? "—"} / {o.qmZuReinigen ?? "—"}</div>
          <div className="sm:col-span-2"><span className="text-muted-foreground">Adresse: </span>{[o.strasse, `${o.plz ?? ""} ${o.ort ?? ""}`.trim()].filter(Boolean).join(", ") || "—"}</div>
          <div className="sm:col-span-2"><span className="text-muted-foreground">Zugang: </span>{o.zugangsinfo ?? "—"}</div>
        </CardContent>
      </Card>
    </div>
  );
}
