// Lokaler Draft-Editor für Protokolle. Autosave 1.5s nach letzter Änderung.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useUpdateProtokoll } from "@/hooks/useApi";
import type { Protokoll } from "@/lib/api/types";

const VOLATILE = new Set(["aktualisiertAm", "erstelltAm"]);
function stable<T>(o: T) {
  return JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v));
}

export function useProtokollEditor<T extends Protokoll>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const lastSavedRef = useRef<string>(stable(initial));
  const draftRef = useRef<T>(initial);
  draftRef.current = draft;

  useEffect(() => {
    const incoming = stable(initial);
    if (incoming === lastSavedRef.current) return;
    const cur = stable(draftRef.current);
    if (incoming === cur) {
      lastSavedRef.current = incoming;
      return;
    }
    if (cur !== lastSavedRef.current) return; // dirty → behalten
    setDraft(initial);
    lastSavedRef.current = incoming;
  }, [initial]);

  const isDirty = useMemo(() => stable(draft) !== lastSavedRef.current, [draft]);
  const update = useUpdateProtokoll(draft.id);
  const [saving, setSaving] = useState(false);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((p) => ({ ...p, [key]: value }));
  }, []);

  const save = useCallback(
    async (silent = true) => {
      if (stable(draftRef.current) === lastSavedRef.current) return;
      setSaving(true);
      try {
        const cur = draftRef.current;
        const saved = await update.mutateAsync(cur as Partial<Protokoll>);
        lastSavedRef.current = stable(saved as T);
        if (!silent) toast.success("Gespeichert");
      } catch (e) {
        console.error(e);
        toast.error("Konnte nicht speichern");
      } finally {
        setSaving(false);
      }
    },
    [update],
  );

  // Autosave debounced
  useEffect(() => {
    if (!isDirty) return;
    const t = setTimeout(() => {
      void save(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [draft, isDirty, save]);

  const discard = useCallback(() => {
    setDraft(initial);
    lastSavedRef.current = stable(initial);
  }, [initial]);

  return { draft, set, isDirty, saving, save, discard };
}
