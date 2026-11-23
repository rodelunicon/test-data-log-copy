import { Link } from "@tanstack/react-router";

import { ThemeToggle } from "@/components/theme-toggle";

const items = [
  { to: "/", label: "Dashboard" },
  { to: "/logs", label: "Status logs" },
  { to: "/machines", label: "Manage machines" },
] as const;

export function SiteNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/" }}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          activeProps={{ className: "border-primary/60 bg-accent" }}
        >
          {item.label}
        </Link>
      ))}
      <ThemeToggle />
    </nav>
  );
}
