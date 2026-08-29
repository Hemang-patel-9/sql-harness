import { ShieldCheck } from "lucide-react";
import type { DbEngine } from "../../../lib/api";
import { SqlBlock } from "../../../components/sql-block";

/**
 * Must match the queries actually run in backend/app/db_probe.py
 * (_probe_postgres / _probe_mysql) — shown up front so nothing about
 * "fire demo query" is a surprise: it's this, verbatim, and nothing else.
 */
export const DEMO_QUERIES: Record<DbEngine, string> = {
  postgresql:
    "SELECT\n" +
    "    current_user AS current_user,\n" +
    "    current_database() AS current_database,\n" +
    "    (SELECT count(*) FROM information_schema.tables\n" +
    "     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) AS table_count;",
  mysql:
    "SELECT CURRENT_USER() AS current_user, DATABASE() AS current_database,\n" +
    "       (SELECT COUNT(*) FROM information_schema.tables\n" +
    "        WHERE table_schema = DATABASE()) AS table_count;",
};

/** The trust cue: exactly what will run, up front, in green. */
export function DemoQueryPreview({ engine }: { engine: DbEngine }) {
  return (
    <div className="overflow-hidden rounded-lg border border-success/30 bg-success-wash">
      <div className="flex items-center gap-1.5 border-b border-success/20 px-3 py-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="text-xs font-medium text-success">
          Exactly what &ldquo;Fire demo query&rdquo; runs &mdash; read-only, nothing else
        </span>
      </div>
      <SqlBlock sql={DEMO_QUERIES[engine]} className="p-3 text-[12px] leading-5" />
    </div>
  );
}
