"use client";

import {
  Eye,
  Hash,
  KeyRound,
  Link2,
  Maximize2,
  Search,
  Table2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SchemaTable } from "../../../lib/api";
import { cn } from "../../../lib/utils";

const CARD_WIDTH = 300;
const HEADER_HEIGHT = 46;
const ROW_HEIGHT = 27;
const MAX_VISIBLE_ROWS = 14;
const INDEX_FOOTER_HEIGHT = 30;
const GAP_X = 72;
const GAP_Y = 40;
const PADDING = 56;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;

/** The canvas ground. One dot per 20px module, scaled by the zoom. */
const DOT_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='1' cy='1' r='1' fill='%237c8794' fill-opacity='0.5'/%3E%3C/svg%3E";

function nonPrimaryIndexes(table: SchemaTable) {
  return table.indexes.filter((index) => !index.isPrimary);
}

function cardHeight(table: SchemaTable): number {
  const rows = Math.min(table.columns.length, MAX_VISIBLE_ROWS);
  const footer = nonPrimaryIndexes(table).length > 0 ? INDEX_FOOTER_HEIGHT : 0;
  return HEADER_HEIGHT + rows * ROW_HEIGHT + footer;
}

interface Positioned {
  table: SchemaTable;
  x: number;
  y: number;
  width: number;
  height: number;
}

function layoutTables(tables: SchemaTable[]) {
  const columnCount = Math.max(2, Math.min(6, Math.round(Math.sqrt(tables.length)) || 1));
  const columnHeights = new Array(columnCount).fill(0);
  const positions: Positioned[] = [];

  for (const table of tables) {
    let col = 0;
    for (let i = 1; i < columnCount; i++) {
      if (columnHeights[i] < columnHeights[col]) col = i;
    }
    const x = PADDING + col * (CARD_WIDTH + GAP_X);
    const y = PADDING + columnHeights[col];
    const height = cardHeight(table);
    positions.push({ table, x, y, width: CARD_WIDTH, height });
    columnHeights[col] += height + GAP_Y;
  }

  const width = PADDING * 2 + columnCount * CARD_WIDTH + (columnCount - 1) * GAP_X;
  const height = PADDING * 2 + Math.max(0, ...columnHeights);
  return { positions, width, height };
}

interface RelationshipLine {
  key: string;
  path: string;
  sourceTable: string;
  targetTable: string;
}

function buildRelationships(positions: Positioned[]): RelationshipLine[] {
  const byName = new Map(positions.map((p) => [p.table.name, p]));
  const lines: RelationshipLine[] = [];

  for (const pos of positions) {
    for (const fk of pos.table.foreignKeys) {
      const target = byName.get(fk.referencedTable);
      if (!target || target === pos) continue;

      const sourceRowRaw = pos.table.columns.findIndex((c) => c.name === fk.columns[0]);
      const targetRowRaw = target.table.columns.findIndex((c) => c.name === fk.referencedColumns[0]);
      const sourceRow = Math.min(Math.max(sourceRowRaw, 0), MAX_VISIBLE_ROWS - 1);
      const targetRow = Math.min(Math.max(targetRowRaw, 0), MAX_VISIBLE_ROWS - 1);

      const sourceCenterX = pos.x + pos.width / 2;
      const targetCenterX = target.x + target.width / 2;
      const sourceOnLeft = sourceCenterX <= targetCenterX;

      const sourceX = sourceOnLeft ? pos.x + pos.width : pos.x;
      const sourceY = pos.y + HEADER_HEIGHT + (sourceRow + 0.5) * ROW_HEIGHT;
      const targetX = sourceOnLeft ? target.x : target.x + target.width;
      const targetY = target.y + HEADER_HEIGHT + (targetRow + 0.5) * ROW_HEIGHT;

      const dx = Math.max(60, Math.abs(targetX - sourceX) * 0.4);
      const c1x = sourceOnLeft ? sourceX + dx : sourceX - dx;
      const c2x = sourceOnLeft ? targetX - dx : targetX + dx;

      lines.push({
        key: `${pos.table.name}::${fk.constraintName}`,
        path: `M ${sourceX} ${sourceY} C ${c1x} ${sourceY}, ${c2x} ${targetY}, ${targetX} ${targetY}`,
        sourceTable: pos.table.name,
        targetTable: target.table.name,
      });
    }
  }
  return lines;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SchemaCanvas({ tables }: { tables: SchemaTable[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [eased, setEased] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );
  const easedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Smooth transition for button-triggered zoom/fit; drag and wheel stay 1:1 responsive. */
  function withEasing(run: () => void) {
    setEased(true);
    run();
    if (easedTimer.current) clearTimeout(easedTimer.current);
    easedTimer.current = setTimeout(() => setEased(false), 260);
  }

  useEffect(() => {
    return () => {
      if (easedTimer.current) clearTimeout(easedTimer.current);
    };
  }, []);

  const { positions, width, height } = useMemo(() => layoutTables(tables), [tables]);
  const lines = useMemo(() => buildRelationships(positions), [positions]);

  const relatedByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const table of tables) map.set(table.name, new Set());
    for (const line of lines) {
      map.get(line.sourceTable)?.add(line.targetTable);
      map.get(line.targetTable)?.add(line.sourceTable);
    }
    return map;
  }, [tables, lines]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitToView = useMemo(
    () => (animate = true) => {
      if (!containerSize.width || !containerSize.height || !width || !height) return;
      const scale = clamp(
        Math.min(containerSize.width / width, containerSize.height / height) * 0.94,
        MIN_ZOOM,
        1,
      );
      const apply = () => {
        setZoom(scale);
        setPan({
          x: (containerSize.width - width * scale) / 2,
          y: (containerSize.height - height * scale) / 2,
        });
      };
      if (animate) withEasing(apply);
      else apply();
    },
    [containerSize, width, height],
  );

  const fittedFor = useRef<string>("");
  useLayoutEffect(() => {
    const key = `${tables.length}:${width}:${height}`;
    if (!containerSize.width || !containerSize.height) return;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fitToView(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.width, containerSize.height, tables.length, width, height]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(event: globalThis.WheelEvent) {
      const columnList = (event.target as HTMLElement).closest(".overflow-y-auto");
      if (columnList && columnList.scrollHeight > columnList.clientHeight) {
        return; // let a long column list scroll natively instead of zooming the canvas
      }
      event.preventDefault();
      setEased(false);
      const rect = el!.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      setZoom((prevZoom) => {
        const factor = Math.exp(-event.deltaY * 0.001);
        const newZoom = clamp(prevZoom * factor, MIN_ZOOM, MAX_ZOOM);
        setPan((prevPan) => {
          const worldX = (cursorX - prevPan.x) / prevZoom;
          const worldY = (cursorY - prevPan.y) / prevZoom;
          return { x: cursorX - worldX * newZoom, y: cursorY - worldY * newZoom };
        });
        return newZoom;
      });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-table-card]")) return;
    setEased(false);
    dragState.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy });
  }

  function onPointerUp() {
    dragState.current = null;
  }

  function zoomBy(factor: number) {
    withEasing(() => {
      setZoom((z) => {
        const newZoom = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
        const cx = containerSize.width / 2;
        const cy = containerSize.height / 2;
        setPan((p) => {
          const worldX = (cx - p.x) / z;
          const worldY = (cy - p.y) / z;
          return { x: cx - worldX * newZoom, y: cy - worldY * newZoom };
        });
        return newZoom;
      });
    });
  }

  const query = search.trim().toLowerCase();
  const matched = query ? new Set(tables.filter((t) => t.name.toLowerCase().includes(query)).map((t) => t.name)) : null;
  const highlighted = matched ?? (selected ? new Set([selected, ...(relatedByTable.get(selected) ?? [])]) : null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables…"
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-7 text-xs text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-line-strong"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(0.8)}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center font-mono text-[11px] text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.25)}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <div className="mx-0.5 h-4 w-px bg-line" aria-hidden />
          <button
            type="button"
            aria-label="Fit to view"
            onClick={() => fitToView()}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className={cn(
          "relative h-[60vh] min-h-[420px] cursor-grab overflow-hidden rounded-xl",
          "border border-line bg-paper active:cursor-grabbing",
          "[box-shadow:inset_0_2px_8px_rgb(12_18_24_/_0.07)]",
        )}
        style={{
          backgroundImage: `url("${DOT_TILE}")`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: eased ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          }}
          className="relative"
        >
          <svg width={width} height={height} className="absolute left-0 top-0 overflow-visible">
            {lines.map((line) => {
              const dim = highlighted
                ? !(highlighted.has(line.sourceTable) && highlighted.has(line.targetTable))
                : false;
              return (
                <motion.path
                  key={line.key}
                  d={line.path}
                  fill="none"
                  stroke={dim ? "var(--line)" : "var(--marker)"}
                  strokeWidth={dim ? 1.25 : 1.75}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: dim ? 0.35 : 0.85 }}
                  transition={{
                    pathLength: { duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.25 },
                  }}
                />
              );
            })}
          </svg>

          {positions.map((pos, index) => (
            <TableCard
              key={pos.table.name}
              pos={pos}
              index={index}
              dimmed={highlighted ? !highlighted.has(pos.table.name) : false}
              selected={selected === pos.table.name}
              onClick={() =>
                setSelected((current) => (current === pos.table.name ? null : pos.table.name))
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 font-mono text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <KeyRound className="h-3 w-3 text-marker" /> primary key
        </span>
        <span className="flex items-center gap-1.5">
          <Link2 className="h-3 w-3" /> foreign key
        </span>
        <span className="flex items-center gap-1.5">
          <Hash className="h-3 w-3" /> index
        </span>
        <span className="ml-auto">Scroll to zoom · drag to pan · click a table to trace its relationships</span>
      </div>
    </div>
  );
}

function TableCard({
  pos,
  index,
  dimmed,
  selected,
  onClick,
}: {
  pos: Positioned;
  index: number;
  dimmed: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const { table } = pos;
  const displayIndexes = nonPrimaryIndexes(table);
  const bodyHeight = Math.min(table.columns.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;
  const isView = table.tableType !== "table";

  return (
    // Outer element owns the one-time mount entrance (staggered fade/scale-in)
    // and never re-animates after that. The inner card owns the "dimmed"
    // state (search/selection highlighting), transitioned instantly and
    // independently via a plain CSS class so it never fights the mount
    // animation's inline opacity.
    <motion.button
      type="button"
      data-table-card
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: Math.min(index * 0.025, 0.45),
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ scale: dimmed ? 1 : 1.015, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.985 }}
      style={{ left: pos.x, top: pos.y, width: pos.width }}
      className="absolute text-left"
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border bg-surface transition-[opacity,border-color,box-shadow] duration-200",
          "[box-shadow:var(--elev-inset),var(--elev-2)]",
          selected ? "border-marker shadow-[0_0_0_1px_var(--marker)]" : "border-line hover:shadow-md",
          dimmed && "opacity-30",
        )}
      >
        <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-2.5 py-2">
          {isView ? (
            <Eye className="h-3.5 w-3.5 shrink-0 text-muted" />
          ) : (
            <Table2 className="h-3.5 w-3.5 shrink-0 text-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12.5px] font-semibold text-ink">
              {table.schemaName && table.schemaName !== "public" ? `${table.schemaName}.` : ""}
              {table.name}
            </span>
          </span>
          {table.approxRowCount !== null && (
            <span className="shrink-0 font-mono text-[10px] text-muted">
              ~{table.approxRowCount.toLocaleString()}
            </span>
          )}
        </div>

        <div style={{ height: bodyHeight }} className="overflow-y-auto">
          {table.columns.map((column) => (
            <div
              key={column.name}
              title={`${column.name} · ${column.dataType}${column.nullable ? "" : " NOT NULL"}${
                column.default ? ` · default ${column.default}` : ""
              }`}
              style={{ height: ROW_HEIGHT }}
              className="flex items-center gap-1.5 px-2.5 text-[11.5px]"
            >
              <span className="grid h-3 w-3 shrink-0 place-items-center">
                {column.isPrimaryKey ? (
                  <KeyRound className="h-3 w-3 text-marker" />
                ) : column.isForeignKey ? (
                  <Link2 className="h-3 w-3 text-muted" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono",
                  column.isPrimaryKey ? "font-medium text-ink" : "text-ink-2",
                )}
              >
                {column.name}
              </span>
              <span className="shrink-0 truncate font-mono text-[10.5px] text-muted">
                {column.dataType}
                {!column.nullable && <span className="text-marker">*</span>}
              </span>
            </div>
          ))}
        </div>

        {displayIndexes.length > 0 && (
          <div
            title={displayIndexes
              .map((i) => `${i.isUnique ? "unique" : "index"} ${i.name} (${i.columns.join(", ")})`)
              .join("\n")}
            style={{ height: INDEX_FOOTER_HEIGHT }}
            className="flex items-center gap-1.5 border-t border-line px-2.5 text-[10.5px] text-muted"
          >
            <Hash className="h-3 w-3 shrink-0" />
            <span className="truncate">{displayIndexes.map((i) => i.name).join(" · ")}</span>
          </div>
        )}
      </div>
    </motion.button>
  );
}
