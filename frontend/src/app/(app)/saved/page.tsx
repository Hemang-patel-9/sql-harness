import type { Metadata } from "next";
import { Star } from "lucide-react";
import { SqlBlock } from "../../../components/sql-block";
import {
  Panel,
  PanelHeader,
  PageShell,
} from "../../../components/ui/page-shell";

export const metadata: Metadata = { title: "Saved" };

const SAVED = [
  {
    name: "Weekly active customers",
    owner: "You",
    sql: "SELECT date_trunc('week', placed_at) AS week,\n       count(DISTINCT customer_id) AS customers\nFROM orders\nGROUP BY week\nORDER BY week DESC\nLIMIT 12;",
  },
  {
    name: "Refund rate by channel",
    owner: "You",
    sql: "SELECT channel,\n       count(*) FILTER (WHERE refunded_at IS NOT NULL)\n         / count(*)::float AS refund_rate\nFROM orders\nGROUP BY channel;",
  },
  {
    name: "Tickets open longer than 48 hours",
    owner: "Shared with the team",
    sql: "SELECT id, customer_id, opened_at\nFROM tickets\nWHERE status = 'open'\n  AND opened_at < now() - INTERVAL '48 hours';",
  },
];

export default function SavedPage() {
  return (
    <PageShell
      eyebrow={`${SAVED.length} saved`}
      title="Saved"
      description="Queries you kept, ready to run again or hand to a teammate."
    >
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {SAVED.map((item) => (
          <Panel key={item.name} className="flex flex-col">
            <PanelHeader>
              <span className="flex min-w-0 items-center gap-2">
                <Star
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 fill-marker text-marker"
                />
                <span className="truncate text-sm font-medium text-ink">
                  {item.name}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {item.owner}
              </span>
            </PanelHeader>
            <SqlBlock sql={item.sql} className="flex-1 py-3" />
          </Panel>
        ))}
      </div>
    </PageShell>
  );
}
