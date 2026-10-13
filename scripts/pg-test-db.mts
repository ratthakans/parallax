/* ── ฐาน Postgres สำหรับชุดตรวจ (verify:pg) ─────────────────────

   ใช้ migration จริงทุกไฟล์กับฐานเปล่า พร้อมส่วนเลียนแบบของ Supabase ที่ migration อ้างถึง
   (role authenticated/anon/service_role · schema auth · auth.users · auth.uid() จาก request.jwt.claims)
   — ไม่ใช่ Supabase ทั้งระบบ แต่ RLS grant และ security definer ทำงานเหมือนกัน ซึ่งคือสิ่งที่ sqlite ไม่มี

   ⚠ ใช้กับฐานเปล่าสำหรับทดสอบเท่านั้น: สคริปต์ปฏิเสธฐานที่มีตาราง tenants อยู่แล้ว */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exec, get, resetConnection } from "@/lib/engine/sql";

if (!process.env.DATABASE_URL) throw new Error("ตั้ง DATABASE_URL ของฐานทดสอบก่อน");

const found = await get<{ t: string | null }>("SELECT to_regclass('public.tenants')::text AS t");
if (found?.t) throw new Error("ฐานนี้มีตาราง tenants แล้ว — สคริปต์นี้ใช้กับฐานทดสอบเปล่าเท่านั้น");

await exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  grant authenticated to current_user;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant usage on schema public to authenticated;
  -- Supabase ให้สิทธิ์ตารางใน public แก่ role ของ API โดยปริยาย — migration พึ่งค่านี้และถอนเฉพาะที่ต้องการ (เช่น revoke ใน 0007)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

const dir = join(process.cwd(), "supabase/migrations");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await exec(readFileSync(join(dir, f), "utf8"));
  console.log("ใช้แล้ว", f);
}
await resetConnection();
