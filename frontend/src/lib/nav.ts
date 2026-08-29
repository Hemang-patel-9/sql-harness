import { Database, Plug, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the collapsed-rail tooltip and the page header. */
  blurb: string;
}

/** Where the app opens once you are signed in. `/` is the public page. */
export const APP_HOME = "/query";

export const NAV_ITEMS: NavItem[] = [
  {
    href: APP_HOME,
    label: "Query",
    icon: Terminal,
    blurb: "Ask a question, read the SQL",
  },
  {
    href: "/schema",
    label: "Schema",
    icon: Database,
    blurb: "Tables and columns in scope",
  },
  {
    href: "/connections",
    label: "Connections",
    icon: Plug,
    blurb: "Databases you can reach",
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
