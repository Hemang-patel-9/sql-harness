"use client";

import {
  Eye,
  Fingerprint,
  Hash,
  KeyRound,
  Keyboard,
  Link2,
  Radar,
  Table2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TranscriptCycle } from "../transcript";
import { ButtonLink } from "../ui/button";
import { Reveal, RevealItem } from "../ui/reveal";
import { TiltCard, TiltLayer } from "../ui/tilt-card";
import { revealCard } from "../../lib/motion";
import { cn } from "../../lib/utils";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <Reveal stagger className="max-w-2xl">
      <RevealItem as="p" className="eyebrow eyebrow-tick">
        {eyebrow}
      </RevealItem>
      <RevealItem
        as="h2"
        className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[2.6rem]"
      >
        {title}
      </RevealItem>
      {description && (
        <RevealItem as="p" className="mt-4 text-[17px] leading-relaxed text-muted">
          {description}
        </RevealItem>
      )}
    </Reveal>
  );
}

function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("border-b border-line py-20 sm:py-28", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Watch it work                                                       */
/* ------------------------------------------------------------------ */

export function DemoSection() {
  return (
    <Section className="grid-field">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <SectionHeading
          eyebrow="Watch it work"
          title="One sentence in. One query out."
          description="No result grid, no black box. The query is the deliverable — you read it, you decide whether it deserves to run."
        />

        <Reveal className="stage">
          <TiltCard intensity={0.5} className="panel-float rounded-2xl p-6 sm:p-8">
            <TranscriptCycle
              questionClassName="text-lg sm:text-xl"
              sqlMinHeight="min-h-[15rem]"
            />
          </TiltCard>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: "01",
    title: "Connect",
    body: "Point it at PostgreSQL, MySQL or SQLite. The connection lives in your workspace and is tested before it is saved.",
  },
  {
    n: "02",
    title: "Ask",
    body: "Type the question the way you would say it to a colleague. No table names, no join syntax, no dialect trivia.",
  },
  {
    n: "03",
    title: "Read",
    body: "You get SQL back with the reasoning attached. Copy it, edit it, run it wherever you already run queries.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps, and none of them is “trust me”."
      />

      <Reveal stagger className="stage mt-14 grid gap-5 md:grid-cols-3">
        {STEPS.map((step) => (
          <RevealItem key={step.n} variants={revealCard}>
            <TiltCard intensity={1.1} className="h-full">
              <article className="panel-raised preserve-3d flex h-full flex-col rounded-2xl p-6">
                <TiltLayer depth={22} className="flex items-center gap-3">
                  <span className="tabular font-mono text-sm font-medium text-ink">
                    {step.n}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-marker" />
                </TiltLayer>

                <TiltLayer depth={14} className="mt-6">
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </TiltLayer>
              </article>
            </TiltCard>
          </RevealItem>
        ))}
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

interface Capability {
  icon: LucideIcon;
  title: string;
  body: string;
  wide?: boolean;
}

const CAPABILITIES: Capability[] = [
  {
    icon: Radar,
    title: "It has read your schema",
    body: "Tables, columns, primary keys, foreign keys, indexes. It joins on the column that actually relates the two tables instead of the one that sounds right.",
    wide: true,
  },
  {
    icon: Eye,
    title: "Nothing runs by itself",
    body: "Every answer is text. Execution stays where it has always been — in your hands.",
  },
  {
    icon: Fingerprint,
    title: "Credentials stay yours",
    body: "Connections are stored per workspace and tested in place. What leaves is the shape of your schema, never your rows.",
  },
  {
    icon: Keyboard,
    title: "Built for the keyboard",
    body: "⌘ + Enter runs the question. Copy lands the query on your clipboard. You never have to reach for the mouse.",
  },
];

export function Capabilities() {
  return (
    <Section id="capabilities" className="dot-field">
      <SectionHeading
        eyebrow="Capabilities"
        title="Precise where it matters, quiet everywhere else."
      />

      <Reveal stagger className="stage mt-14 grid gap-5 md:grid-cols-2">
        {CAPABILITIES.map((capability) => {
          const Icon = capability.icon;
          return (
            <RevealItem
              key={capability.title}
              variants={revealCard}
              className={capability.wide ? "md:col-span-2" : undefined}
            >
              <TiltCard intensity={capability.wide ? 0.6 : 1} className="h-full">
                <article className="panel-raised preserve-3d flex h-full gap-4 rounded-2xl p-6 sm:p-7">
                  <TiltLayer
                    depth={26}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink"
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </TiltLayer>

                  <TiltLayer depth={12} className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-ink">
                      {capability.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {capability.body}
                    </p>
                  </TiltLayer>
                </article>
              </TiltCard>
            </RevealItem>
          );
        })}
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

interface MockColumn {
  name: string;
  type: string;
  mark?: "pk" | "fk";
}

const MOCK_TABLES: { name: string; columns: MockColumn[] }[] = [
  {
    name: "customers",
    columns: [
      { name: "id", type: "uuid", mark: "pk" },
      { name: "email", type: "text" },
      { name: "channel", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "orders",
    columns: [
      { name: "id", type: "uuid", mark: "pk" },
      { name: "customer_id", type: "uuid", mark: "fk" },
      { name: "placed_at", type: "timestamptz" },
      { name: "total_cents", type: "integer" },
    ],
  },
  {
    name: "line_items",
    columns: [
      { name: "id", type: "uuid", mark: "pk" },
      { name: "order_id", type: "uuid", mark: "fk" },
      { name: "product_id", type: "uuid", mark: "fk" },
      { name: "quantity", type: "integer" },
    ],
  },
];

function MarkIcon({ mark }: { mark?: MockColumn["mark"] }) {
  if (mark === "pk") return <KeyRound className="h-3 w-3 text-marker" aria-hidden />;
  if (mark === "fk") return <Link2 className="h-3 w-3 text-muted" aria-hidden />;
  return <Hash className="h-3 w-3 text-muted/50" aria-hidden />;
}

/** A join drawn between two table cards: hairline, ticked at both ends. */
function Join() {
  return (
    <div
      aria-hidden
      className="hidden shrink-0 items-center self-center md:flex"
    >
      <span className="h-1.5 w-1.5 rotate-45 bg-line-strong" />
      <span className="h-px w-5 bg-line-strong lg:w-8" />
      <span className="h-1.5 w-1.5 rotate-45 bg-marker" />
    </div>
  );
}

export function SchemaSection() {
  return (
    <Section id="schema">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-14">
        <SectionHeading
          eyebrow="Schema"
          title="Every table, on one canvas."
          description="Pan and zoom the whole database. Keys, types and indexes are on the card — the same picture the query is written against."
        />

        <Reveal className="stage">
          <TiltCard intensity={0.45}>
            <div className="grid-field panel-float preserve-3d rounded-2xl p-5 sm:p-7">
              <div className="preserve-3d flex flex-col gap-3 md:flex-row md:items-start md:gap-0">
                {MOCK_TABLES.map((table, index) => (
                  <div key={table.name} className="contents">
                    {index > 0 && <Join />}
                    <TiltLayer
                      depth={index === 1 ? 30 : 16}
                      className="panel min-w-0 flex-1 overflow-hidden rounded-xl"
                    >
                      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
                        <Table2 className="h-3.5 w-3.5 text-muted" aria-hidden />
                        <span className="truncate font-mono text-xs font-medium text-ink">
                          {table.name}
                        </span>
                      </div>
                      <ul>
                        {table.columns.map((column) => (
                          <li
                            key={column.name}
                            className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0"
                          >
                            <MarkIcon mark={column.mark} />
                            <span className="truncate font-mono text-[11px] text-ink-2">
                              {column.name}
                            </span>
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                              {column.type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </TiltLayer>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Close                                                               */
/* ------------------------------------------------------------------ */

export function ClosingCta() {
  return (
    <Section className="dot-field border-b-0">
      <Reveal stagger className="mx-auto max-w-2xl text-center">
        <RevealItem as="p" className="eyebrow inline-flex">
          Ready when you are
        </RevealItem>
        <RevealItem
          as="h2"
          className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[2.75rem]"
        >
          Point it at a database and ask it something.
        </RevealItem>
        <RevealItem as="p" className="mt-4 text-[17px] text-muted">
          Free to start. No card, no sales call, no data leaving your database.
        </RevealItem>
        <RevealItem className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/signup" size="lg">
            Create an account
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary" size="lg">
            Sign in
          </ButtonLink>
        </RevealItem>
      </Reveal>
    </Section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <p className="font-mono text-[11px] text-muted">
          SQL Harness — natural language to SQL
        </p>
        <p className="font-mono text-[11px] text-muted">
          Built with Next.js, Tailwind and three.js
        </p>
      </div>
    </footer>
  );
}
