"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader } from "./ui/page-shell";
import type {
  Aggregation,
  FilterOperator,
  QueryFilter,
  QueryUnderstanding,
  QuestionIntent,
} from "../lib/api";
import { cn } from "../lib/utils";

const INTENT_LABEL: Record<QuestionIntent, string> = {
  lookup: "lookup",
  aggregation: "aggregation",
  ranking: "ranking",
  trend: "trend",
  comparison: "comparison",
  unclear: "unclear",
};

/** Written the way the aggregate reads in SQL, not the way the enum spells it. */
const AGGREGATION_LABEL: Record<Aggregation, string | null> = {
  count: "count",
  distinct_count: "count distinct",
  sum: "sum",
  average: "avg",
  minimum: "min",
  maximum: "max",
  none: null,
};

const OPERATOR_LABEL: Record<FilterOperator, string> = {
  equals: "=",
  not_equals: "≠",
  greater_than: ">",
  greater_or_equal: "≥",
  less_than: "<",
  less_or_equal: "≤",
  one_of: "in",
  not_one_of: "not in",
  contains: "contains",
  between: "between",
  is_null: "is null",
  is_not_null: "is not null",
};

function Literal({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-wash px-1 text-ink">{children}</span>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface",
        "px-2.5 py-1 font-mono text-[12px] text-ink",
      )}
    >
      {children}
    </span>
  );
}

/** Always rendered, so the card keeps its shape and you can see what the
 *  model found nothing for. */
function Row({
  label,
  filled,
  children,
}: {
  label: string;
  filled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-4 py-3 first:border-t-0">
      <span className="eyebrow w-[5.5rem] shrink-0 pt-1">{label}</span>
      <div className="min-w-0 flex-1">
        {filled ? (
          children
        ) : (
          <span className="text-[13px] italic text-muted">not specified</span>
        )}
      </div>
    </div>
  );
}

function FilterLine({ filter }: { filter: QueryFilter }) {
  const takesValues = filter.operator !== "is_null" && filter.operator !== "is_not_null";
  return (
    <span className="font-mono text-[13px] leading-6">
      <span className="text-ink">{filter.field}</span>{" "}
      <span className="text-muted">{OPERATOR_LABEL[filter.operator]}</span>
      {takesValues && filter.values.length > 0 && (
        <>
          {" "}
          {filter.operator === "between" && filter.values.length === 2 ? (
            <>
              <Literal>{filter.values[0]}</Literal>{" "}
              <span className="text-muted">and</span> <Literal>{filter.values[1]}</Literal>
            </>
          ) : (
            filter.values.map((value, index) => (
              <span key={`${value}-${index}`}>
                {index > 0 && <span className="text-muted">, </span>}
                <Literal>{value}</Literal>
              </span>
            ))
          )}
        </>
      )}
    </span>
  );
}

export function UnderstandingCard({
  understanding,
  connectionLabel,
}: {
  understanding: QueryUnderstanding;
  connectionLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const { intent, entities, metrics, filters, time, grouping, ranking, ambiguities } =
    understanding;

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(understanding, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the card is still readable on screen */
    }
  }

  return (
    <Panel raised>
      <PanelHeader>
        <span className="flex min-w-0 items-center gap-2">
          <span className="eyebrow shrink-0">Understanding</span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]",
              // An unclear reading is the one you must not skim past.
              intent === "unclear"
                ? "border-marker/40 bg-marker/10 text-marker"
                : "border-line bg-surface text-ink-2",
            )}
          >
            {INTENT_LABEL[intent]}
          </span>
          <span className="truncate font-mono text-[11px] text-muted">{connectionLabel}</span>
        </span>

        <button
          type="button"
          onClick={() => void copyJson()}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs",
            "text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </PanelHeader>

      <Row label="Entities" filled={entities.length > 0}>
        <span className="flex flex-wrap gap-1.5">
          {entities.map((entity, index) => (
            <Chip key={`${entity.name}-${index}`}>
              {entity.name}
              {/* Only worth showing when the model changed the wording. */}
              {entity.mentionedAs.toLowerCase() !== entity.name.toLowerCase() && (
                <span className="text-muted">&ldquo;{entity.mentionedAs}&rdquo;</span>
              )}
            </Chip>
          ))}
        </span>
      </Row>

      <Row label="Metrics" filled={metrics.length > 0}>
        <span className="flex flex-col gap-1">
          {metrics.map((metric, index) => {
            const aggregation = AGGREGATION_LABEL[metric.aggregation];
            return (
              <span key={`${metric.name}-${index}`} className="font-mono text-[13px] leading-6">
                {aggregation ? (
                  <>
                    <span className="text-ink">{aggregation}</span>
                    <span className="text-muted">(</span>
                    <span className="text-ink-2">{metric.name}</span>
                    <span className="text-muted">)</span>
                  </>
                ) : (
                  <span className="text-ink-2">{metric.name}</span>
                )}
              </span>
            );
          })}
        </span>
      </Row>

      <Row label="Filters" filled={filters.length > 0}>
        <span className="flex flex-col gap-1">
          {filters.map((filter, index) => (
            <FilterLine key={`${filter.field}-${index}`} filter={filter} />
          ))}
        </span>
      </Row>

      <Row label="Time" filled={time !== null}>
        {time && (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-mono text-[13px]">
            <Literal>{time.expression}</Literal>
            {time.startDate && time.endDate && (
              <span className="text-muted">
                {time.startDate} → {time.endDate}
              </span>
            )}
            {time.field && <span className="text-ink-2">on {time.field}</span>}
            {time.grain && <Chip>per {time.grain}</Chip>}
          </span>
        )}
      </Row>

      <Row label="Grouping" filled={grouping.length > 0}>
        <span className="flex flex-wrap gap-1.5">
          {grouping.map((group, index) => (
            <Chip key={`${group}-${index}`}>{group}</Chip>
          ))}
        </span>
      </Row>

      <Row label="Ranking" filled={ranking !== null}>
        {ranking && (
          <span className="font-mono text-[13px]">
            {ranking.limit !== null && (
              <>
                <span className="text-ink">
                  {ranking.direction === "descending" ? "top" : "bottom"} {ranking.limit}
                </span>{" "}
              </>
            )}
            <span className="text-muted">by</span> <span className="text-ink">{ranking.by}</span>{" "}
            <span className="text-muted">
              {ranking.direction === "descending" ? "desc" : "asc"}
            </span>
          </span>
        )}
      </Row>

      {ambiguities.length > 0 && (
        <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marker" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink">
              Still open after reading the question
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {ambiguities.map((item, index) => (
                <li key={`${item}-${index}`} className="text-xs leading-relaxed text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}
