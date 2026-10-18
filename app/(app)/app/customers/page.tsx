import Link from "next/link";
import Form from "next/form";
import { activeTenantId } from "@/app/(app)/tenant";
import { loadFeatures } from "@/lib/engine/derive";
import {
  CUSTOMER_FILTERS,
  CUSTOMER_SORTS,
  searchCustomers,
  type CustomerFilter,
  type CustomerSort,
} from "@/lib/engine/customers";
import { isB2BTenant, profileFor } from "@/lib/shared/tenants";
import { B2BContacts } from "./b2b-list";
import type { DiscountAffinity, ReachableBy } from "@/lib/shared/types";
import { CONTACT_KIND_LABEL } from "@/lib/shared/contact-kinds";
import { daysAgoLabel, thaiDate } from "@/lib/shared/format";
import { Metric, PageHead, Panel, baht, num, pct } from "@/components/console/ui";
import { deriveAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";

export const metadata = { title: "ผู้ติดต่อ" };
export const dynamic = "force-dynamic";

/* หัวตารางภาษาไทย — .c-table th เป็นแบบ mono ตัวพิมพ์ใหญ่ถ่างช่องไฟของภาษาอังกฤษ
   ซึ่งทำให้อักษรไทยแตกเป็นตัว ๆ และตกไปใช้ฟอนต์ของระบบ (ดู console.css) */
const TH = "font-sans normal-case tracking-normal text-[0.75rem]";

const REACHABLE_LABEL: Record<ReachableBy, string> = {
  line: "ทักทาง LINE ได้",
  email: "ทักทางอีเมลได้",
  paid_only: "ยินยอมแล้ว แต่ไม่มีช่องทางทักตรง",
  none: "ยังไม่ยินยอม — ส่งหรือส่งออกไม่ได้",
};

const AFFINITY_LABEL: Record<DiscountAffinity, string> = {
  full_price: "ซื้อเต็มราคา",
  mixed: "ปนกัน",
  discount_seeker: "รอโปรโมชัน",
};

const FILTER_LABEL: Record<CustomerFilter, string> = {
  all: "ทั้งหมด",
  buyers: "เคยซื้อ",
  never: "ยังไม่เคยซื้อ",
  line: "มี LINE",
  phone: "มีเบอร์",
  email: "มีอีเมล",
  consent: "ยินยอมรับข่าวสาร",
  no_consent: "ยังไม่ยินยอม",
};

const SORT_LABEL: Record<CustomerSort, string> = {
  recent: "เพิ่มล่าสุด",
  name: "ชื่อ",
  spent: "ยอดซื้อสูงสุด",
  last: "ซื้อล่าสุด",
};

type Search = { q?: string; filter?: string; sort?: string; page?: string; deleted?: string };

function hrefFor(base: Search, patch: Search): string {
  const next = { ...base, ...patch };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.filter && next.filter !== "all") qs.set("filter", next.filter);
  if (next.sort && next.sort !== "last") qs.set("sort", next.sort);
  if (next.page && next.page !== "1") qs.set("page", next.page);
  const s = qs.toString();
  return s ? `/app/customers?${s}` : "/app/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const state: Search = {
    q: one("q")?.slice(0, 120),
    filter: CUSTOMER_FILTERS.includes(one("filter") as CustomerFilter) ? one("filter") : "all",
    sort: CUSTOMER_SORTS.includes(one("sort") as CustomerSort) ? one("sort") : "last",
    page: one("page"),
  };

  const tenantId = await activeTenantId();
  /* บัญชี B2B: รายการผู้ติดต่อแบบ CRM (docs/ux-plan.md U3) · บัญชีค้าปลีกใช้หน้าเดิมด้านล่าง */
  if (isB2BTenant(tenantId)) return <B2BContacts sp={sp} />;
  const v = profileFor(tenantId).vocab;
  const [list, features] = await Promise.all([
    searchCustomers(tenantId, {
      q: state.q,
      filter: state.filter as CustomerFilter,
      sort: state.sort as CustomerSort,
      page: Number(state.page ?? 1) || 1,
    }),
    loadFeatures(tenantId),
  ]);

  const ever = features.filter((f) => f.frequency_total > 0);
  const repeat = features.filter((f) => f.frequency_total >= 2);
  const recent30 = features.filter((f) => f.frequency_total > 0 && f.recency_days <= 30);
  const silent90 = features.filter((f) => f.frequency_total > 0 && f.recency_days > 90);

  const revenue = features.reduce((s, f) => s + f.monetary_ltv, 0);
  const sortedByLtv = [...features].sort((a, b) => b.monetary_ltv - a.monetary_ltv);
  const top2 = sortedByLtv.slice(0, Math.round(features.length * 0.02));
  const top2Share = revenue ? (top2.reduce((s, f) => s + f.monetary_ltv, 0) / revenue) * 100 : 0;

  const reachMix = features.reduce<Record<string, number>>((acc, f) => {
    acc[f.reachable_by] = (acc[f.reachable_by] ?? 0) + 1;
    return acc;
  }, {});
  const affinityMix = ever.reduce<Record<string, number>>((acc, f) => {
    acc[f.discount_affinity] = (acc[f.discount_affinity] ?? 0) + 1;
    return acc;
  }, {});

  // เรียงตามความเสี่ยงหลุด × มูลค่า — คนที่ควรทักก่อน
  const priority = [...ever]
    .filter((f) => f.churn_risk >= 1.2)
    .sort((a, b) => b.churn_risk * b.monetary_ltv - a.churn_risk * a.monetary_ltv)
    .slice(0, 25);

  const first = (list.page - 1) * 50 + 1;
  const last = first + list.rows.length - 1;

  return (
    <>
      <PageHead
        label={v.th.base}
        title={`${v.th.people}ทั้งหมด`}
        lead={`ค้นหา เปิดดู แก้ไข หรือเพิ่ม${v.th.person}ทีละคน — ข้อมูลที่นำเข้าจากไฟล์และที่เพิ่มเองอยู่ที่เดียวกัน`}
        actions={
          <>
            <Link href="/app/customers/new" className="c-btn c-btn-primary">
              + เพิ่ม{v.th.person}
            </Link>
            <Link href="/app/import" className="c-btn c-btn-ghost">
              นำเข้าไฟล์
            </Link>
            {/* ส่งออกต้องขออนุมัติก่อน (B6) — ส่งตัวกรองปัจจุบันไปเป็นขอบเขตของคำขอ */}
            <Link
              href={hrefFor(state, { page: undefined }).replace("/app/customers", "/app/exports")}
              className="c-btn c-btn-ghost"
            >
              ส่งออก CSV
            </Link>
          </>
        }
      />

      {state.page === undefined && one("deleted") === "1" && (
        <p role="status" className="c-msg c-msg-ok mb-5">
          ลบแล้ว — ข้อมูลทั้งหมดของคนนั้นถูกลบออกจากระบบ
        </p>
      )}

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4 md:p-6">
        <Metric label={`${v.th.people}ในระบบ`} value={num(features.length)} />
        <Metric label="ซื้อซ้ำแล้ว" value={num(repeat.length)} sub={`จาก ${num(ever.length)} คนที่เคยซื้อ`} />
        <Metric label="ซื้อใน 30 วันล่าสุด" value={num(recent30.length)} />
        <Metric label="หายไปเกิน 90 วัน" value={num(silent90.length)} sub="นับเฉพาะคนที่เคยซื้อ" />
      </Panel>

      <Panel className="mb-6 p-5 md:p-6">
        {/* ผลค้นหาอยู่ใน URL จึงกดย้อนกลับ แชร์ลิงก์ และรีเฟรชได้ — <Form> ของ Next แทน
            <form> ธรรมดา เพราะ <form> โหลดหน้าใหม่ทั้งหน้าทุกครั้งที่กดค้นหา จอกะพริบ
            และดาวน์โหลด JavaScript ใหม่หมด ส่วนตัวนี้เปลี่ยนแค่เนื้อหาเหมือนกดลิงก์ */}
        <Form action="/app/customers" className="flex flex-wrap items-center gap-2.5">
          <input
            type="search"
            name="q"
            defaultValue={state.q}
            placeholder="ค้นหาชื่อ เบอร์โทร อีเมล LINE หรือรหัสสมาชิก"
            aria-label={`ค้นหา${v.th.person}`}
            className="c-input min-w-0 flex-1 basis-72"
          />
          {state.filter !== "all" && <input type="hidden" name="filter" value={state.filter} />}
          {state.sort !== "last" && <input type="hidden" name="sort" value={state.sort} />}
          <button type="submit" className="c-btn c-btn-primary">
            ค้นหา
          </button>
          {state.q && (
            <Link href={hrefFor(state, { q: undefined, page: undefined })} className="c-btn c-btn-ghost">
              ล้างคำค้น
            </Link>
          )}
        </Form>
        <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">
          ชื่อค้นได้บางส่วนของคำ · เบอร์ อีเมล และรหัสต้องพิมพ์ครบ เพราะเก็บแบบเข้ารหัส ·
          ส่งออก CSV ได้ตามที่กรองอยู่ — เบอร์และอีเมลส่งออกเฉพาะคนที่ยินยอมรับข่าวสาร
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <nav aria-label="กรอง" className="flex flex-wrap gap-1.5">
            {CUSTOMER_FILTERS.map((f) => (
              <Link
                key={f}
                href={hrefFor(state, { filter: f, page: undefined })}
                aria-current={state.filter === f ? "true" : undefined}
                className={`c-btn c-btn-sm ${state.filter === f ? "c-btn-primary" : "c-btn-ghost"}`}
              >
                {FILTER_LABEL[f]}
              </Link>
            ))}
          </nav>
          <nav aria-label="เรียงตาม" className="flex flex-wrap items-center gap-1.5">
            <span className="c-thai text-[0.8rem] text-[var(--c-text-3)]">เรียงตาม</span>
            {CUSTOMER_SORTS.map((s) => (
              <Link
                key={s}
                href={hrefFor(state, { sort: s, page: undefined })}
                aria-current={state.sort === s ? "true" : undefined}
                className={`c-thai rounded px-2 py-1 text-[0.82rem] ${
                  state.sort === s
                    ? "bg-[var(--c-panel-2)] text-[var(--c-text)]"
                    : "text-[var(--c-text-3)] hover:text-[var(--c-text)]"
                }`}
              >
                {SORT_LABEL[s]}
              </Link>
            ))}
          </nav>
        </div>

        <p className="c-thai mt-5 text-[0.84rem] text-[var(--c-text-3)]">
          {list.total
            ? `${num(first)}–${num(last)} จาก ${num(list.total)} คน`
            : state.q
              ? `ไม่พบ${v.th.person}ที่ตรงกับ "${state.q}"`
              : `ยังไม่มี${v.th.person}ในกลุ่มนี้`}
        </p>

        {list.rows.length > 0 && (
          <div className="c-scroll mt-3">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <th className={TH}>ชื่อ</th>
                  <th className={TH}>ช่องทางติดต่อ</th>
                  <th className={`${TH} text-right`}>{v.th.purchase} (ครั้ง)</th>
                  <th className={`${TH} text-right`}>{v.th.spend}รวม</th>
                  <th className={TH}>{v.th.purchase}ล่าสุด</th>
                  <th className={TH}>รับข่าวสาร</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={`/app/customers/${r.id}`}
                        className="text-[var(--c-text)] underline-offset-4 hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="c-thai mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">
                        เพิ่มเมื่อ {thaiDate(r.createdAt)}
                      </span>
                    </td>
                    <td className="c-thai text-[0.82rem]">
                      {r.kinds.length
                        ? r.kinds
                            .filter((k) => k !== "member_no")
                            .map((k) => CONTACT_KIND_LABEL[k] ?? k)
                            .join(" · ") || "รหัสสมาชิกเท่านั้น"
                        : "—"}
                    </td>
                    <td className="c-mono text-right">{r.orders ? num(r.orders) : "—"}</td>
                    <td className="c-mono text-right">{r.orders ? baht(r.spent) : "—"}</td>
                    <td className="c-thai text-[0.82rem]">
                      {r.lastAt ? (
                        <>
                          {thaiDate(r.lastAt)}
                          <span className="block text-[0.75rem] text-[var(--c-text-4)]">
                            {daysAgoLabel(r.lastAt)}
                          </span>
                        </>
                      ) : (
                        `ยังไม่เคย${v.th.purchaseVerb}`
                      )}
                    </td>
                    <td className="c-thai text-[0.82rem]">
                      {r.consent ? (
                        <span className="text-[var(--c-good)]">ยินยอม</span>
                      ) : (
                        <span className="text-[var(--c-text-4)]">ยังไม่ยินยอม</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.pages > 1 && (
          <nav aria-label="หน้า" className="mt-5 flex flex-wrap items-center gap-2">
            {list.page > 1 && (
              <Link href={hrefFor(state, { page: String(list.page - 1) })} className="c-btn c-btn-sm c-btn-ghost">
                ← ก่อนหน้า
              </Link>
            )}
            <span className="c-thai px-2 text-[0.84rem] text-[var(--c-text-3)]">
              หน้า {num(list.page)} จาก {num(list.pages)}
            </span>
            {list.page < list.pages && (
              <Link href={hrefFor(state, { page: String(list.page + 1) })} className="c-btn c-btn-sm c-btn-ghost">
                ถัดไป →
              </Link>
            )}
          </nav>
        )}
      </Panel>

      <details className="c-panel p-5 md:p-6">
        <summary className="c-h2 cursor-pointer text-[var(--c-text)]">ภาพรวมฐานลูกค้า</summary>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
          <Metric label="มูลค่ารวมของฐาน" value={baht(revenue)} />
          <Metric
            label={`ยอดที่มาจาก${v.th.people} 2% แรก`}
            value={pct(top2Share, 0)}
            sub={`${num(top2.length)} คน`}
          />
          <Metric label="เคยซื้อ" value={num(ever.length)} />
          <Metric label="ซื้อซ้ำ" value={num(repeat.length)} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="c-h2 text-[var(--c-text)]">ทักได้ทางไหนบ้าง</h3>
            <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
              คนที่ยินยอมแล้วแต่ไม่มี LINE ทักตรงไม่ได้ เข้าถึงได้เฉพาะผ่านโฆษณา
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {(["line", "email", "paid_only", "none"] as ReachableBy[]).map((k) => {
                const n = reachMix[k] ?? 0;
                return (
                  <div key={k}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="c-thai text-[0.85rem] text-[var(--c-text-2)]">{REACHABLE_LABEL[k]}</span>
                      <span className="c-mono text-[0.85rem] text-[var(--c-text-3)]">{num(n)}</span>
                    </div>
                    <div className="c-meter mt-1.5">
                      <span
                        style={{
                          width: `${(n / Math.max(1, features.length)) * 100}%`,
                          background: k === "none" ? "var(--c-text-4)" : "var(--c-accent)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="c-h2 text-[var(--c-text)]">ไวต่อส่วนลดแค่ไหน</h3>
            <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
              คำนวณจากราคาป้ายเทียบราคาที่ขายจริง ไม่ต้องใช้ต้นทุนของร้าน
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {(["full_price", "mixed", "discount_seeker"] as DiscountAffinity[]).map((k) => {
                const n = affinityMix[k] ?? 0;
                return (
                  <div key={k}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="c-thai text-[0.85rem] text-[var(--c-text-2)]">{AFFINITY_LABEL[k]}</span>
                      <span className="c-mono text-[0.85rem] text-[var(--c-text-3)]">{num(n)}</span>
                    </div>
                    <div className="c-meter mt-1.5">
                      <span style={{ width: `${(n / Math.max(1, ever.length)) * 100}%`, background: "var(--c-accent)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <h3 className="c-h2 mt-10 text-[var(--c-text)]">25 คนที่ควรทักก่อน</h3>
        <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
          เรียงจากคนที่หายไปนานเกินรอบปกติของตัวเองมากที่สุด คูณด้วยยอดที่เคยซื้อ
        </p>
        <div className="c-scroll mt-4">
          <table className="c-table min-w-[44rem]">
            <thead>
              <tr>
                <th className={TH}>ชื่อ</th>
                <th className={TH}>ปกติซื้อทุก</th>
                <th className={TH}>หายไปแล้ว</th>
                <th className={`${TH} text-right`}>ยอดที่เคยซื้อ</th>
                <th className={TH}>ทักได้ทาง</th>
              </tr>
            </thead>
            <tbody>
              {priority.map((f) => (
                <tr key={f.customer_id}>
                  <td>
                    <Link
                      href={`/app/customers/${f.customer_id}`}
                      className="text-[var(--c-text)] underline-offset-4 hover:underline"
                    >
                      {f.name}
                    </Link>
                  </td>
                  <td className="c-thai text-[0.84rem]">
                    {num(f.personal_cycle_days)} วัน
                    {f.cycle_is_estimated && <span className="text-[var(--c-text-4)]"> (ประมาณ)</span>}
                  </td>
                  <td className="c-thai text-[0.84rem]">
                    {num(f.recency_days)} วัน
                    <span className="block text-[0.75rem] text-[var(--c-text-4)]">
                      นานกว่าปกติ {f.churn_risk.toFixed(1)} เท่า
                    </span>
                  </td>
                  <td className="c-mono text-right">{baht(f.monetary_ltv)}</td>
                  <td className="c-thai text-[0.8rem]">{REACHABLE_LABEL[f.reachable_by]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">
          "ประมาณ" คือคนที่ซื้อครั้งเดียว ยังคำนวณรอบของตัวเองไม่ได้ จึงใช้ค่ากลางของคนที่ซื้อแบบเดียวกันแทน
        </p>

        <div className="mt-6">
          <ActionForm
            action={deriveAction}
            fields={{ tenantId }}
            label="คำนวณข้อมูลลูกค้าใหม่"
            pendingLabel="กำลังคำนวณ…"
            size="sm"
          />
        </div>
      </details>
    </>
  );
}
