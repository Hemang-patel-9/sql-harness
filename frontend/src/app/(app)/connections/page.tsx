import type { Metadata } from "next";
import { Plug } from "lucide-react";
import { EmptyState, Panel, PageShell } from "../../../components/ui/page-shell";
import { cn } from "../../../lib/utils";

export const metadata: Metadata = { title: "Connections" };

interface Connection {
  name: string;
  engine: string;
  host: string;
  state: string;
  tone: "active" | "ok" | "down";
}

const CONNECTIONS: Connection[] = [];

export default function ConnectionsPage() {
  const reachable = CONNECTIONS.filter((c) => c.tone !== "down").length;

  return (
    <PageShell
      eyebrow={`${reachable} reachable · ${CONNECTIONS.length - reachable} down`}
      title="Connections"
      description="Databases this workspace can query. The one in use sets the schema."
    >
      {CONNECTIONS.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No data available"
          description="Add a database connection to query it from this workspace."
        />
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {CONNECTIONS.map((connection) => (
              <li
                key={connection.name}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    connection.tone === "active" && "bg-marker",
                    connection.tone === "ok" && "bg-line-strong",
                    connection.tone === "down" && "bg-danger",
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] font-medium text-ink">
                    {connection.name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted">
                    {connection.host}
                  </span>
                </span>

                <span className="font-mono text-[11px] text-muted">
                  {connection.engine}
                </span>

                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    connection.tone === "active"
                      ? "bg-wash text-ink"
                      : "text-muted",
                  )}
                >
                  {connection.state}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PageShell>
  );
}
