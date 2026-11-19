import { Pool, types } from "pg";
import { SCHEMA_SQL } from "./schema";
import { HttpError } from "./errors";
import { makeDb, type Db, type QueryResult, type QuerySpec } from "./qb";

// numeric → number, date → "YYYY-MM-DD", timestamptz → ISO string
types.setTypeParser(1700, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => parseInt(v, 10)); // bigint (id-të)
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
types.setTypeParser(1114, (v: string) => new Date(v + "Z").toISOString());

const g = globalThis as unknown as { __bfPool?: Pool; __bfSchema?: Promise<void> };

export function pool(): Pool {
  if (!g.__bfPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new HttpError(503, "Databaza nuk është konfiguruar (mungon DATABASE_URL).");
    const internal = /\.railway\.internal|localhost|127\.0\.0\.1/.test(url);
    g.__bfPool = new Pool({
      connectionString: url,
      max: 8,
      ssl: internal || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    });
  }
  return g.__bfPool;
}

export async function ensureSchema(): Promise<void> {
  if (!g.__bfSchema) {
    g.__bfSchema = (async () => {
      const c = await pool().connect();
      try {
        await c.query("select pg_advisory_lock(424242)");
        await c.query(SCHEMA_SQL);
      } finally {
        await c.query("select pg_advisory_unlock(424242)").catch(() => {});
        c.release();
      }
    })().catch((e) => {
      g.__bfSchema = undefined;
      throw e;
    });
  }
  return g.__bfSchema;
}

export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const r = await pool().query(text, params);
  return r.rows as T[];
}

// ---------------------------------------------------------------------------
// Ekzekutuesi i pyetjeve: vetëm tabela/kolona të lejuara, gjithmonë user_id = përdoruesi.
// ---------------------------------------------------------------------------
interface TableDef {
  cols: string[];
  conflict: string; // çelësi për upsert
  json?: string[];
  sharedRead?: boolean; // foods: lexohen edhe rreshtat globalë (user_id NULL)
}

const TABLES: Record<string, TableDef> = {
  profiles: {
    cols: ["user_id", "display_name", "start_weight", "target_weight", "height_cm", "age", "training_days", "cardio_minutes",
      "calorie_target", "protein_min", "protein_max", "training_time", "food_preferences", "main_problem", "timezone",
      "remind_morning", "remind_afternoon", "remind_evening", "created_at", "updated_at"],
    conflict: "user_id",
  },
  weights: { cols: ["id", "user_id", "kg", "measured_at", "note"], conflict: "id" },
  foods: {
    cols: ["id", "user_id", "code", "name", "kcal", "protein", "carbs", "fat", "portion_grams", "portion_label", "source", "created_at"],
    conflict: "id",
    sharedRead: true,
  },
  food_logs: { cols: ["id", "user_id", "food_id", "name", "grams", "kcal", "protein", "carbs", "fat", "source", "log_date", "eaten_at"], conflict: "id" },
  workout_sessions: { cols: ["id", "user_id", "session_date", "day_key", "done", "completed", "completed_at"], conflict: "user_id,session_date", json: ["done"] },
  cardio_sessions: { cols: ["user_id", "session_date", "minutes", "completed"], conflict: "user_id,session_date" },
  daily_checklist: { cols: ["user_id", "day", "bike", "food_plan", "protein", "workout", "water"], conflict: "user_id,day" },
  daily_checkins: { cols: ["user_id", "day", "hunger", "energy", "note"], conflict: "user_id,day" },
  craving_events: { cols: ["id", "user_id", "kind", "note", "created_at"], conflict: "id" },
  push_subscriptions: { cols: ["id", "user_id", "endpoint", "p256dh", "auth", "user_agent", "created_at"], conflict: "endpoint" },
  ai_messages: { cols: ["id", "user_id", "role", "mode", "content", "created_at"], conflict: "id" },
  ai_reports: { cols: ["id", "user_id", "kind", "period_start", "stats", "content", "created_at"], conflict: "user_id,kind,period_start", json: ["stats"] },
  plan_proposals: { cols: ["id", "user_id", "field", "old_value", "new_value", "reason", "status", "created_at", "decided_at"], conflict: "id" },
};

const PROTECTED = new Set(["id", "user_id", "created_at"]);

function bad(msg: string): never {
  throw new HttpError(400, msg);
}

function colList(def: TableDef, columns: string | undefined): string {
  if (!columns || columns.trim() === "*") return "*";
  const cols = columns.split(",").map((c) => c.trim()).filter(Boolean);
  for (const c of cols) if (!def.cols.includes(c)) bad(`Kolonë e panjohur: ${c}`);
  return cols.map((c) => `"${c}"`).join(", ");
}

async function execSpec(userId: string, spec: QuerySpec): Promise<QueryResult> {
  const def = Object.prototype.hasOwnProperty.call(TABLES, spec.table) ? TABLES[spec.table] : null;
  if (!def) bad("Tabelë e palejuar.");
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const enc = (col: string, v: unknown) => (def.json?.includes(col) ? JSON.stringify(v ?? null) : v);

  // WHERE: gjithmonë i kufizuar te përdoruesi
  const ownerCond = () => `"user_id" = ${p(userId)}`;
  const where: string[] = [];
  const addFilters = () => {
    for (const f of spec.filters ?? []) {
      if (!def.cols.includes(f.col)) bad(`Kolonë e panjohur: ${f.col}`);
      const op = f.op === "eq" ? "=" : f.op === "gte" ? ">=" : f.op === "lte" ? "<=" : bad("Operator i palejuar.");
      if (f.val === null) {
        if (f.op !== "eq") bad("Krahasim i pavlefshëm me null.");
        where.push(`"${f.col}" is null`);
      } else where.push(`"${f.col}" ${op} ${p(f.val)}`);
    }
  };
  const whereSql = () => (where.length ? ` where ${where.join(" and ")}` : "");
  const returning = spec.returning ? ` returning ${colList(def, spec.columns)}` : "";

  let text = "";
  switch (spec.action) {
    case "select": {
      where.push(def.sharedRead ? `("user_id" = ${p(userId)} or "user_id" is null)` : ownerCond());
      addFilters();
      if (spec.count && spec.head) {
        const rows = await sql<{ n: number }>(`select count(*)::int as n from "${spec.table}"${whereSql()}`, params);
        return { data: null, error: null, count: rows[0]?.n ?? 0 };
      }
      let order = "";
      if (spec.order?.length) {
        for (const o of spec.order) if (!def.cols.includes(o.col)) bad(`Kolonë e panjohur: ${o.col}`);
        order = " order by " + spec.order.map((o) => `"${o.col}" ${o.asc ? "asc" : "desc"}`).join(", ");
      }
      const lim = Math.min(Math.max(1, Math.floor(Number(spec.limit) || 10000)), 10000);
      text = `select ${colList(def, spec.columns)} from "${spec.table}"${whereSql()}${order} limit ${spec.single ? Math.min(lim, 2) : lim}`;
      break;
    }
    case "insert":
    case "upsert": {
      const rows = Array.isArray(spec.values) ? spec.values : spec.values ? [spec.values] : [];
      if (!rows.length || rows.length > 200) bad("Të dhëna të pavlefshme.");
      const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((k) => k !== "user_id" && k !== "id");
      for (const k of keys) if (!def.cols.includes(k)) bad(`Kolonë e panjohur: ${k}`);
      const cols = ["user_id", ...keys];
      const valuesSql = rows
        .map((r) => "(" + [p(userId), ...keys.map((k) => (k in r ? p(enc(k, r[k])) : "default"))].join(", ") + ")")
        .join(", ");
      text = `insert into "${spec.table}" (${cols.map((c) => `"${c}"`).join(", ")}) values ${valuesSql}`;
      if (spec.action === "upsert") {
        const conflict = (spec.onConflict || def.conflict).split(",").map((c) => c.trim());
        if (conflict.join(",") !== def.conflict) bad("onConflict i palejuar.");
        const upd = keys.filter((k) => !conflict.includes(k) && !PROTECTED.has(k));
        text += ` on conflict (${conflict.map((c) => `"${c}"`).join(", ")}) ` +
          (upd.length ? `do update set ${upd.map((k) => `"${k}" = excluded."${k}"`).join(", ")}` : "do nothing");
        // siguri: upsert s'mund të prekë rreshtin e një përdoruesi tjetër
        if (upd.length) text += ` where "${spec.table}"."user_id" = excluded."user_id"`;
      }
      text += returning;
      break;
    }
    case "update": {
      const v = spec.values && !Array.isArray(spec.values) ? spec.values : bad("Të dhëna të pavlefshme.");
      const keys = Object.keys(v).filter((k) => !PROTECTED.has(k));
      if (!keys.length) bad("Asgjë për të ndryshuar.");
      for (const k of keys) if (!def.cols.includes(k)) bad(`Kolonë e panjohur: ${k}`);
      const sets = keys.map((k) => `"${k}" = ${p(enc(k, v[k]))}`);
      if (spec.table === "profiles") sets.push(`"updated_at" = now()`);
      where.push(ownerCond());
      addFilters();
      text = `update "${spec.table}" set ${sets.join(", ")}${whereSql()}${returning}`;
      break;
    }
    case "delete": {
      where.push(ownerCond());
      addFilters();
      if (where.length < 2 && spec.table !== "push_subscriptions") bad("Fshirja kërkon një filtër.");
      text = `delete from "${spec.table}"${whereSql()}${returning}`;
      break;
    }
    default:
      bad("Veprim i palejuar.");
  }

  const rows = await sql(text, params);
  if (spec.single === "single") {
    if (rows.length !== 1) return { data: null, error: { message: "Rreshti nuk u gjet." } };
    return { data: rows[0], error: null };
  }
  if (spec.single === "maybe") return { data: rows[0] ?? null, error: null };
  return { data: spec.action === "select" || spec.returning ? rows : null, error: null };
}

const PG_MESSAGES: Record<string, string> = {
  "23514": "Vlera është jashtë kufijve të lejuar.",
  "23505": "Ky regjistrim ekziston tashmë.",
  "23503": "Lidhje e pavlefshme me një regjistrim tjetër.",
  "22P02": "Format i pavlefshëm i të dhënave.",
  "22007": "Datë e pavlefshme.",
  "22008": "Datë e pavlefshme.",
  "23502": "Mungon një fushë e detyrueshme.",
};

/** Ekzekuton specifikimin dhe kthen gabimet si { error } (njëlloj si klienti). */
export async function runSpec(userId: string, spec: QuerySpec): Promise<QueryResult> {
  try {
    return await execSpec(userId, spec);
  } catch (e) {
    if (e instanceof HttpError) return { data: null, error: { message: e.message } };
    const code = (e as { code?: string }).code;
    if (code && PG_MESSAGES[code]) return { data: null, error: { message: PG_MESSAGES[code] } };
    console.error("DB error", e);
    return { data: null, error: { message: "Gabim në databazë." } };
  }
}

/** Databaza në server, e lidhur me një përdorues. */
export function userDb(userId: string): Db {
  return makeDb((spec) => runSpec(userId, spec));
}
