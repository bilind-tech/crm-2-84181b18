import { Outlet, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import appCss from "../styles.css?url";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LockScreen } from "@/components/layout/LockScreen";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { startScheduler } from "@/lib/mock/scheduler";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MCC Reinigungs-CRM" },
      { name: "description", content: "Lokales CRM- und Rechnungssystem für den Reinigungsbetrieb." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Shell />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function TopLoader() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  if (!isLoading) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-primary/15">
      <div className="h-full w-1/3 animate-top-loader bg-primary" />
    </div>
  );
}

function Shell() {
  const { unlocked } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  useEffect(() => {
    if (!unlocked) return;
    startScheduler({
      onResult: (r) => {
        if (r.erzeugteLaeufe > 0) {
          toast.success(`${r.erzeugteLaeufe} neue Rechnung(en) aus Daueraufträgen erzeugt`);
          qc.invalidateQueries({ queryKey: ["dauerauftraege"] });
          qc.invalidateQueries({ queryKey: ["dauerauftrag-laeufe"] });
          qc.invalidateQueries({ queryKey: ["rechnungen"] });
          qc.invalidateQueries({ queryKey: ["benachrichtigungen"] });
          qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
        }
      },
    });
  }, [unlocked, qc]);
  if (!unlocked) return <LockScreen />;
  return (
    <SidebarProvider>
      <TopLoader />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main key={pathname} className="flex-1 p-4 motion-safe:animate-fade-in-fast sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
