// Lokaler Draft-Editor für Angebote/Rechnungen.
// - Hält den Draft im State (Quelle der Wahrheit für Live-Preview).
// - Autosave 1.5s nach letzter Änderung via useUpdateAngebot/useUpdateRechnung.
// - Stellt focusField(id) bereit: scrollt das Element mit data-feld-id im
//   EditorPanel ins Sichtfeld + kurzer Highlight + fokussiert das erste Input.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useUpdateAngebot, useUpdateRechnung } from "@/hooks/useApi";
import type { Angebot, Rechnung } from "@/lib/api/types";

type BelegKind = "angebot" | "rechnung";

const VOLATILE_KEYS = new Set(["aktualisiertAm", "updatedAt", "erstelltAm", "createdAt"]);

function stableStringify<T>(obj: T): string {
  return JSON.stringify(obj, (key, value) => (VOLATILE_KEYS.has(key) ? undefined : value));
}

export function useBelegEditor<T extends Angebot | Rechnung>(
  kind: BelegKind,
  beleg: T,
) {
  const [draft, setDraft] = useState<T>(beleg);
  const lastSavedRef = useRef<string>(stableStringify(beleg));
  const draftRef = useRef<T>(beleg);
  draftRef.current = draft;

  // Server-Echos nur dann in den Draft spiegeln, wenn der lokale Draft nicht
  // dirty ist UND sich semantisch (ohne Timestamps) etwas geändert hat.
  useEffect(() => {
    const incoming = stableStringify(beleg);
    if (incoming === lastSavedRef.current) return;
    const currentDraft = stableStringify(draftRef.current);
    if (incoming === currentDraft) {
      lastSavedRef.current = incoming;
      return;
    }
    if (currentDraft !== lastSavedRef.current) return; // Draft dirty → User-Eingaben behalten
    setDraft(beleg);
    lastSavedRef.current = incoming;
  }, [beleg]);

  const isDirty = useMemo(
    () => stableStringify(draft) !== lastSavedRef.current,
    [draft],
  );

  const updateAngebot = useUpdateAngebot(kind === "angebot" ? draft.id : "");
  const updateRechnung = useUpdateRechnung(kind === "rechnung" ? draft.id : "");

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setOption = useCallback(
    <K extends keyof NonNullable<T["optionen"]>>(
      key: K,
      value: NonNullable<T["optionen"]>[K],
    ) => {
      setDraft((prev) => ({
        ...prev,
        optionen: {
          ...(prev.optionen ?? {
            materialBereitgestellt: true,
            standardAnschreiben: true,
            wiederkehrend: false,
          }),
          [key]: value,
        } as T["optionen"],
      }));
    },
    [],
  );

  const save = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isDirty) return;
    try {
      const payload = { ...draft } as Partial<T>;
      if (kind === "angebot") {
        await updateAngebot.mutateAsync(payload as Partial<Angebot>);
      } else {
        await updateRechnung.mutateAsync(payload as Partial<Rechnung>);
      }
      lastSavedRef.current = stableStringify(draft);
      if (!opts?.silent) toast.success("Gespeichert", { duration: 1500 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }, [draft, isDirty, kind, updateAngebot, updateRechnung]);

  // Autosave nach 3s ohne Änderung — silent (kein Toast).
  useEffect(() => {
    if (!isDirty) return;
    const t = setTimeout(() => {
      void save({ silent: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [draft, isDirty, save]);

  const discard = useCallback(() => {
    setDraft(beleg);
    lastSavedRef.current = JSON.stringify(beleg);
  }, [beleg]);

  // Click-to-edit: scrollt das Panel zum Feld + Highlight + Fokus.
  const focusField = useCallback((fieldId: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-feld-id="${CSS.escape(fieldId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
      }, 1500);
      const input = el.querySelector<HTMLElement>("input,textarea,select,button");
      input?.focus();
    });
  }, []);

  return {
    draft,
    set,
    setOption,
    setDraft,
    isDirty,
    save,
    discard,
    focusField,
    saving: updateAngebot.isPending || updateRechnung.isPending,
  };
}
