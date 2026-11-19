import { sql } from "@/lib/db";
import { currentUser, handle, json } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kthen përdoruesin aktual dhe profilin e tij (ose 401). */
export const GET = handle(async (req) => {
  const user = await currentUser(req);
  if (!user) {
    const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from users");
    return json({ error: "Nuk je i identifikuar.", firstUser: n === 0 }, 401);
  }
  await sql("insert into profiles (user_id) values ($1) on conflict do nothing", [user.id]);
  const [profile] = await sql("select * from profiles where user_id = $1", [user.id]);
  return json({ user, profile });
});
