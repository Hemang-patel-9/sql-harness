"use client";

import { motion } from "motion/react";
import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Avatar } from "../../../components/ui/avatar";
import {
  Panel,
  PanelHeader,
  PageShell,
} from "../../../components/ui/page-shell";
import { useSession } from "../../../components/session-provider";
import type { Session } from "../../../lib/session";
import { spring } from "../../../lib/motion";
import { useIsMounted } from "../../../lib/store";
import { cn } from "../../../lib/utils";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export default function SettingsPage() {
  const { session, signIn } = useSession();

  return (
    <PageShell
      eyebrow="Workspace preferences"
      title="Settings"
      description="Appearance and account details. Changes apply to this browser only."
    >
      <div className="flex flex-col gap-3">
        <AppearancePanel />
        {session && <ProfilePanel session={session} onSave={signIn} />}
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
          className="flex gap-1 rounded-lg border border-line bg-paper p-1"
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
                    className="absolute inset-0 rounded-md bg-surface shadow-sm"
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

/**
 * Fields start from the session and then belong to the form. Saving updates
 * the session prop, which clears `dirty` and reveals the confirmation.
 */
function ProfilePanel({
  session,
  onSave,
}: {
  session: Session;
  onSave: (session: Session) => void;
}) {
  const [name, setName] = useState(session.name);
  const [email, setEmail] = useState(session.email);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== session.name || email.trim() !== session.email;
  const valid = name.trim().length > 0 && email.trim().length > 0;

  return (
    <Panel>
      <PanelHeader>
        <span className="eyebrow">Profile</span>
      </PanelHeader>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty || !valid) return;
          setSaved(true);
          onSave({ name: name.trim(), email: email.trim() });
        }}
        className="flex flex-col gap-4 p-4"
      >
        <div className="flex items-center gap-3">
          <Avatar name={name || "Guest"} size={44} />
          <p className="text-xs text-muted">
            Avatars are generated from your name. Uploads are not wired up yet.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="settings-name"
            label="Name"
            value={name}
            onChange={setName}
          />
          <Field
            id="settings-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || !valid}
            className={cn(
              "inline-flex h-9 items-center rounded-lg bg-ink px-3.5",
              "text-sm font-medium text-paper transition-[opacity,transform] duration-150",
              "hover:opacity-90 active:scale-[0.97]",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            Save changes
          </button>

          {saved && !dirty && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-1.5 text-xs text-muted"
            >
              <Check className="h-3.5 w-3.5" />
              Saved
            </motion.span>
          )}
        </div>
      </form>
    </Panel>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 rounded-lg border border-line bg-paper px-3 text-sm text-ink",
          "outline-none transition-colors placeholder:text-muted",
          "focus:border-line-strong",
        )}
      />
    </div>
  );
}
