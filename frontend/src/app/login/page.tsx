"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "../../components/brand";
import { LoginAside } from "../../components/login-aside";
import { ThemeToggle } from "../../components/theme-toggle";
import { Button } from "../../components/ui/button";
import { Field, PasswordField } from "../../components/ui/field";
import { useSession } from "../../components/session-provider";
import { ApiError } from "../../lib/api";
import { APP_HOME } from "../../lib/nav";
import { riseItem, stagger } from "../../lib/motion";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { session, ready, login } = useSession();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace(APP_HOME);
  }, [ready, session, router]);

  const emailError =
    touched.email && !EMAIL_PATTERN.test(email.trim())
      ? "Enter a valid email address"
      : undefined;
  const passwordError =
    touched.password && password.length === 0 ? "Password is required" : undefined;

  const valid = EMAIL_PATTERN.test(email.trim()) && password.length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);
    if (!valid || submitting) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      router.replace(APP_HOME);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,7fr)_minmax(0,8fr)]">
      {/* Form */}
      <div className="dot-field relative flex flex-col px-5 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Brand href="/" />
          <ThemeToggle />
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10"
        >
          <motion.div variants={riseItem} className="panel-float rounded-2xl p-7 sm:p-8">
            <p className="eyebrow eyebrow-tick">Sign in</p>
            <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[30px]">
              Ask your database a question.
            </h1>
            <p className="mt-2 text-sm text-muted">
              Sign in to open your workspace.
            </p>

            <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
                >
                  {formError}
                </p>
              )}

              <Field
                id="login-email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                autoComplete="email"
                placeholder="ada@example.com"
                error={emailError}
                disabled={submitting}
              />
              <PasswordField
                id="login-password"
                label="Password"
                value={password}
                onChange={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                autoComplete="current-password"
                error={passwordError}
                disabled={submitting}
              />

              <Button
                type="submit"
                size="lg"
                className="group mt-1 w-full"
                disabled={submitting || (Object.keys(touched).length > 0 && !valid)}
              >
                {submitting ? "Signing in…" : "Sign in"}
                {!submitting && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>
          </motion.div>

          <motion.p variants={riseItem} className="mt-6 text-center text-sm text-muted">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-ink underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
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
