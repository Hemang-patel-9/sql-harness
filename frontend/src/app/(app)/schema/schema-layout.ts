import type { SchemaTable } from "../../../lib/api";

/* ------------------------------------------------------------------ */
/* Card metrics                                                        */
/* ------------------------------------------------------------------ */

export const CARD_WIDTH = 300;
export const HEADER_HEIGHT = 46;
export const ROW_HEIGHT = 27;
export const MAX_VISIBLE_ROWS = 14;
export const INDEX_FOOTER_HEIGHT = 30;
export const PADDING = 56;

const GAP_X = 96;
const GAP_Y = 36;
const CLUSTER_GAP = 80;
/** Clusters flow left to right until they pass this, then wrap. */
const TARGET_ROW_WIDTH = 4 * (CARD_WIDTH + GAP_X);
/** Tables with no relationships are shelved in a block this wide. */
const SHELF_COLUMNS = 4;

export function nonPrimaryIndexes(table: SchemaTable) {
  return table.indexes.filter((index) => !index.isPrimary);
}

export function cardHeight(table: SchemaTable): number {
  const rows = Math.min(table.columns.length, MAX_VISIBLE_ROWS);
  const footer = nonPrimaryIndexes(table).length > 0 ? INDEX_FOOTER_HEIGHT : 0;
  return HEADER_HEIGHT + rows * ROW_HEIGHT + footer;
}

export interface Positioned {
  table: SchemaTable;
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* Table identity colour                                               */
/* ------------------------------------------------------------------ */

const ACCENT_COUNT = 9;

/** The hue a table would like, before its neighbours get a say. */
function preferredAccent(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % ACCENT_COUNT;
}

export function accentToken(index: number): string {
  return `var(--accent-${(index % ACCENT_COUNT) + 1})`;
}

/**
 * Assigns every table a hue, then resolves clashes so that no two tables
 * joined by a foreign key end up the same colour — following a join by its
 * colour only works if the two ends can be told apart.
 *
 * A table starts from a hue derived from its name, so most tables keep the
 * same colour run to run; only the ones that collide with a neighbour move.
 * Processing order is fixed (busiest table first, then alphabetical), so the
 * result is identical every time for the same schema.
 */
export function buildAccents(tables: SchemaTable[]): Map<string, string> {
  const adjacency = buildAdjacency(tables);
  const order = [...tables].sort(
    (a, b) =>
      (adjacency.get(b.name)?.size ?? 0) - (adjacency.get(a.name)?.size ?? 0) ||
      a.name.localeCompare(b.name),
  );

  const chosen = new Map<string, number>();
  for (const table of order) {
    const taken = new Set(
      [...(adjacency.get(table.name) ?? [])]
        .map((neighbour) => chosen.get(neighbour))
        .filter((value): value is number => value !== undefined),
    );

    const preferred = preferredAccent(table.name);
    let hue = preferred;
    for (let step = 1; taken.has(hue) && step <= ACCENT_COUNT; step += 1) {
      hue = (preferred + step) % ACCENT_COUNT;
    }
    chosen.set(table.name, hue);
  }

  return new Map(
    [...chosen].map(([name, index]) => [name, accentToken(index)]),
  );
}

/* ------------------------------------------------------------------ */
/* Column type roles                                                   */
/* ------------------------------------------------------------------ */

export type TypeRole = "num" | "text" | "time" | "bool" | "uuid" | "json" | "other";

/**
 * Buckets a dialect's type name into something worth colouring. Checked
 * most-specific first — `interval` and `timestamp` would both otherwise be
 * caught by the numeric `int` test.
 */
export function typeRole(dataType: string): TypeRole {
  const type = dataType.toLowerCase();
  if (/uuid|uniqueidentifier/.test(type)) return "uuid";
  if (/bool/.test(type)) return "bool";
  if (/json/.test(type)) return "json";
  if (/timestamp|datetime|date|time|interval|year/.test(type)) return "time";
  if (/int|serial|numeric|decimal|real|double|float|money|bit/.test(type)) return "num";
  if (/char|text|clob|enum|name/.test(type)) return "text";
  return "other";
}

export function typeColor(dataType: string): string {
  const role = typeRole(dataType);
  return role === "other" ? "var(--muted)" : `var(--type-${role})`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

interface Cluster {
  names: string[];
  /** Local coordinates, translated once the cluster is placed. */
  local: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

function buildAdjacency(tables: SchemaTable[]): Map<string, Set<string>> {
  const present = new Set(tables.map((t) => t.name));
  const adjacency = new Map<string, Set<string>>();
  for (const table of tables) adjacency.set(table.name, new Set());

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (!present.has(fk.referencedTable) || fk.referencedTable === table.name) continue;
      adjacency.get(table.name)?.add(fk.referencedTable);
      adjacency.get(fk.referencedTable)?.add(table.name);
    }
  }
  return adjacency;
}

/** Connected components, largest first, each in stable name order. */
function findComponents(
  tables: SchemaTable[],
  adjacency: Map<string, Set<string>>,
): string[][] {
  const seen = new Set<string>();
  const components: string[][] = [];

  for (const table of tables) {
    if (seen.has(table.name)) continue;
    const queue = [table.name];
    const group: string[] = [];
    seen.add(table.name);

    while (queue.length > 0) {
      const name = queue.shift()!;
      group.push(name);
      for (const neighbour of adjacency.get(name) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(group);
  }

  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/**
 * Lays one connected group out in columns by distance from its busiest
 * table, then reorders each column by the average position of the previous
 * column's neighbours. One barycenter pass is enough to take most of the
 * crossings out, and unlike a force simulation it lands in the same place
 * every time.
 */
function layoutCluster(
  names: string[],
  adjacency: Map<string, Set<string>>,
  heights: Map<string, number>,
): Cluster {
  const root = names.reduce((best, name) =>
    (adjacency.get(name)?.size ?? 0) > (adjacency.get(best)?.size ?? 0) ? name : best,
  );

  const depth = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length > 0) {
    const name = queue.shift()!;
    for (const neighbour of adjacency.get(name) ?? []) {
      if (depth.has(neighbour)) continue;
      depth.set(neighbour, (depth.get(name) ?? 0) + 1);
      queue.push(neighbour);
    }
  }

  const columns: string[][] = [];
  for (const name of names) {
    const level = depth.get(name) ?? 0;
    (columns[level] ??= []).push(name);
  }

  for (let level = 1; level < columns.length; level += 1) {
    const rank = new Map(columns[level - 1].map((name, index) => [name, index]));

    const barycenter = (name: string): number => {
      const ranks = [...(adjacency.get(name) ?? [])]
        .map((neighbour) => rank.get(neighbour))
        .filter((value): value is number => value !== undefined);
      return ranks.length === 0
        ? Number.MAX_SAFE_INTEGER
        : ranks.reduce((sum, value) => sum + value, 0) / ranks.length;
    };

    columns[level].sort((a, b) => barycenter(a) - barycenter(b) || a.localeCompare(b));
  }

  const local = new Map<string, { x: number; y: number }>();
  let clusterHeight = 0;

  columns.forEach((column, level) => {
    let y = 0;
    for (const name of column) {
      local.set(name, { x: level * (CARD_WIDTH + GAP_X), y });
      y += (heights.get(name) ?? HEADER_HEIGHT) + GAP_Y;
    }
    clusterHeight = Math.max(clusterHeight, y - GAP_Y);
  });

  return {
    names,
    local,
    width: Math.max(0, columns.length * (CARD_WIDTH + GAP_X) - GAP_X),
    height: Math.max(0, clusterHeight),
  };
}

/** Unrelated tables, packed into one block so they stop diluting the graph. */
function layoutShelf(names: string[], heights: Map<string, number>): Cluster {
  const local = new Map<string, { x: number; y: number }>();
  const columnHeights = new Array(Math.min(SHELF_COLUMNS, names.length)).fill(0);

  for (const name of names) {
    let column = 0;
    for (let i = 1; i < columnHeights.length; i += 1) {
      if (columnHeights[i] < columnHeights[column]) column = i;
    }
    local.set(name, { x: column * (CARD_WIDTH + GAP_X), y: columnHeights[column] });
    columnHeights[column] += (heights.get(name) ?? HEADER_HEIGHT) + GAP_Y;
  }

  return {
    names,
    local,
    width: Math.max(0, columnHeights.length * (CARD_WIDTH + GAP_X) - GAP_X),
    height: Math.max(0, Math.max(...columnHeights, 0) - GAP_Y),
  };
}

/**
 * Relationship-aware placement: related tables sit together in a cluster,
 * clusters flow into rows, and everything unconnected is shelved at the end.
 */
export function layoutTables(tables: SchemaTable[]): {
  positions: Positioned[];
  width: number;
  height: number;
} {
  if (tables.length === 0) return { positions: [], width: 0, height: 0 };

  const byName = new Map(tables.map((table) => [table.name, table]));
  const heights = new Map(tables.map((table) => [table.name, cardHeight(table)]));
  const adjacency = buildAdjacency(tables);
  const components = findComponents(tables, adjacency);

  const clusters: Cluster[] = [];
  const isolated: string[] = [];

  for (const component of components) {
    if (component.length === 1) isolated.push(component[0]);
    else clusters.push(layoutCluster(component, adjacency, heights));
  }
  if (isolated.length > 0) clusters.push(layoutShelf(isolated, heights));

  // Flow the clusters into rows.
  const placed = new Map<string, { x: number; y: number }>();
  let cursorX = PADDING;
  let cursorY = PADDING;
  let rowHeight = 0;
  let worldWidth = 0;

  for (const cluster of clusters) {
    if (cursorX > PADDING && cursorX + cluster.width > PADDING + TARGET_ROW_WIDTH) {
      cursorX = PADDING;
      cursorY += rowHeight + CLUSTER_GAP;
      rowHeight = 0;
    }

    for (const [name, point] of cluster.local) {
      placed.set(name, { x: cursorX + point.x, y: cursorY + point.y });
    }

    cursorX += cluster.width + CLUSTER_GAP;
    rowHeight = Math.max(rowHeight, cluster.height);
    worldWidth = Math.max(worldWidth, cursorX - CLUSTER_GAP);
  }

  const positions: Positioned[] = tables.map((table) => {
    const point = placed.get(table.name) ?? { x: PADDING, y: PADDING };
    return {
      table,
      x: point.x,
      y: point.y,
      width: CARD_WIDTH,
      height: heights.get(table.name) ?? cardHeight(byName.get(table.name)!),
    };
  });

  return {
    positions,
    width: worldWidth + PADDING,
    height: cursorY + rowHeight + PADDING,
  };
}

/** Grows the world so a table dragged past the edge stays reachable. */
export function worldBounds(positions: Positioned[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const pos of positions) {
    width = Math.max(width, pos.x + pos.width);
    height = Math.max(height, pos.y + pos.height);
  }
  return { width: width + PADDING, height: height + PADDING };
}

/* ------------------------------------------------------------------ */
/* Relationships                                                       */
/* ------------------------------------------------------------------ */

export interface RelationshipLine {
  key: string;
  path: string;
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  constraintName: string;
  /** The source table's hue — a join is coloured by where it comes from. */
  accent: string;
  /** Endpoints, so markers can be drawn without re-parsing the path. */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function buildRelationships(
  positions: Positioned[],
  accents: Map<string, string>,
): RelationshipLine[] {
  const byName = new Map(positions.map((pos) => [pos.table.name, pos]));
  const lines: RelationshipLine[] = [];

  for (const pos of positions) {
    for (const fk of pos.table.foreignKeys) {
      const target = byName.get(fk.referencedTable);
      if (!target || target === pos) continue;

      const sourceRowRaw = pos.table.columns.findIndex((c) => c.name === fk.columns[0]);
      const targetRowRaw = target.table.columns.findIndex(
        (c) => c.name === fk.referencedColumns[0],
      );
      const sourceRow = Math.min(Math.max(sourceRowRaw, 0), MAX_VISIBLE_ROWS - 1);
      const targetRow = Math.min(Math.max(targetRowRaw, 0), MAX_VISIBLE_ROWS - 1);

      const sourceOnLeft = pos.x + pos.width / 2 <= target.x + target.width / 2;

      const sourceX = sourceOnLeft ? pos.x + pos.width : pos.x;
      const sourceY = pos.y + HEADER_HEIGHT + (sourceRow + 0.5) * ROW_HEIGHT;
      const targetX = sourceOnLeft ? target.x : target.x + target.width;
      const targetY = target.y + HEADER_HEIGHT + (targetRow + 0.5) * ROW_HEIGHT;

      const dx = Math.max(60, Math.abs(targetX - sourceX) * 0.4);
      const c1x = sourceOnLeft ? sourceX + dx : sourceX - dx;
      const c2x = sourceOnLeft ? targetX - dx : targetX + dx;

      lines.push({
        key: `${pos.table.name}::${fk.constraintName}::${fk.columns[0]}`,
        path: `M ${sourceX} ${sourceY} C ${c1x} ${sourceY}, ${c2x} ${targetY}, ${targetX} ${targetY}`,
        sourceTable: pos.table.name,
        targetTable: target.table.name,
        sourceColumn: fk.columns[0],
        targetColumn: fk.referencedColumns[0],
        constraintName: fk.constraintName,
        accent: accents.get(pos.table.name) ?? accentToken(0),
        startX: sourceX,
        startY: sourceY,
        endX: targetX,
        endY: targetY,
      });
    }
  }

  return lines;
}
