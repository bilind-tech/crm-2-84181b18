interface Props {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "primary";
  icon?: React.ComponentType<{ className?: string }>;
}

export function KpiCard({ label, value, sublabel, tone = "default", icon: Icon }: KpiProps) {
  const valueColor =
    tone === "success"
      ? "text-success"
      : tone === "danger"
      ? "text-destructive"
      : tone === "warning"
      ? "text-warning"
      : tone === "primary"
      ? "text-primary"
      : "text-foreground";
  const accentBar =
    tone === "success"
      ? "bg-success"
      : tone === "danger"
      ? "bg-destructive"
      : tone === "warning"
      ? "bg-warning"
      : tone === "primary"
      ? "bg-primary"
      : "bg-muted-foreground/30";
  const iconBg =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
      ? "bg-destructive/10 text-destructive"
      : tone === "warning"
      ? "bg-warning/10 text-warning"
      : tone === "primary"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-md sm:p-5">
      <span className={`absolute left-0 top-0 h-full w-1 ${accentBar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
            {label}
          </p>
          <p className={`mt-1.5 truncate text-lg font-bold tracking-tight sm:mt-2 sm:text-2xl ${valueColor}`}>
            {value}
          </p>
          {sublabel && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{sublabel}</p>
          )}
        </div>
        {Icon && (
          <div className={`hidden shrink-0 rounded-lg p-2 sm:block ${iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
