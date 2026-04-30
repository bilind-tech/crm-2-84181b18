import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  FolderClosed,
  Settings,
  ClipboardList,
  AlertTriangle,
  Calculator,
  Lock,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/logo.png";
import { useAuth } from "@/lib/auth";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const uebersicht: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, exact: true },
];
const stammdaten: NavItem[] = [
  { title: "Kunden", url: "/kunden", icon: Users },
];
const vertrieb: NavItem[] = [
  { title: "Angebote", url: "/angebote", icon: FileText },
  { title: "Aufträge", url: "/auftraege", icon: ClipboardList },
  { title: "Rechnungen", url: "/rechnungen", icon: Receipt },
  { title: "Mahnwesen", url: "/mahnwesen", icon: AlertTriangle },
  { title: "Dokumente", url: "/dokumente", icon: FolderClosed },
  { title: "Steuer-Export", url: "/steuer-export", icon: Calculator },
];
const system: NavItem[] = [
  { title: "Einstellungen", url: "/einstellungen", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { lock } = useAuth();

  const isActive = (url: string, exact = false) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url, item.exact);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className={
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-primary border border-sidebar-border shadow-sm"
                      : "hover:bg-sidebar-accent/60"
                  }
                >
                  <Link to={item.url} className="flex items-center gap-2.5">
                    <item.icon className={`h-4 w-4 ${active ? "text-sidebar-primary" : ""}`} />
                    {!collapsed && <span>{item.title}</span>}
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
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1">
          <img
            src={logo}
            alt="My Clean Center"
            className="h-9 w-9 shrink-0 object-contain"
          />
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
        {renderGroup("Übersicht", uebersicht)}
        {renderGroup("Stammdaten", stammdaten)}
        {renderGroup("Vertrieb & Abrechnung", vertrieb)}
        {renderGroup("System", system)}
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
      </SidebarFooter>
    </Sidebar>
  );
}
