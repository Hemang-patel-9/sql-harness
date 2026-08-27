"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "../../components/brand";
import { LoginAside } from "../../components/login-aside";
import { ThemeToggle } from "../../components/theme-toggle";
import { useSession } from "../../components/session-provider";
import { riseItem, stagger } from "../../lib/motion";
import { cn } from "../../lib/utils";

export default function LoginPage() {
  const { session, ready, signIn } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (ready && session) router.replace("/");
  }, [ready, session, router]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return;
    signIn({ name: name.trim(), email: email.trim() });
    router.replace("/");
  }

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,7fr)_minmax(0,8fr)]">
      {/* Form */}
      <div className="relative flex flex-col px-5 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Brand href="/login" />
          <ThemeToggle />
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10"
        >
          <motion.div variants={riseItem}>
            <p className="eyebrow">Sign in</p>
            <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
              Ask your database a question.
            </h1>
            <p className="mt-2 text-sm text-muted">
              Sign in to open your workspace.
            </p>
          </motion.div>

          <motion.form
            variants={riseItem}
            onSubmit={submit}
            className="mt-8 flex flex-col gap-4"
          >
            <Field
              id="login-name"
              label="Name"
              value={name}
              onChange={setName}
              autoComplete="name"
              placeholder="Ada Lovelace"
            />
            <Field
              id="login-email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="ada@example.com"
            />
            <Field
              id="login-password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />

            <button
              type="submit"
              disabled={!name.trim() || !email.trim()}
              className={cn(
                "group mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg",
                "bg-ink text-sm font-medium text-paper",
                "transition-[opacity,transform] duration-150",
                "hover:opacity-90 active:scale-[0.99]",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              Sign in
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setName("Ada Lovelace");
                setEmail("ada@example.com");
                setPassword("analytical-engine");
              }}
              className="text-xs text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Fill in the demo account
            </button>
          </motion.form>

          <motion.p
            variants={riseItem}
            className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted"
          >
            This is a demo sign-in. No password is checked and nothing leaves
            this browser — the session is kept in local storage.
          </motion.p>
        </motion.div>
      </div>

      {/* Thesis panel */}
      <aside className="relative hidden border-l border-line bg-surface lg:block">
        <LoginAside />
      </aside>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-11 rounded-lg border border-line bg-surface px-3.5 text-sm text-ink",
          "outline-none transition-colors placeholder:text-muted",
          "focus:border-line-strong",
        )}
      />
    </div>
  );
}
