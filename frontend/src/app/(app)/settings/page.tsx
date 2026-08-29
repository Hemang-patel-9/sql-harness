"use client";

import { motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar } from "../../../components/ui/avatar";
import {
  Panel,
  PanelHeader,
  PageShell,
} from "../../../components/ui/page-shell";
import { useSession } from "../../../components/session-provider";
import type { AuthUser } from "../../../lib/api";
import { spring } from "../../../lib/motion";
import { useIsMounted } from "../../../lib/store";
import { cn } from "../../../lib/utils";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export default function SettingsPage() {
  const { session } = useSession();

  return (
    <PageShell
      eyebrow="Workspace preferences"
      title="Settings"
      description="Appearance and account details."
    >
      <div className="flex flex-col gap-4">
        <AppearancePanel />
        {session && <ProfilePanel session={session} />}
      </div>
    </PageShell>
  );
}

function AppearancePanel() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsMounted();

  return (
    <Panel>
      <PanelHeader>
        <span className="eyebrow">Appearance</span>
      </PanelHeader>

      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-medium text-ink">Colour mode</p>
          <p className="mt-0.5 text-xs text-muted">
            Light is the default. Your choice is remembered on this device.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Colour mode"
          className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1 [box-shadow:inset_0_1px_2px_rgb(12_18_24_/_0.05)]"
        >
          {THEMES.map((option) => {
            const selected = mounted && resolvedTheme === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-md px-3 py-1.5",
                  "text-xs font-medium transition-colors",
                  selected ? "text-ink" : "text-muted hover:text-ink-2",
                )}
              >
                {selected && (
                  <motion.span
                    layoutId="theme-pill"
                    transition={spring}
                    className="absolute inset-0 rounded-md bg-surface [box-shadow:var(--elev-inset),var(--elev-1)]"
                  />
                )}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function ProfilePanel({ session }: { session: AuthUser }) {
  return (
    <Panel>
      <PanelHeader>
        <span className="eyebrow">Profile</span>
      </PanelHeader>

      <div className="flex items-center gap-4 p-4">
        <Avatar name={session.fullName} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{session.fullName}</p>
          <p className="truncate font-mono text-xs text-muted">{session.email}</p>
        </div>
      </div>
    </Panel>
  );
}
