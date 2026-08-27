import type { Metadata } from "next";
import { SqlBlock } from "../../../components/sql-block";
import { Panel, PageShell } from "../../../components/ui/page-shell";

export const metadata: Metadata = { title: "History" };

const RUNS = [
  {
    question: "How many orders shipped late last week?",
    sql: "SELECT count(*) FROM orders\nWHERE shipped_at > promised_at\n  AND placed_at >= now() - INTERVAL '7 days';",
    at: "Today, 14:02",
    rows: "1 row",
    ms: "0.31s",
  },
  {
    question: "Revenue by channel for Q3",
    sql: "SELECT channel, sum(total_cents) / 100 AS revenue\nFROM orders\nWHERE placed_at BETWEEN '2026-07-01' AND '2026-09-30'\nGROUP BY channel\nORDER BY revenue DESC;",
    at: "Today, 11:47",
    rows: "6 rows",
    ms: "0.88s",
  },
  {
    question: "Customers who have never opened a support ticket",
    sql: "SELECT c.id, c.email\nFROM customers c\nLEFT JOIN tickets t ON t.customer_id = c.id\nWHERE t.id IS NULL;",
    at: "Yesterday, 17:20",
    rows: "4,912 rows",
    ms: "1.24s",
  },
];

export default function HistoryPage() {
  return (
    <PageShell
      eyebrow={`${RUNS.length} queries · last 7 days`}
      title="History"
      description="Every question you have asked, with the SQL it produced."
    >
      <ul className="flex flex-col gap-3">
        {RUNS.map((run) => (
          <li key={run.question}>
            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-3.5">
                <p className="text-sm font-medium text-ink">{run.question}</p>
                <p className="font-mono text-[11px] text-muted">
                  {run.at} · {run.rows} · {run.ms}
                </p>
              </div>
              <div className="border-t border-line">
                <SqlBlock sql={run.sql} className="py-3" />
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
