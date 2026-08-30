const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface QueryResponse {
  question: string;
  sql: string;
  note: string;
}

export async function generateSql(question: string): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json();
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

/**
 * Thrown by the auth calls below. `fieldErrors` is populated from FastAPI's
 * pydantic 422 body (keyed by field name) so forms can show the message next
 * to the right input; `message` is always set for a form-level fallback.
 */
export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

interface UserPayload {
  id: string;
  email: string;
  full_name: string | null;
}

function toAuthUser(payload: UserPayload): AuthUser {
  return { id: payload.id, email: payload.email, fullName: payload.full_name ?? payload.email };
}

async function parseApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }

  const detail = (body as { detail?: unknown } | null)?.detail;

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of detail) {
      const loc = Array.isArray((item as { loc?: unknown }).loc) ? (item as { loc: unknown[] }).loc : [];
      const field = loc[loc.length - 1];
      const msg = (item as { msg?: unknown }).msg;
      if (typeof field === "string" && typeof msg === "string") {
        fieldErrors[field] = msg.replace(/^Value error,\s*/, "");
      }
    }
    const message = Object.values(fieldErrors)[0] ?? "Please check the form and try again.";
    return new ApiError(res.status, message, fieldErrors);
  }

  if (typeof detail === "string") {
    return new ApiError(res.status, detail);
  }

  return new ApiError(res.status, `Something went wrong (${res.status}). Please try again.`);
}

export async function signup(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: input.fullName,
      email: input.email,
      password: input.password,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return toAuthUser(await res.json());
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseApiError(res);
  return toAuthUser(await res.json());
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw await parseApiError(res);
  return toAuthUser(await res.json());
}

export type DbEngine = "postgresql" | "mysql";
export type SslMode = "disable" | "require";
export type ConnectionStatus = "untested" | "connected" | "failed";

export interface Connection {
  id: string;
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslMode: SslMode;
  status: ConnectionStatus;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestDetail: string | null;
  createdAt: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  detail: string;
  currentUser: string | null;
  currentDatabase: string | null;
  tableCount: number | null;
  latencyMs: number | null;
}

interface ConnectionPayload {
  id: string;
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  database_name: string;
  username: string;
  ssl_mode: SslMode;
  status: ConnectionStatus;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_detail: string | null;
  created_at: string;
}

function toConnection(payload: ConnectionPayload): Connection {
  return {
    id: payload.id,
    label: payload.label,
    engine: payload.engine,
    host: payload.host,
    port: payload.port,
    databaseName: payload.database_name,
    username: payload.username,
    sslMode: payload.ssl_mode,
    status: payload.status,
    lastTestedAt: payload.last_tested_at,
    lastTestOk: payload.last_test_ok,
    lastTestDetail: payload.last_test_detail,
    createdAt: payload.created_at,
  };
}

export async function listConnections(): Promise<Connection[]> {
  const res = await fetch(`${API_BASE_URL}/api/connections`, {
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  const payload: ConnectionPayload[] = await res.json();
  return payload.map(toConnection);
}

export async function createConnection(input: {
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslMode: SslMode;
}): Promise<Connection> {
  const res = await fetch(`${API_BASE_URL}/api/connections`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      engine: input.engine,
      host: input.host,
      port: input.port,
      database_name: input.databaseName,
      username: input.username,
      password: input.password,
      ssl_mode: input.sslMode,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return toConnection(await res.json());
}

export async function updateConnection(
  id: string,
  input: {
    label: string;
    engine: DbEngine;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    /** Omit (or leave undefined) to keep the currently stored password. */
    password?: string;
    sslMode: SslMode;
  },
): Promise<Connection> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      engine: input.engine,
      host: input.host,
      port: input.port,
      database_name: input.databaseName,
      username: input.username,
      ...(input.password ? { password: input.password } : {}),
      ssl_mode: input.sslMode,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return toConnection(await res.json());
}

export async function deleteConnection(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
}

export async function testConnection(id: string): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${id}/test`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  const payload = await res.json();
  return {
    ok: payload.ok,
    detail: payload.detail,
    currentUser: payload.current_user,
    currentDatabase: payload.current_database,
    tableCount: payload.table_count,
    latencyMs: payload.latency_ms,
  };
}

export interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  ordinalPosition: number;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

export interface SchemaForeignKey {
  constraintName: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: string | null;
  onDelete: string | null;
}

export interface SchemaIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface SchemaTable {
  schemaName: string | null;
  name: string;
  tableType: string;
  approxRowCount: number | null;
  columns: SchemaColumn[];
  primaryKey: string[];
  foreignKeys: SchemaForeignKey[];
  indexes: SchemaIndex[];
}

export interface SchemaQuery {
  label: string;
  sql: string;
}

export interface SchemaSnapshot {
  connectionId: string;
  engine: DbEngine;
  fetchedAt: string;
  tableCount: number;
  columnCount: number;
  tables: SchemaTable[];
  queries: SchemaQuery[];
}

export interface SchemaFetchResult {
  ok: boolean;
  detail: string;
  latencyMs: number | null;
  snapshot: SchemaSnapshot | null;
}

function toSchemaSnapshot(payload: {
  connection_id: string;
  engine: DbEngine;
  fetched_at: string;
  table_count: number;
  column_count: number;
  tables: Array<{
    schema_name: string | null;
    name: string;
    table_type: string;
    approx_row_count: number | null;
    columns: Array<{
      name: string;
      data_type: string;
      nullable: boolean;
      default: string | null;
      ordinal_position: number;
      max_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
      is_primary_key: boolean;
      is_foreign_key: boolean;
    }>;
    primary_key: string[];
    foreign_keys: Array<{
      constraint_name: string;
      columns: string[];
      referenced_table: string;
      referenced_columns: string[];
      on_update: string | null;
      on_delete: string | null;
    }>;
    indexes: Array<{
      name: string;
      columns: string[];
      is_unique: boolean;
      is_primary: boolean;
    }>;
  }>;
  queries: SchemaQuery[];
}): SchemaSnapshot {
  return {
    connectionId: payload.connection_id,
    engine: payload.engine,
    fetchedAt: payload.fetched_at,
    tableCount: payload.table_count,
    columnCount: payload.column_count,
    queries: payload.queries,
    tables: payload.tables.map((table) => ({
      schemaName: table.schema_name,
      name: table.name,
      tableType: table.table_type,
      approxRowCount: table.approx_row_count,
      primaryKey: table.primary_key,
      columns: table.columns.map((column) => ({
        name: column.name,
        dataType: column.data_type,
        nullable: column.nullable,
        default: column.default,
        ordinalPosition: column.ordinal_position,
        maxLength: column.max_length,
        numericPrecision: column.numeric_precision,
        numericScale: column.numeric_scale,
        isPrimaryKey: column.is_primary_key,
        isForeignKey: column.is_foreign_key,
      })),
      foreignKeys: table.foreign_keys.map((fk) => ({
        constraintName: fk.constraint_name,
        columns: fk.columns,
        referencedTable: fk.referenced_table,
        referencedColumns: fk.referenced_columns,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
      })),
      indexes: table.indexes.map((index) => ({
        name: index.name,
        columns: index.columns,
        isUnique: index.is_unique,
        isPrimary: index.is_primary,
      })),
    })),
  };
}

/** The persisted snapshot from the last "Fetch schema" run, or null if there isn't one yet. */
export async function getSchemaSnapshot(connectionId: string): Promise<SchemaSnapshot | null> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}/schema`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await parseApiError(res);
  return toSchemaSnapshot(await res.json());
}

/** Connects with the stored credentials and reads tables/columns/foreign-keys/indexes. */
export async function fetchSchema(connectionId: string): Promise<SchemaFetchResult> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}/schema/fetch`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  const payload = await res.json();
  return {
    ok: payload.ok,
    detail: payload.detail,
    latencyMs: payload.latency_ms,
    snapshot: payload.snapshot ? toSchemaSnapshot(payload.snapshot) : null,
  };
}

export type RelationshipDirection = "outgoing" | "incoming";

export interface NormalizedRelationship {
  direction: RelationshipDirection;
  constraintName: string;
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: string | null;
  onDelete: string | null;
}

/** One table, normalized: {table, columns, relationships, indexes} - the
 * shape stored in Postgres (schema_objects) for a later description-
 * generation step to read. */
export interface NormalizedTable {
  table: string;
  columns: SchemaColumn[];
  relationships: NormalizedRelationship[];
  indexes: SchemaIndex[];
}

export interface IngestResult {
  connectionId: string;
  processedAt: string;
  tableCount: number;
  tables: NormalizedTable[];
}

export interface IngestConnectionSummary {
  connectionId: string;
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  status: ConnectionStatus;
  hasSnapshot: boolean;
  snapshotFetchedAt: string | null;
  snapshotTableCount: number | null;
  isProcessed: boolean;
  processedAt: string | null;
  processedTableCount: number | null;
}

interface NormalizedTablePayload {
  table: string;
  columns: Array<{
    name: string;
    data_type: string;
    nullable: boolean;
    default: string | null;
    ordinal_position: number;
    max_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_primary_key: boolean;
    is_foreign_key: boolean;
  }>;
  relationships: Array<{
    direction: RelationshipDirection;
    constraint_name: string;
    table: string;
    columns: string[];
    referenced_table: string;
    referenced_columns: string[];
    on_update: string | null;
    on_delete: string | null;
  }>;
  indexes: Array<{ name: string; columns: string[]; is_unique: boolean; is_primary: boolean }>;
}

function toNormalizedTable(payload: NormalizedTablePayload): NormalizedTable {
  return {
    table: payload.table,
    columns: payload.columns.map((column) => ({
      name: column.name,
      dataType: column.data_type,
      nullable: column.nullable,
      default: column.default,
      ordinalPosition: column.ordinal_position,
      maxLength: column.max_length,
      numericPrecision: column.numeric_precision,
      numericScale: column.numeric_scale,
      isPrimaryKey: column.is_primary_key,
      isForeignKey: column.is_foreign_key,
    })),
    relationships: payload.relationships.map((rel) => ({
      direction: rel.direction,
      constraintName: rel.constraint_name,
      table: rel.table,
      columns: rel.columns,
      referencedTable: rel.referenced_table,
      referencedColumns: rel.referenced_columns,
      onUpdate: rel.on_update,
      onDelete: rel.on_delete,
    })),
    indexes: payload.indexes.map((index) => ({
      name: index.name,
      columns: index.columns,
      isUnique: index.is_unique,
      isPrimary: index.is_primary,
    })),
  };
}

function toIngestResult(payload: {
  connection_id: string;
  processed_at: string;
  table_count: number;
  tables: NormalizedTablePayload[];
}): IngestResult {
  return {
    connectionId: payload.connection_id,
    processedAt: payload.processed_at,
    tableCount: payload.table_count,
    tables: payload.tables.map(toNormalizedTable),
  };
}

/** All connections, with whether each has a fetched schema and/or has
 * already been processed into normalized schema_objects rows. */
export async function listIngestConnections(): Promise<IngestConnectionSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/schema-ingest/connections`, {
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  const payload: Array<{
    connection_id: string;
    label: string;
    engine: DbEngine;
    host: string;
    port: number;
    database_name: string;
    status: ConnectionStatus;
    has_snapshot: boolean;
    snapshot_fetched_at: string | null;
    snapshot_table_count: number | null;
    is_processed: boolean;
    processed_at: string | null;
    processed_table_count: number | null;
  }> = await res.json();

  return payload.map((row) => ({
    connectionId: row.connection_id,
    label: row.label,
    engine: row.engine,
    host: row.host,
    port: row.port,
    databaseName: row.database_name,
    status: row.status,
    hasSnapshot: row.has_snapshot,
    snapshotFetchedAt: row.snapshot_fetched_at,
    snapshotTableCount: row.snapshot_table_count,
    isProcessed: row.is_processed,
    processedAt: row.processed_at,
    processedTableCount: row.processed_table_count,
  }));
}

/** Normalizes the connection's last-fetched schema (see getSchemaSnapshot)
 * into per-table rows and persists them, replacing any previous run. */
export async function processIngest(connectionId: string): Promise<IngestResult> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}/ingest`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  return toIngestResult(await res.json());
}

/** The result of the last "Process" run, or null if it has never been run. */
export async function getIngestStatus(connectionId: string): Promise<IngestResult | null> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}/ingest`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await parseApiError(res);
  return toIngestResult(await res.json());
}
