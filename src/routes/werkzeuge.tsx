// Layout-Route für /werkzeuge — rendert nur den Outlet, damit
// Kindrouten (Index-Hub + einzelne Werkzeuge) korrekt erscheinen.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/werkzeuge")({
  component: () => <Outlet />,
});
