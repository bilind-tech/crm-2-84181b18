// Gemeinsame UI-Helfer für die Einstellungs-Tabs.
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Save as SaveIcon } from "lucide-react";

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function StickySaveBar({
  dirty,
  saving,
  onReset,
  onSave,
  hint,
  saveLabel = "Speichern",
}: {
  dirty: boolean;
  saving?: boolean;
  onReset: () => void;
  onSave: () => void;
  hint?: string;
  saveLabel?: string;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:left-[var(--sidebar-width,16rem)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p className="hidden text-xs text-muted-foreground sm:block">{hint}</p>
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <Button
            variant="outline"
            className="rounded-full px-5"
            onClick={onReset}
            disabled={!dirty || saving}
          >
            Zurücksetzen
          </Button>
          <Button
            className="gap-1.5 rounded-full px-5 shadow-sm"
            onClick={onSave}
            disabled={!dirty || saving}
          >
            <SaveIcon className="h-4 w-4" />
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
