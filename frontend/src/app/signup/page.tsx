"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "../../components/brand";
import { LoginAside } from "../../components/login-aside";
import { ThemeToggle } from "../../components/theme-toggle";
import { Field, PasswordField } from "../../components/ui/field";
import { useSession } from "../../components/session-provider";
import { ApiError } from "../../lib/api";
import { riseItem, stagger } from "../../lib/motion";
import { cn } from "../../lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordIssue(password: string): string | undefined {
  if (password.length === 0) return "Password is required";
  if (password.length < 8) return "At least 8 characters";
  if (!/[A-Za-z]/.test(password)) return "Add at least one letter";
  if (!/\d/.test(password)) return "Add at least one number";
  return undefined;
}

interface Touched {
  fullName?: boolean;
  email?: boolean;
  password?: boolean;
  confirmPassword?: boolean;
}

export default function SignupPage() {
  const { session, ready, signup } = useSession();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Touched>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  useEffect(() => {
    if (ready && session) router.replace("/");
  }, [ready, session, router]);

  const nameError = touched.fullName && fullName.trim().length === 0 ? "Name is required" : undefined;
  const emailFormatError =
    touched.email && !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address" : undefined;
  const emailError = emailFormatError ?? (emailTaken ? "Email is already registered" : undefined);
  const passwordError = touched.password ? passwordIssue(password) : undefined;
  const confirmError =
    touched.confirmPassword && confirmPassword !== password ? "Passwords don't match" : undefined;

  const valid =
    fullName.trim().length > 0 &&
    EMAIL_PATTERN.test(email.trim()) &&
    passwordIssue(password) === undefined &&
    confirmPassword === password;

  function markTouched(field: keyof Touched) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
    setFormError(null);
    setEmailTaken(false);
    if (!valid || submitting) return;

    setSubmitting(true);
    try {
      await signup({ fullName: fullName.trim(), email: email.trim(), password });
      router.replace("/");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setEmailTaken(true);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,7fr)_minmax(0,8fr)]">
      {/* Form */}
      <div className="relative flex flex-col px-5 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Brand href="/signup" />
          <ThemeToggle />
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10"
        >
          <motion.div variants={riseItem}>
            <p className="eyebrow">Create an account</p>
            <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
              Start asking questions in plain English.
            </h1>
            <p className="mt-2 text-sm text-muted">
              Takes a minute. No credit card.
            </p>
          </motion.div>

          <motion.form
            variants={riseItem}
            onSubmit={submit}
            noValidate
            className="mt-8 flex flex-col gap-4"
          >
            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 text-sm text-red-500"
              >
                {formError}
              </p>
            )}

            <Field
              id="signup-name"
              label="Name"
              value={fullName}
              onChange={setFullName}
              onBlur={() => markTouched("fullName")}
              autoComplete="name"
              placeholder="Ada Lovelace"
              error={nameError}
              disabled={submitting}
            />
            <Field
              id="signup-email"
              label="Email"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setEmailTaken(false);
              }}
              onBlur={() => markTouched("email")}
              autoComplete="email"
              placeholder="ada@example.com"
              error={emailError}
              disabled={submitting}
            />
            <PasswordField
              id="signup-password"
              label="Password"
              value={password}
              onChange={setPassword}
              onBlur={() => markTouched("password")}
              autoComplete="new-password"
              error={passwordError}
              hint={passwordError ? undefined : "8+ characters, with a letter and a number"}
              disabled={submitting}
            />
            <PasswordField
              id="signup-confirm-password"
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              onBlur={() => markTouched("confirmPassword")}
              autoComplete="new-password"
              error={confirmError}
              disabled={submitting}
            />

            <button
              type="submit"
              disabled={submitting || (Object.keys(touched).length > 0 && !valid)}
              className={cn(
                "group mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg",
                "bg-ink text-sm font-medium text-paper",
                "transition-[opacity,transform] duration-150",
                "hover:opacity-90 active:scale-[0.99]",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {submitting ? "Creating account…" : "Create account"}
              {!submitting && (
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              )}
            </button>
          </motion.form>

          <motion.p variants={riseItem} className="mt-8 border-t border-line pt-4 text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">
              Sign in
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
