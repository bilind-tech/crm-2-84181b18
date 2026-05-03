import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  /** Optionaler Hinweistext über den Skeleton-Zeilen */
  label?: string;
  /** Anzahl der Skeleton-Linien (default 3) */
  rows?: number;
}

/**
 * Einheitlicher Lade-Platzhalter — ersetzt nacktes „Lade …".
 * Verwende auf Detail-Seiten und in Tabs während des initialen Fetch.
 */
export function LoadingPlaceholder({ label = "Lade …", rows = 3 }: Props) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" style={{ maxWidth: `${100 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
