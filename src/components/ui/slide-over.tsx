import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}

export function SlideOver({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  widthClass = "sm:max-w-3xl",
}: SlideOverProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="slide-over-overlay fixed inset-0 z-50 bg-foreground/20" />
        <DialogPrimitive.Content
          className={cn(
            "slide-over-content fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-background shadow-2xl",
            widthClass,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-8 pb-5 pt-7">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-2xl font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="grid h-8 w-8 place-content-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20">
              <X className="h-4 w-4" />
              <span className="sr-only">Schließen</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
          {footer && (
            <div className="border-t border-border bg-card/50 px-8 py-4">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
