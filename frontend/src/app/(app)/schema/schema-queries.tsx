import { ShieldCheck } from "lucide-react";
import type { DbEngine, SchemaQuery } from "../../../lib/api";
import { SqlBlock } from "../../../components/sql-block";

/**
 * Must match the queries actually run in backend/app/db_introspect.py
 * (SCHEMA_QUERIES) — shown up front, before "Fetch schema" runs, so nothing
 * about it is a surprise. Once a fetch succeeds the canvas shows the
 * authoritative list the backend actually ran (returned in the response)
 * instead of this static mirror.
 */
export const SCHEMA_QUERIES: Record<DbEngine, SchemaQuery[]> = {
  postgresql: [
    {
      label: "Tables",
      sql:
        "SELECT\n" +
        "    n.nspname AS table_schema,\n" +
        "    c.relname AS table_name,\n" +
        "    CASE c.relkind\n" +
        "        WHEN 'r' THEN 'table'\n" +
        "        WHEN 'v' THEN 'view'\n" +
        "        WHEN 'm' THEN 'materialized_view'\n" +
        "    END AS table_type,\n" +
        "    GREATEST(c.reltuples, 0)::bigint AS approx_row_count\n" +
        "FROM pg_catalog.pg_class c\n" +
        "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace\n" +
        "WHERE c.relkind IN ('r', 'v', 'm')\n" +
        "  AND n.nspname NOT IN ('pg_catalog', 'information_schema')\n" +
        "  AND n.nspname NOT LIKE 'pg_toast%'\n" +
        "ORDER BY n.nspname, c.relname;",
    },
    {
      label: "Columns",
      sql:
        "SELECT\n" +
        "    table_schema, table_name, column_name, ordinal_position,\n" +
        "    data_type, is_nullable, column_default,\n" +
        "    character_maximum_length, numeric_precision, numeric_scale\n" +
        "FROM information_schema.columns\n" +
        "WHERE table_schema NOT IN ('pg_catalog', 'information_schema')\n" +
        "ORDER BY table_schema, table_name, ordinal_position;",
    },
    {
      label: "Foreign keys",
      sql:
        "SELECT\n" +
        "    tc.table_schema, tc.table_name, tc.constraint_name,\n" +
        "    kcu.column_name, kcu.ordinal_position,\n" +
        "    ccu.table_name AS referenced_table, ccu.column_name AS referenced_column,\n" +
        "    rc.update_rule, rc.delete_rule\n" +
        "FROM information_schema.table_constraints tc\n" +
        "JOIN information_schema.key_column_usage kcu\n" +
        "    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema\n" +
        "JOIN information_schema.constraint_column_usage ccu\n" +
        "    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema\n" +
        "JOIN information_schema.referential_constraints rc\n" +
        "    ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema\n" +
        "WHERE tc.constraint_type = 'FOREIGN KEY'\n" +
        "  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')\n" +
        "ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position;",
    },
    {
      label: "Indexes (primary key included)",
      sql:
        "SELECT\n" +
        "    n.nspname AS table_schema, t.relname AS table_name, i.relname AS index_name,\n" +
        "    ix.indisunique AS is_unique, ix.indisprimary AS is_primary,\n" +
        "    array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns\n" +
        "FROM pg_catalog.pg_index ix\n" +
        "JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid\n" +
        "JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid\n" +
        "JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace\n" +
        "JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)\n" +
        "WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')\n" +
        "GROUP BY n.nspname, t.relname, i.relname, ix.indisunique, ix.indisprimary\n" +
        "ORDER BY n.nspname, t.relname, i.relname;",
    },
  ],
  mysql: [
    {
      label: "Tables",
      sql:
        "SELECT\n" +
        "    table_schema, table_name, table_type, table_rows AS approx_row_count\n" +
        "FROM information_schema.tables\n" +
        "WHERE table_schema = DATABASE()\n" +
        "ORDER BY table_name;",
    },
    {
      label: "Columns",
      sql:
        "SELECT\n" +
        "    table_schema, table_name, column_name, ordinal_position,\n" +
        "    column_type, is_nullable, column_default,\n" +
        "    character_maximum_length, numeric_precision, numeric_scale\n" +
        "FROM information_schema.columns\n" +
        "WHERE table_schema = DATABASE()\n" +
        "ORDER BY table_name, ordinal_position;",
    },
    {
      label: "Foreign keys",
      sql:
        "SELECT\n" +
        "    kcu.table_name, kcu.constraint_name, kcu.column_name, kcu.ordinal_position,\n" +
        "    kcu.referenced_table_name AS referenced_table,\n" +
        "    kcu.referenced_column_name AS referenced_column,\n" +
        "    rc.update_rule, rc.delete_rule\n" +
        "FROM information_schema.key_column_usage kcu\n" +
        "JOIN information_schema.referential_constraints rc\n" +
        "    ON rc.constraint_name = kcu.constraint_name AND rc.constraint_schema = kcu.table_schema\n" +
        "WHERE kcu.table_schema = DATABASE()\n" +
        "  AND kcu.referenced_table_name IS NOT NULL\n" +
        "ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position;",
    },
    {
      label: "Indexes (primary key included)",
      sql:
        "SELECT\n" +
        "    table_name, index_name, non_unique, seq_in_index, column_name\n" +
        "FROM information_schema.statistics\n" +
        "WHERE table_schema = DATABASE()\n" +
        "ORDER BY table_name, index_name, seq_in_index;",
    },
  ],
};

/** Read-only preview of the SQL a schema fetch will run — never editable. */
export function SchemaQueriesPreview({ queries }: { queries: SchemaQuery[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-success/30 bg-success-wash">
      <div className="flex items-center gap-1.5 border-b border-success/20 px-3 py-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="text-xs font-medium text-success">
          Exactly what &ldquo;Fetch schema&rdquo; runs &mdash; read-only, nothing else
        </span>
      </div>
      <div className="divide-y divide-success/15">
        {queries.map((query) => (
          <div key={query.label}>
            <p className="px-3 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-success/80">
              {query.label}
            </p>
            <SqlBlock sql={query.sql} className="p-3 pt-1.5 text-[12px] leading-5" />
          </div>
        ))}
      </div>
    </div>
  );
}
