"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../../lib/utils";

export function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  autoComplete,
  placeholder,
  error,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const errorId = useId();

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
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={cn(
          "h-11 rounded-lg border bg-surface px-3.5 text-sm text-ink",
          "outline-none transition-colors placeholder:text-muted",
          "disabled:pointer-events-none disabled:opacity-60",
          error
            ? "border-red-500/70 focus:border-red-500"
            : "border-line focus:border-line-strong",
        )}
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  autoComplete,
  error,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoComplete?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={cn(
            "h-11 w-full rounded-lg border bg-surface px-3.5 pr-10 text-sm text-ink",
            "outline-none transition-colors placeholder:text-muted",
            "disabled:pointer-events-none disabled:opacity-60",
            error
              ? "border-red-500/70 focus:border-red-500"
              : "border-line focus:border-line-strong",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-ink"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
