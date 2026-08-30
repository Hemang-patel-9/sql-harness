"use client";

import {
  Crosshair,
  Eye,
  Hash,
  KeyRound,
  Keyboard,
  Link2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SchemaTable } from "../../../lib/api";
import {
  accentToken,
  buildAccents,
  buildRelationships,
  layoutTables,
  worldBounds,
  type Positioned,
} from "./schema-layout";
import { layoutStore, type Overrides } from "./layout-store";
import { TableCard } from "./table-card";
import { TableDetail } from "./table-detail";
import { useStore } from "../../../lib/store";
import { cn } from "../../../lib/utils";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
/** Below this much pointer travel, a press on a card is a click, not a drag. */
const DRAG_THRESHOLD = 4;

/** The canvas ground. One dot per 20px module, scaled by the zoom. */
const DOT_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='1' cy='1' r='1' fill='%237c8794' fill-opacity='0.5'/%3E%3C/svg%3E";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------------------ */
/* Toolbar pieces                                                      */
/* ------------------------------------------------------------------ */

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md transition-colors",
        active ? "bg-wash text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
        "transition-colors",
        active ? "bg-wash text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Minimap                                                             */
/* ------------------------------------------------------------------ */

const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 116;

function Minimap({
  positions,
  world,
  viewport,
  pan,
  zoom,
  selected,
  accents,
  onJump,
}: {
  positions: Positioned[];
  world: { width: number; height: number };
  accents: Map<string, string>;
  viewport: { width: number; height: number };
  pan: { x: number; y: number };
  zoom: number;
  selected: string | null;
  onJump: (worldX: number, worldY: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const scale = Math.min(
    MINIMAP_WIDTH / Math.max(world.width, 1),
    MINIMAP_HEIGHT / Math.max(world.height, 1),
  );
  const offsetX = (MINIMAP_WIDTH - world.width * scale) / 2;
  const offsetY = (MINIMAP_HEIGHT - world.height * scale) / 2;

  function jumpFromEvent(clientX: number, clientY: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onJump(
      (clientX - rect.left - offsetX) / scale,
      (clientY - rect.top - offsetY) / scale,
    );
  }

  return (
    <div
      data-canvas-overlay
      className="panel-float absolute bottom-3 left-3 z-20 overflow-hidden rounded-lg"
    >
      <svg
        ref={ref}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="block cursor-pointer touch-none"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          jumpFromEvent(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging.current) jumpFromEvent(event.clientX, event.clientY);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        <g transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
          {positions.map((pos) => (
            <rect
              key={pos.table.name}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
              rx={12}
              fill={accents.get(pos.table.name) ?? accentToken(0)}
              opacity={selected && selected !== pos.table.name ? 0.3 : 0.85}
            />
          ))}
        </g>

        {/* What you are currently looking at. */}
        <rect
          x={offsetX + (-pan.x / zoom) * scale}
          y={offsetY + (-pan.y / zoom) * scale}
          width={(viewport.width / zoom) * scale}
          height={(viewport.height / zoom) * scale}
          fill="var(--wash)"
          stroke="var(--marker)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export function SchemaCanvas({
  tables,
  connectionId,
}: {
  tables: SchemaTable[];
  connectionId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [eased, setEased] = useState(false);
  const store = useMemo(() => layoutStore(connectionId), [connectionId]);
  const overrides = useStore(store);
  const [dragged, setDragged] = useState<{ name: string; x: number; y: number } | null>(
    null,
  );
  const [isolate, setIsolate] = useState(false);
  const [showViews, setShowViews] = useState(true);
  const [onlyRelated, setOnlyRelated] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const easedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Smooth for button-driven moves; drag and wheel stay 1:1 responsive. */
  const withEasing = useCallback((run: () => void) => {
    setEased(true);
    run();
    if (easedTimer.current) clearTimeout(easedTimer.current);
    easedTimer.current = setTimeout(() => setEased(false), 260);
  }, []);

  useEffect(() => {
    return () => {
      if (easedTimer.current) clearTimeout(easedTimer.current);
    };
  }, []);

  /* -- layout ---------------------------------------------------- */

  const base = useMemo(() => layoutTables(tables), [tables]);
  const accents = useMemo(() => buildAccents(tables), [tables]);

  // Loaded after mount so the server render and the first client render
  // agree; localStorage is not available to either.
  const allPositions = useMemo(
    () =>
      base.positions.map((pos) => {
        const moved =
          dragged?.name === pos.table.name ? dragged : overrides[pos.table.name];
        return moved ? { ...pos, x: moved.x, y: moved.y } : pos;
      }),
    [base.positions, overrides, dragged],
  );

  const relatedNames = useMemo(() => {
    const set = new Set<string>();
    const present = new Set(tables.map((t) => t.name));
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        if (!present.has(fk.referencedTable) || fk.referencedTable === table.name) continue;
        set.add(table.name);
        set.add(fk.referencedTable);
      }
    }
    return set;
  }, [tables]);

  const relatedByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const table of tables) map.set(table.name, new Set());
    for (const line of buildRelationships(base.positions, accents)) {
      map.get(line.sourceTable)?.add(line.targetTable);
      map.get(line.targetTable)?.add(line.sourceTable);
    }
    return map;
  }, [tables, base.positions, accents]);

  const isolatedSet = useMemo(() => {
    if (!isolate || !selected) return null;
    return new Set([selected, ...(relatedByTable.get(selected) ?? [])]);
  }, [isolate, selected, relatedByTable]);

  const positions = useMemo(
    () =>
      allPositions.filter((pos) => {
        if (isolatedSet && !isolatedSet.has(pos.table.name)) return false;
        if (!showViews && pos.table.tableType !== "table") return false;
        if (onlyRelated && !relatedNames.has(pos.table.name)) return false;
        return true;
      }),
    [allPositions, isolatedSet, showViews, onlyRelated, relatedNames],
  );

  const lines = useMemo(
    () => buildRelationships(positions, accents),
    [positions, accents],
  );
  const world = useMemo(
    () => (positions.length > 0 ? worldBounds(positions) : { width: 1, height: 1 }),
    [positions],
  );

  const positionByName = useMemo(
    () => new Map(allPositions.map((pos) => [pos.table.name, pos])),
    [allPositions],
  );

  /* -- viewport -------------------------------------------------- */

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

  const fitToView = useCallback(
    (animate = true) => {
      if (!containerSize.width || !containerSize.height || !world.width || !world.height) return;
      const scale = clamp(
        Math.min(containerSize.width / world.width, containerSize.height / world.height) * 0.94,
        MIN_ZOOM,
        1,
      );
      const apply = () => {
        setZoom(scale);
        setPan({
          x: (containerSize.width - world.width * scale) / 2,
          y: (containerSize.height - world.height * scale) / 2,
        });
      };
      if (animate) withEasing(apply);
      else apply();
    },
    [containerSize, world, withEasing],
  );

  // Fit once per diagram shape, not on every drag.
  const fittedFor = useRef("");
  useLayoutEffect(() => {
    const key = `${tables.length}:${base.width}:${base.height}`;
    if (!containerSize.width || !containerSize.height) return;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fitToView(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.width, containerSize.height, tables.length, base.width, base.height]);

  const zoomAround = useCallback(
    (factor: number, cx: number, cy: number) => {
      setZoom((previous) => {
        const next = clamp(previous * factor, MIN_ZOOM, MAX_ZOOM);
        setPan((prevPan) => ({
          x: cx - ((cx - prevPan.x) / previous) * next,
          y: cy - ((cy - prevPan.y) / previous) * next,
        }));
        return next;
      });
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      withEasing(() => zoomAround(factor, containerSize.width / 2, containerSize.height / 2));
    },
    [containerSize, withEasing, zoomAround],
  );

  const centerOn = useCallback(
    (name: string) => {
      const pos = positionByName.get(name);
      if (!pos || !containerSize.width) return;
      withEasing(() => {
        setPan({
          x: containerSize.width / 2 - (pos.x + pos.width / 2) * zoom,
          y: containerSize.height / 2 - (pos.y + pos.height / 2) * zoom,
        });
      });
    },
    [positionByName, containerSize, zoom, withEasing],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(event: globalThis.WheelEvent) {
      const columnList = (event.target as HTMLElement).closest(".overflow-y-auto");
      if (columnList && columnList.scrollHeight > columnList.clientHeight) {
        return; // let a long column list scroll natively instead of zooming
      }
      event.preventDefault();
      setEased(false);
      const rect = el!.getBoundingClientRect();
      zoomAround(
        Math.exp(-event.deltaY * 0.001),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  /* -- pointer: pan the canvas, or drag one table ---------------- */

  const interaction = useRef<
    | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
    | {
        kind: "card";
        name: string;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        moved: boolean;
      }
    | null
  >(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    // The minimap, the detail panel and the shortcut card float above the
    // canvas but are children of it. They handle their own pointers.
    if (target.closest("[data-canvas-overlay]")) return;

    const card = target.closest<HTMLElement>("[data-table-card]");
    setEased(false);

    if (card) {
      const name = card.dataset.tableName ?? "";
      const pos = positionByName.get(name);
      if (!pos) return;
      interaction.current = {
        kind: "card",
        name,
        startX: event.clientX,
        startY: event.clientY,
        originX: pos.x,
        originY: pos.y,
        moved: false,
      };
    } else {
      interaction.current = {
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = interaction.current;
    if (!state) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.kind === "pan") {
      setPan({ x: state.panX + dx, y: state.panY + dy });
      return;
    }

    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.moved = true;

    // Screen pixels are world pixels divided by the zoom.
    setDragged({
      name: state.name,
      x: state.originX + dx / zoom,
      y: state.originY + dy / zoom,
    });
  }

  function onPointerUp() {
    const state = interaction.current;
    interaction.current = null;
    if (!state) return;

    if (state.kind !== "card") return;

    if (state.moved) {
      // Commit the drag once, on drop.
      const landed: Overrides = { ...overrides };
      if (dragged?.name === state.name) {
        landed[state.name] = { x: dragged.x, y: dragged.y };
      }
      setDragged(null);
      store.set(landed);
    } else {
      setSelected((current) => (current === state.name ? null : state.name));
    }
  }

  function resetLayout() {
    setDragged(null);
    store.set({});
    fitToView();
  }

  /* -- keyboard -------------------------------------------------- */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "Escape") {
        if (typing) return;
        if (showShortcuts) setShowShortcuts(false);
        else if (isolate) setIsolate(false);
        else if (selected) setSelected(null);
        else if (fullscreen) setFullscreen(false);
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "+":
        case "=":
          event.preventDefault();
          zoomBy(1.25);
          break;
        case "-":
        case "_":
          event.preventDefault();
          zoomBy(0.8);
          break;
        case "0":
          event.preventDefault();
          fitToView();
          break;
        case "f":
        case "F":
          event.preventDefault();
          setFullscreen((value) => !value);
          break;
        case "/":
          event.preventDefault();
          searchRef.current?.focus();
          break;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          event.preventDefault();
          const step = event.shiftKey ? 160 : 60;
          setEased(false);
          setPan((p) => ({
            x: p.x + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
            y: p.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
          }));
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fitToView, zoomBy, isolate, selected, fullscreen, showShortcuts]);

  // Hold the page still behind the fullscreen canvas.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  /* -- highlighting ---------------------------------------------- */

  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () => (query ? positions.filter((p) => p.table.name.toLowerCase().includes(query)) : []),
    [query, positions],
  );
  const matched = query ? new Set(matches.map((p) => p.table.name)) : null;

  const highlighted =
    matched ??
    (selected && !isolate
      ? new Set([selected, ...(relatedByTable.get(selected) ?? [])])
      : null);

  /** The exact FK columns at both ends of the traced relationships. */
  const litByTable = useMemo(() => {
    if (!selected) return null;
    const map = new Map<string, Set<string>>();
    const add = (table: string, column: string) => {
      const set = map.get(table) ?? new Set<string>();
      set.add(column);
      map.set(table, set);
    };
    for (const line of lines) {
      if (line.sourceTable !== selected && line.targetTable !== selected) continue;
      add(line.sourceTable, line.sourceColumn);
      add(line.targetTable, line.targetColumn);
    }
    return map;
  }, [selected, lines]);

  const selectedTable = selected
    ? (positionByName.get(selected)?.table ?? null)
    : null;

  const hiddenCount = allPositions.length - positions.length;

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        fullscreen && "fixed inset-0 z-50 bg-paper p-3 sm:p-4",
      )}
    >
      {/* Toolbar ---------------------------------------------------- */}
      <div className="panel flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5">
        <div className="relative min-w-[170px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tables…    /"
            className={cn(
              "h-7 w-full rounded-md border border-line bg-surface pl-8 pr-7 text-xs text-ink",
              "transition-colors placeholder:text-muted focus-visible:border-line-strong",
            )}
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

          {/* Jump straight to a match rather than hunting for the highlight. */}
          {query && matches.length > 0 && (
            <ul
              className={cn(
                "panel-float absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30",
                "max-h-56 overflow-y-auto rounded-lg py-1",
              )}
            >
              {matches.slice(0, 8).map((pos) => (
                <li key={pos.table.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(pos.table.name);
                      centerOn(pos.table.name);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-2"
                  >
                    <span
                      aria-hidden
                      style={{ backgroundColor: accents.get(pos.table.name) }}
                      className="h-2.5 w-[3px] shrink-0 rounded-[1px]"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-ink">
                      {pos.table.name}
                    </span>
                    <span className="tabular shrink-0 font-mono text-[10px] text-muted">
                      {pos.table.columns.length} cols
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Toggle
            label="Show views as well as tables"
            active={showViews}
            onClick={() => setShowViews((value) => !value)}
          >
            <Eye className="h-3.5 w-3.5" />
            Views
          </Toggle>
          <Toggle
            label="Hide tables with no relationships"
            active={onlyRelated}
            onClick={() => setOnlyRelated((value) => !value)}
          >
            <Share2 className="h-3.5 w-3.5" />
            Related
          </Toggle>
          {selected && (
            <Toggle
              label="Show only this table and its relations"
              active={isolate}
              onClick={() => setIsolate((value) => !value)}
            >
              <Crosshair className="h-3.5 w-3.5" />
              Isolate
            </Toggle>
          )}
        </div>

        <span aria-hidden className="mx-0.5 hidden h-4 w-px bg-line sm:block" />

        <div className="flex items-center gap-0.5">
          {Object.keys(overrides).length > 0 && (
            <ToolButton label="Reset to the automatic layout" onClick={resetLayout}>
              <RotateCcw className="h-3.5 w-3.5" />
            </ToolButton>
          )}
          <ToolButton label="Zoom out" onClick={() => zoomBy(0.8)}>
            <ZoomOut className="h-3.5 w-3.5" />
          </ToolButton>
          <span className="tabular w-10 text-center font-mono text-[11px] text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <ToolButton label="Zoom in" onClick={() => zoomBy(1.25)}>
            <ZoomIn className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Fit to view" onClick={() => fitToView()}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label={fullscreen ? "Leave fullscreen" : "Fullscreen"}
            active={fullscreen}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 rotate-90" />
            )}
          </ToolButton>
          <ToolButton
            label="Keyboard shortcuts"
            active={showShortcuts}
            onClick={() => setShowShortcuts((value) => !value)}
          >
            <Keyboard className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
      </div>

      {/* Viewport --------------------------------------------------- */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "relative cursor-grab touch-none overflow-hidden rounded-xl",
          "border border-line bg-paper active:cursor-grabbing",
          "[box-shadow:inset_0_2px_8px_rgb(12_18_24_/_0.07)]",
          fullscreen ? "min-h-0 flex-1" : "h-[62vh] min-h-[440px]",
        )}
        style={{
          backgroundImage: `url("${DOT_TILE}")`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          style={{
            width: world.width,
            height: world.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: eased ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          }}
          className="relative"
        >
          <svg
            width={world.width}
            height={world.height}
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
          >
            {lines.map((line) => {
              const dim = highlighted
                ? !(highlighted.has(line.sourceTable) && highlighted.has(line.targetTable))
                : false;
              const traced = selected
                ? line.sourceTable === selected || line.targetTable === selected
                : false;

              return (
                <g key={line.key} opacity={dim ? 0.2 : 1}>
                  <motion.path
                    d={line.path}
                    fill="none"
                    stroke={line.accent}
                    strokeWidth={traced ? 2.25 : 1.5}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: dim ? 0.5 : 0.9 }}
                    transition={{
                      pathLength: { duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.25 },
                    }}
                  />
                  {/* Filled at the foreign key, hollow at the key it references. */}
                  <circle cx={line.startX} cy={line.startY} r={3} fill={line.accent} />
                  <circle
                    cx={line.endX}
                    cy={line.endY}
                    r={3.5}
                    fill="var(--surface)"
                    stroke={line.accent}
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          </svg>

          {positions.map((pos, index) => (
            <TableCard
              key={pos.table.name}
              pos={pos}
              accent={accents.get(pos.table.name) ?? accentToken(0)}
              index={index}
              dimmed={highlighted ? !highlighted.has(pos.table.name) : false}
              selected={selected === pos.table.name}
              moved={overrides[pos.table.name] !== undefined}
              litColumns={litByTable?.get(pos.table.name) ?? null}
              onSelect={(name) =>
                setSelected((current) => (current === name ? null : name))
              }
            />
          ))}
        </div>

        {positions.length > 3 && (
          <Minimap
            positions={positions}
            world={world}
            accents={accents}
            viewport={containerSize}
            pan={pan}
            zoom={zoom}
            selected={selected}
            onJump={(worldX, worldY) => {
              setEased(false);
              setPan({
                x: containerSize.width / 2 - worldX * zoom,
                y: containerSize.height / 2 - worldY * zoom,
              });
            }}
          />
        )}

        <AnimatePresence>
          {selectedTable && (
            <TableDetail
              key={selectedTable.name}
              table={selectedTable}
              accents={accents}
              isolated={isolate}
              onIsolate={() => setIsolate((value) => !value)}
              onClose={() => {
                setSelected(null);
                setIsolate(false);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showShortcuts && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              data-canvas-overlay
              className="panel-float absolute left-3 top-3 z-20 rounded-lg px-3 py-2.5"
            >
              <p className="eyebrow mb-2">Shortcuts</p>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 font-mono text-[10.5px]">
                {[
                  ["/", "search"],
                  ["+  -", "zoom"],
                  ["0", "fit to view"],
                  ["F", "fullscreen"],
                  ["↑ ↓ ← →", "pan"],
                  ["Esc", "clear selection"],
                ].map(([key, meaning]) => (
                  <div key={key} className="contents">
                    <dt className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-ink-2">
                      {key}
                    </dt>
                    <dd className="text-muted">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend ----------------------------------------------------- */}
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
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-[3px] rounded-[1px] bg-marker" />
          each table keeps its own colour
        </span>
        <span className="ml-auto">
          {hiddenCount > 0 && `${hiddenCount} hidden · `}
          drag a table to move it · drag the canvas to pan · click to trace joins
        </span>
      </div>
    </div>
  );
}
