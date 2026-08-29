"use client";

import { useState } from "react";
import {
  ApiError,
  createConnection,
  updateConnection,
} from "../../../lib/api";
import type { Connection, DbEngine, SslMode } from "../../../lib/api";
import { Field, PasswordField } from "../../../components/ui/field";
import { EngineSelect } from "../../../components/ui/engine-select";
import { DemoQueryPreview } from "./demo-query";
import { cn } from "../../../lib/utils";

const DEFAULT_PORTS: Record<DbEngine, number> = {
  postgresql: 5432,
  mysql: 3306,
};

const KNOWN_DEFAULT_PORTS = new Set(Object.values(DEFAULT_PORTS).map(String));

interface FormState {
  label: string;
  engine: DbEngine | "";
  host: string;
  port: string;
  databaseName: string;
  username: string;
  password: string;
  ssl: boolean;
}

const EMPTY_FORM: FormState = {
  label: "",
  engine: "",
  host: "",
  port: "",
  databaseName: "",
  username: "",
  password: "",
  ssl: true,
};

function formFromConnection(connection: Connection): FormState {
  return {
    label: connection.label,
    engine: connection.engine,
    host: connection.host,
    port: String(connection.port),
    databaseName: connection.databaseName,
    username: connection.username,
    password: "",
    ssl: connection.sslMode === "require",
  };
}

function fieldError(
  form: FormState,
  touched: Record<string, boolean>,
  field: keyof FormState,
  passwordRequired: boolean,
): string | undefined {
  if (!touched[field]) return undefined;
  switch (field) {
    case "label":
      return form.label.trim() ? undefined : "Label is required";
    case "engine":
      return form.engine ? undefined : "Choose a database engine";
    case "host":
      return form.host.trim() ? undefined : "Host is required";
    case "port": {
      const port = Number(form.port);
      return form.port.trim() && Number.isInteger(port) && port >= 1 && port <= 65535
        ? undefined
        : "Enter a valid port (1-65535)";
    }
    case "databaseName":
      return form.databaseName.trim() ? undefined : "Database name is required";
    case "username":
      return form.username.trim() ? undefined : "Username is required";
    case "password":
      return passwordRequired && !form.password ? "Password is required" : undefined;
    default:
      return undefined;
  }
}

function isFormValid(form: FormState, passwordRequired: boolean): boolean {
  const port = Number(form.port);
  return (
    form.label.trim().length > 0 &&
    form.engine !== "" &&
    form.host.trim().length > 0 &&
    form.port.trim().length > 0 &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    form.databaseName.trim().length > 0 &&
    form.username.trim().length > 0 &&
    (!passwordRequired || form.password.length > 0)
  );
}

export function ConnectionForm({
  mode,
  connection,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  connection?: Connection;
  onSaved: (connection: Connection) => void;
  onCancel: () => void;
}) {
  const passwordRequired = mode === "create";
  const [form, setForm] = useState<FormState>(() =>
    connection ? formFromConnection(connection) : EMPTY_FORM,
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [apiFieldErrors, setApiFieldErrors] = useState<Record<string, string>>({});

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setApiFieldErrors((errors) => {
      const backendKey = field === "databaseName" ? "database_name" : field;
      if (!(backendKey in errors)) return errors;
      const next = { ...errors };
      delete next[backendKey];
      return next;
    });
  }

  function handleEngineChange(engine: DbEngine) {
    setForm((f) => {
      const shouldFillPort = f.port.trim() === "" || KNOWN_DEFAULT_PORTS.has(f.port.trim());
      return { ...f, engine, port: shouldFillPort ? String(DEFAULT_PORTS[engine]) : f.port };
    });
  }

  function markTouched(field: keyof FormState) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({
      label: true,
      engine: true,
      host: true,
      port: true,
      databaseName: true,
      username: true,
      password: true,
    });
    setFormError(null);
    if (!isFormValid(form, passwordRequired) || submitting) return;

    setSubmitting(true);
    try {
      const input = {
        label: form.label.trim(),
        engine: form.engine as DbEngine,
        host: form.host.trim(),
        port: Number(form.port),
        databaseName: form.databaseName.trim(),
        username: form.username.trim(),
        sslMode: (form.ssl ? "require" : "disable") as SslMode,
      };

      const saved =
        mode === "create"
          ? await createConnection({ ...input, password: form.password })
          : await updateConnection(connection!.id, {
              ...input,
              password: form.password || undefined,
            });

      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        setApiFieldErrors(error.fieldErrors);
        setFormError(Object.keys(error.fieldErrors).length ? null : error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <EngineSelect
          id="conn-engine"
          label="Database engine"
          value={form.engine}
          onChange={handleEngineChange}
          onBlur={() => markTouched("engine")}
          error={fieldError(form, touched, "engine", passwordRequired) ?? apiFieldErrors.engine}
          disabled={submitting}
        />
        <Field
          id="conn-label"
          label="Label"
          value={form.label}
          onChange={(v) => updateField("label", v)}
          onBlur={() => markTouched("label")}
          placeholder="Production analytics"
          error={fieldError(form, touched, "label", passwordRequired) ?? apiFieldErrors.label}
          disabled={submitting}
        />
      </div>

      {form.engine && <DemoQueryPreview engine={form.engine} />}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field
          id="conn-host"
          label="Host"
          value={form.host}
          onChange={(v) => updateField("host", v)}
          onBlur={() => markTouched("host")}
          placeholder="db.example.com"
          error={fieldError(form, touched, "host", passwordRequired) ?? apiFieldErrors.host}
          disabled={submitting}
        />
        <Field
          id="conn-port"
          label="Port"
          value={form.port}
          onChange={(v) => updateField("port", v.replace(/[^\d]/g, ""))}
          onBlur={() => markTouched("port")}
          placeholder="5432"
          error={fieldError(form, touched, "port", passwordRequired) ?? apiFieldErrors.port}
          disabled={submitting}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="conn-database"
          label="Database name"
          value={form.databaseName}
          onChange={(v) => updateField("databaseName", v)}
          onBlur={() => markTouched("databaseName")}
          error={fieldError(form, touched, "databaseName", passwordRequired) ?? apiFieldErrors.database_name}
          disabled={submitting}
        />
        <Field
          id="conn-username"
          label="Username"
          value={form.username}
          onChange={(v) => updateField("username", v)}
          onBlur={() => markTouched("username")}
          autoComplete="off"
          error={fieldError(form, touched, "username", passwordRequired) ?? apiFieldErrors.username}
          disabled={submitting}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <PasswordField
          id="conn-password"
          label={mode === "edit" ? "New password" : "Password"}
          value={form.password}
          onChange={(v) => updateField("password", v)}
          onBlur={() => markTouched("password")}
          autoComplete="new-password"
          error={fieldError(form, touched, "password", passwordRequired) ?? apiFieldErrors.password}
          hint={mode === "edit" ? "Leave blank to keep the current password" : undefined}
          disabled={submitting}
        />

        <label className="flex items-center gap-2.5 pt-6 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={form.ssl}
            onChange={(e) => updateField("ssl", e.target.checked)}
            disabled={submitting}
            className="h-4 w-4 rounded border-line-strong accent-ink"
          />
          Require SSL
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper",
            "transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {submitting ? "Saving…" : mode === "create" ? "Add connection" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
        {mode === "edit" && (
          <p className="ml-auto text-xs text-muted">
            Saving asks you to fire the demo query again.
          </p>
        )}
      </div>
    </form>
  );
}
