type Crumb = { label: string; to?: string };

interface Props {
  title: string;
  subtitle?: React.ReactNode;
  /** @deprecated wird nicht mehr angezeigt — Prop bleibt für Rückwärtskompatibilität */
  breadcrumb?: string | Crumb[];
  /** @deprecated wird nicht mehr angezeigt */
  hint?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: "default" | "success" | "danger" | "primary";
  icon?: React.ComponentType<{ className?: string }>;
}

export function KpiCard({ label, value, sublabel, tone = "default", icon: Icon }: KpiProps) {
  const valueColor =
    tone === "success"
      ? "text-success"
      : tone === "danger"
      ? "text-destructive"
      : tone === "primary"
      ? "text-primary"
      : "text-foreground";
  const accentBar =
    tone === "success"
      ? "bg-success"
      : tone === "danger"
      ? "bg-destructive"
      : tone === "primary"
      ? "bg-primary"
      : "bg-muted-foreground/30";
  const iconBg =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
      ? "bg-destructive/10 text-destructive"
      : tone === "primary"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-md">
      <span className={`absolute left-0 top-0 h-full w-1 ${accentBar}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
          {sublabel && (
            <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
          )}
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 ${iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
