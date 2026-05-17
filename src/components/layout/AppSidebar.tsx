import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  FolderClosed,
  Calculator,
  Clock,
  Wrench,
  Settings,
  Lock,
  ChevronRight,
  Database,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/logo.png";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PiStatusIndikator } from "@/components/layout/PiStatusIndikator";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: number;
  badgeTone?: "danger" | "warning" | "primary";
};

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { lock } = useAuth();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const uebersicht: NavItem[] = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, exact: true },
  ];
  const stammdaten: NavItem[] = [{ title: "Kunden", url: "/kunden", icon: Users }];
  const vertrieb: NavItem[] = [
    { title: "Angebote", url: "/angebote", icon: FileText },
    { title: "Rechnungen", url: "/rechnungen", icon: Receipt },
    { title: "Dokumente", url: "/dokumente", icon: FolderClosed },
    { title: "Steuern", url: "/steuern", icon: Calculator },
    { title: "Stundenzettel", url: "/stundenzettel", icon: Clock },
    { title: "Sonstiges", url: "/werkzeuge", icon: Wrench },
  ];
  // Einstellungen wird unten als einklappbare Gruppe gerendert
  const einstellungenAktiv = path === "/einstellungen" || path.startsWith("/einstellungen/");
  const [einstellungenOffen, setEinstellungenOffen] = useState(einstellungenAktiv);
  useEffect(() => {
    if (einstellungenAktiv) setEinstellungenOffen(true);
  }, [einstellungenAktiv]);

  const isActive = (url: string, exact = false) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const renderGroup = (key: string, items: NavItem[], withSeparator: boolean) => (
    <SidebarGroup>
      {withSeparator && (
        <div
          aria-hidden
          className={cn(
            "h-px bg-sidebar-foreground/15",
            collapsed ? "mx-2 my-1" : "mx-3 my-1",
          )}
        />
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url, item.exact);
            const showBadge = !!item.badge && item.badge > 0;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={showBadge ? `${item.title} · ${item.badge}` : item.title}
                  className={
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-primary border border-sidebar-border shadow-sm transition-colors duration-150"
                      : "transition-colors duration-150 hover:bg-sidebar-accent/60"
                  }
                >
                  <Link
                    to={item.url}
                    preload="intent"
                    onClick={closeOnMobile}
                    className="flex items-center gap-2.5"
                  >
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      <item.icon className={`h-4 w-4 ${active ? "text-sidebar-primary" : ""}`} />
                      {showBadge && collapsed && (
                        <span
                          className={cn(
                            "absolute -right-1.5 -top-1.5 grid h-3.5 min-w-3.5 place-content-center rounded-full px-1 text-[9px] font-bold text-white",
                            item.badgeTone === "danger"
                              ? "bg-destructive"
                              : item.badgeTone === "primary"
                                ? "bg-primary"
                                : "bg-warning",
                          )}
                        >
                          {item.badge! > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.title}</span>
                        {showBadge && (
                          <span
                            className={cn(
                              "grid h-5 min-w-5 place-content-center rounded-full px-1.5 text-[10px] font-bold text-white",
                              item.badgeTone === "danger"
                                ? "bg-destructive"
                                : item.badgeTone === "primary"
                                  ? "bg-primary"
                                  : "bg-warning",
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border/60 pb-3">
        <Link to="/" onClick={closeOnMobile} className="flex items-center gap-2.5 px-2 py-1">
          <img src={logo} alt="My Clean Center" className="h-9 w-9 shrink-0 object-contain" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                My Clean Center
              </span>
              <span className="text-[11px] text-muted-foreground">CRM • GmbH</span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-1 py-2">
        {renderGroup("uebersicht", uebersicht, false)}
        {renderGroup("stammdaten", stammdaten, true)}
        {renderGroup("vertrieb", vertrieb, true)}

        {/* Einstellungen — einklappbare Gruppe mit Sub-Items */}
        <SidebarGroup>
          <div
            aria-hidden
            className={cn(
              "h-px bg-sidebar-foreground/15",
              collapsed ? "mx-2 my-1" : "mx-3 my-1",
            )}
          />
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Einstellungen"
                  isActive={einstellungenAktiv}
                  onClick={() => setEinstellungenOffen((v) => !v)}
                  className={cn(
                    "transition-colors duration-150",
                    einstellungenAktiv
                      ? "bg-sidebar-accent font-medium text-sidebar-primary border border-sidebar-border shadow-sm"
                      : "hover:bg-sidebar-accent/60",
                  )}
                  aria-expanded={einstellungenOffen}
                >
                  <Settings
                    className={cn(
                      "h-4 w-4",
                      einstellungenAktiv && "text-sidebar-primary",
                    )}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">Einstellungen</span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform duration-150",
                          einstellungenOffen && "rotate-90",
                        )}
                      />
                    </>
                  )}
                </SidebarMenuButton>
                {!collapsed && einstellungenOffen && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={path === "/einstellungen"}
                      >
                        <Link to="/einstellungen" onClick={closeOnMobile}>
                          <Settings className="h-4 w-4" />
                          <span>Übersicht</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={path === "/einstellungen/datenbank"}
                      >
                        <Link to="/einstellungen/datenbank" onClick={closeOnMobile}>
                          <Database className="h-4 w-4" />
                          <span>Datenbank</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sperren"
              onClick={() => void lock()}
              className="text-muted-foreground hover:bg-sidebar-accent/60"
            >
              <Lock className="h-4 w-4" />
              {!collapsed && <span>Sperren</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <PiStatusIndikator />
      </SidebarFooter>
    </Sidebar>
  );
}
