"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Brand } from "./brand";
import { NotificationsMenu } from "./notifications-menu";
import { ProfileMenu } from "./profile-menu";
import { ThemeToggle } from "./theme-toggle";
import { IconButton } from "./ui/icon-button";
import { APP_HOME } from "../lib/nav";
import { cn } from "../lib/utils";

export function Navbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { scrollY } = useScroll();
  const [lifted, setLifted] = useState(false);

  // The bar only casts a shadow once there is something underneath it.
  useMotionValueEvent(scrollY, "change", (value) => setLifted(value > 8));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 px-3 sm:px-4",
        "border-b border-line bg-surface/80 backdrop-blur-xl",
        "transition-shadow duration-300",
        lifted && "[box-shadow:var(--elev-2)]",
      )}
    >
      <IconButton
        label="Open navigation"
        onClick={onOpenMenu}
        className="md:hidden"
      >
        <Menu className="h-4.5 w-4.5" />
      </IconButton>

      <Brand href={APP_HOME} className="ml-1 md:ml-0.5" />

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
