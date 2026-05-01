import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  /** „kunde" zeigt zusätzlich Avatar-Block + Tabs. */
  variant?: "kunde" | "beleg" | "objekt";
}

/**
 * Skelett-Layout für Detail-Seiten — vermeidet, dass die Seite während des
 * Datenladens leer wirkt. Zeichnet die typische Struktur (Header, Karten,
 * ggf. Tabs) als graue Platzhalter vor.
 */
export function DetailSkeleton({ variant = "beleg" }: Props) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>

      {variant === "kunde" && (
        <>
          {/* Kunden-Header-Karte */}
          <div className="flex items-center gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <Skeleton className="h-16 w-16 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>

          {/* Tabs */}
          <Skeleton className="h-11 w-full rounded-full" />

          {/* Zwei Karten */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CardSkeleton rows={5} />
            <CardSkeleton rows={3} />
          </div>
        </>
      )}

      {variant === "beleg" && (
        <>
          {/* FlowBar */}
          <Skeleton className="h-12 w-full rounded-2xl" />

          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <div className="space-y-4">
              <CardSkeleton rows={4} />
              <CardSkeleton rows={3} />
            </div>
            <Skeleton className="h-[400px] w-full rounded-2xl" />
          </div>
        </>
      )}

      {variant === "objekt" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton rows={5} />
          <CardSkeleton rows={4} />
        </div>
      )}
    </div>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <Skeleton className="mb-3 h-3 w-24" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
