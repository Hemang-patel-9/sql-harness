"use client";

import { useState } from "react";
import { generateSql, type QueryResponse } from "../lib/api";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setResult(await generateSql(question));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Natural Language to SQL</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Show me all users who signed up last week"
          rows={3}
          className="rounded-md border border-black/15 bg-transparent p-3 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={loading}
          className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate SQL"}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {result && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
            Generated SQL
          </h2>
          <pre className="overflow-x-auto rounded-md border border-black/15 bg-black/5 p-4 text-sm dark:border-white/20 dark:bg-white/5">
            <code>{result.sql}</code>
          </pre>
          <p className="text-xs text-black/50 dark:text-white/50">{result.note}</p>
        </section>
      )}
    </main>
  );
}
