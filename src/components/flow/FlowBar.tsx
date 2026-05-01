import { Check, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowStep, FlowTone } from "@/lib/flow/flows";

interface Props {
  steps: FlowStep[];
  size?: "lg" | "sm" | "mini";
  className?: string;
}

const dotToneBg: Record<FlowTone, string> = {
  success: "bg-success text-success-foreground border-success",
  active: "bg-primary text-primary-foreground border-primary",
  danger: "bg-destructive text-destructive-foreground border-destructive",
  neutral: "bg-muted text-muted-foreground border-border",
  muted: "bg-background text-muted-foreground border-border",
};

const lineTone: Record<FlowTone, string> = {
  success: "bg-success",
  active: "bg-primary/40",
  danger: "bg-destructive/50",
  neutral: "bg-border",
  muted: "bg-border",
};

export function FlowBar({ steps, size = "lg", className }: Props) {
  if (size === "mini") return <MiniFlow steps={steps} className={className} />;
  if (size === "sm") return <SmFlow steps={steps} className={className} />;
  return <LgFlow steps={steps} className={className} />;
}

// ---------- Large (Detailseite) ----------
function LgFlow({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="flex items-start gap-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const nextReached = !isLast && steps[i + 1].reached;
          return (
            <div key={step.key} className="flex flex-1 items-start">
              <div className="flex flex-col items-center text-center min-w-0 flex-1">
                <div
                  className={cn(
                    "grid h-9 w-9 place-content-center rounded-full border-2 text-sm font-semibold transition-all",
                    dotToneBg[step.tone],
                    step.current && "ring-4 ring-primary/15",
                  )}
                  aria-current={step.current ? "step" : undefined}
                >
                  {step.tone === "success" || step.tone === "active" ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : step.tone === "danger" ? (
                    <XIcon className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs font-medium",
                    step.current ? "text-foreground" : step.reached ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
                {step.date && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{step.date}</p>
                )}
                {step.hint && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight px-1">
                    {step.hint}
                  </p>
                )}
              </div>
              {!isLast && (
                <div className="mt-[18px] h-0.5 flex-1 mx-1">
                  <div
                    className={cn(
                      "h-full w-full rounded-full transition-all",
                      nextReached ? lineTone.success : lineTone.muted,
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Small (Tabellen-Zeile) ----------
function SmFlow({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const nextReached = !isLast && steps[i + 1].reached;
        return (
          <div key={step.key} className="flex items-center" title={step.label + (step.hint ? ` — ${step.hint}` : "")}>
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full border transition-all",
                dotToneBg[step.tone],
                step.current && "ring-2 ring-primary/20",
              )}
            />
            {!isLast && (
              <div
                className={cn(
                  "h-0.5 w-5 transition-all",
                  nextReached ? lineTone.success : lineTone.muted,
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Mini (Listen) ----------
function MiniFlow({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {steps.map((step) => (
        <span
          key={step.key}
          className={cn("h-1.5 w-1.5 rounded-full", dotToneBg[step.tone].split(" ")[0])}
          title={step.label}
        />
      ))}
    </div>
  );
}
