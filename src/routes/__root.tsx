import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";

// Im SPA-Build (Pi) liefert pi-spa/index.html bereits <html>/<body>.
// Dann darf der Router-Shell KEIN zweites <html> rendern → sonst weißer Screen.
declare const __MCC_SPA__: boolean | undefined;
const IS_SPA = typeof __MCC_SPA__ !== "undefined" && __MCC_SPA__ === true;
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import appCss from "../styles.css?url";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LockScreen } from "@/components/layout/LockScreen";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UeberfaelligPopup } from "@/components/notifications/UeberfaelligPopup";
import { GlobalDropZone } from "@/components/dokumente/GlobalDropZone";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { installChunkErrorReload, clearChunkReloadFlag } from "@/lib/chunkErrorReload";

if (typeof window !== "undefined") {
  installChunkErrorReload();
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MCC Reinigungs-CRM" },
      {
        name: "description",
        content: "Lokales CRM- und Rechnungssystem für den Reinigungsbetrieb.",
      },
      { property: "og:title", content: "MCC Reinigungs-CRM" },
      { name: "twitter:title", content: "MCC Reinigungs-CRM" },
      {
        property: "og:description",
        content: "Lokales CRM- und Rechnungssystem für den Reinigungsbetrieb.",
      },
      {
        name: "twitter:description",
        content: "Lokales CRM- und Rechnungssystem für den Reinigungsbetrieb.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/27767323-00e8-41f2-983d-70471b4acef2/id-preview-bef97fbb--654d32e6-fa04-4c44-af92-d308868b6c93.lovable.app-1777838953314.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/27767323-00e8-41f2-983d-70471b4acef2/id-preview-bef97fbb--654d32e6-fa04-4c44-af92-d308868b6c93.lovable.app-1777838953314.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  if (IS_SPA) {
    return <>{children}</>;
  }
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
  useEffect(() => {
    // Erfolgreicher Mount nach Reload → Flag löschen, damit beim nächsten
    // echten Chunk-Fehler wieder ein Reload-Versuch erfolgt.
    clearChunkReloadFlag();
  }, []);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Bei 4xx (außer 408/429) gar nicht retryen — sonst nur max. 2×.
            retry: (failureCount, error: unknown) => {
              const status =
                typeof error === "object" && error !== null && "status" in error
                  ? Number((error as { status?: number }).status)
                  : 0;
              if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
                return false;
              }
              return failureCount < 2;
            },
            // Exponentielles Backoff: 1s → 3s → 9s, gedeckelt bei 15s.
            // Bremst Retry-Stürme nach einem 429 und gibt dem Bucket Zeit zum
            // Erholen, bevor das nächste Bündel Calls losgeht.
            retryDelay: (attempt) => Math.min(1000 * 3 ** attempt, 15_000),
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Shell />
          <Toaster richColors position="top-center" />
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
  const qcRef = useRef(qc);
  qcRef.current = qc;

  // Standalone-Routen ohne Sidebar/Header/Lock (z.B. Handy-Upload-Brücke)
  const isStandalone = pathname.startsWith("/m/");

  // SSE nur, wenn der User entsperrt hat.
  useLiveEvents(unlocked && !isStandalone);

  useEffect(() => {
    if (!unlocked) return;
    // Einmal-Cleanup alter Mock-/Demo-LocalStorage-Reste.
    try {
      const drop: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("mcc_mock")) drop.push(k);
      }
      drop.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    void qcRef.current;
  }, [unlocked]);

  if (isStandalone) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-background">
        <Outlet />
      </div>
    );
  }

  if (!unlocked) return <LockScreen />;
  return (
    <SidebarProvider>
      <TopLoader />
      <div className="flex min-h-screen w-full overflow-x-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <UeberfaelligPopup />

      <GlobalDropZone />
    </SidebarProvider>
  );
}
