import type { Metadata } from "next";
import { History as HistoryIcon } from "lucide-react";
import { SqlBlock } from "../../../components/sql-block";
import { EmptyState, Panel, PageShell } from "../../../components/ui/page-shell";

export const metadata: Metadata = { title: "History" };

interface Run {
  question: string;
  sql: string;
  at: string;
  rows: string;
  ms: string;
}

const RUNS: Run[] = [];

export default function HistoryPage() {
  return (
    <PageShell
      eyebrow={`${RUNS.length} queries · last 7 days`}
      title="History"
      description="Every question you have asked, with the SQL it produced."
    >
      {RUNS.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No data available"
          description="Ask a question on the Query page and it will show up here."
        />
      ) : (
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
      )}
    </PageShell>
  );
}
