// Ndërtues i thjeshtë pyetjesh (i përbashkët për klientin dhe serverin).
// Klienti e dërgon specifikimin te /api/db; serveri e ekzekuton me PostgreSQL,
// gjithmonë i kufizuar te të dhënat e përdoruesit të identifikuar.

export type FilterOp = "eq" | "gte" | "lte";

export interface QuerySpec {
  table: string;
  action: "select" | "insert" | "upsert" | "update" | "delete";
  columns?: string;
  count?: boolean;
  head?: boolean;
  filters: { col: string; op: FilterOp; val: unknown }[];
  order: { col: string; asc: boolean }[];
  limit?: number;
  single?: "single" | "maybe";
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  returning?: boolean;
}

export interface QueryResult<T = any> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

export type Transport = (spec: QuerySpec) => Promise<QueryResult>;

export class Query<T = any> implements PromiseLike<QueryResult<T>> {
  private spec: QuerySpec;
  constructor(table: string, private transport: Transport) {
    this.spec = { table, action: "select", filters: [], order: [] };
  }
  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.spec.action === "select") {
      this.spec.columns = columns;
      if (opts?.count) this.spec.count = true;
      if (opts?.head) this.spec.head = true;
    } else {
      this.spec.returning = true;
      this.spec.columns = columns;
    }
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.spec.action = "insert";
    this.spec.values = values;
    return this;
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    this.spec.action = "upsert";
    this.spec.values = values;
    this.spec.onConflict = opts?.onConflict;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.spec.action = "update";
    this.spec.values = values;
    return this;
  }
  delete() {
    this.spec.action = "delete";
    return this;
  }
  eq(col: string, val: unknown) { this.spec.filters.push({ col, op: "eq", val }); return this; }
  gte(col: string, val: unknown) { this.spec.filters.push({ col, op: "gte", val }); return this; }
  lte(col: string, val: unknown) { this.spec.filters.push({ col, op: "lte", val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.spec.order.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this.spec.limit = n; return this; }
  single() { this.spec.single = "single"; return this; }
  maybeSingle() { this.spec.single = "maybe"; return this; }

  then<R1 = QueryResult<T>, R2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.transport(this.spec)
      .catch((e: unknown) => ({ data: null, error: { message: (e as Error).message || "Gabim" } }) as QueryResult)
      .then(onfulfilled as any, onrejected as any);
  }
}

export interface Db {
  from: <T = any>(table: string) => Query<T>;
}

export function makeDb(transport: Transport): Db {
  return { from: (table: string) => new Query(table, transport) };
}
