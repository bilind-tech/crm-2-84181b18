import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAktivitaeten } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";
export const Route = createFileRoute("/aktivitaet")({ component: Page });
function Page() {
  const { data = [] } = useAktivitaeten();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Aktivitätsverlauf</h1>
      <Card>
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {data.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span>{a.beschreibung}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.zeitpunkt)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
