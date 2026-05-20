// Liefert die ID der Standard-Zahlungserinnerung. Die Vorlage wird vom
// Backend beim Boot per seed (`rechnung.erinnerung.v3`) eingespielt — hier
// wird NICHTS mehr angelegt. Fällt zurück auf die markierte Standard-
// Rechnungs-Vorlage oder schlicht die erste rechnungs-Vorlage.

import { useMemo } from "react";
import { useEmailVorlagen } from "@/hooks/useApi";

export function useErinnerungVorlageId(): string | undefined {
  const { data: vorlagen = [] } = useEmailVorlagen();
  return useMemo(() => {
    const bySeed = vorlagen.find(
      (v) => (v as { seedKey?: string | null }).seedKey === "rechnung.erinnerung.v3",
    );
    if (bySeed) return bySeed.id;
    const std = vorlagen.find((v) => v.kontext === "rechnung" && v.istStandard);
    if (std) return std.id;
    return vorlagen.find((v) => v.kontext === "rechnung")?.id;
  }, [vorlagen]);
}