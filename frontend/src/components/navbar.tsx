"use client";

import { Menu } from "lucide-react";
import { Brand } from "./brand";
import { NotificationsMenu } from "./notifications-menu";
import { ProfileMenu } from "./profile-menu";
import { ThemeToggle } from "./theme-toggle";
import { IconButton } from "./ui/icon-button";
import { cn } from "../lib/utils";

export function Navbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 px-3 sm:px-4",
        "border-b border-line bg-surface/85 backdrop-blur-md",
      )}
    >
      <IconButton
        label="Open navigation"
        onClick={onOpenMenu}
        className="md:hidden"
      >
        <Menu className="h-4.5 w-4.5" />
      </IconButton>

      <Brand className="ml-1 md:ml-0.5" />

      <div className="flex-1" />

      <nav className="flex items-center gap-0.5" aria-label="Account">
        <NotificationsMenu />
        <ThemeToggle />

        <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />

        <ProfileMenu />
      </nav>
    </header>
  );
}
