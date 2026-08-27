import { cn } from "../lib/utils";

const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "BY", "ORDER", "HAVING", "LIMIT",
  "OFFSET", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "ON",
  "AS", "AND", "OR", "NOT", "IN", "IS", "NULL", "LIKE", "ILIKE", "BETWEEN",
  "CASE", "WHEN", "THEN", "ELSE", "END", "WITH", "UNION", "ALL", "DISTINCT",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "DESC", "ASC", "INTERVAL", "DATE_TRUNC",
  "NOW", "CURRENT_DATE", "COALESCE", "CAST", "OVER", "PARTITION",
]);

const TOKEN =
  /(--[^\n]*|'(?:[^']|'')*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|[^\s])/g;

/**
 * Syntax emphasis without colour. Keywords carry weight, identifiers recede,
 * and literals get the same amber wash that marks "this one" everywhere else.
 */
export function SqlBlock({
  sql,
  className,
}: {
  sql: string;
  className?: string;
}) {
  const tokens = sql.match(TOKEN) ?? [sql];

  return (
    <pre
      className={cn(
        "overflow-x-auto p-4 font-mono text-[13px] leading-6 text-ink-2",
        className,
      )}
    >
      <code>
        {tokens.map((token, index) => {
          const key = `${index}-${token}`;

          if (token.startsWith("--")) {
            return (
              <span key={key} className="text-muted italic">
                {token}
              </span>
            );
          }
          if (token.startsWith("'") || /^\d/.test(token)) {
            return (
              <span key={key} className="rounded-sm bg-wash px-0.5 text-ink">
                {token}
              </span>
            );
          }
          if (KEYWORDS.has(token.toUpperCase())) {
            return (
              <span key={key} className="font-medium text-ink">
                {token}
              </span>
            );
          }
          return <span key={key}>{token}</span>;
        })}
      </code>
    </pre>
  );
}
