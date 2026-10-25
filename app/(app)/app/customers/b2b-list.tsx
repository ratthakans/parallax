import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { CONTACT_SORTS, CONTACT_VIEWS, listContacts, type ContactSort, type ContactView } from "@/lib/engine/accounts/contacts-list";
import { CONTACT_KIND_LABEL } from "@/lib/shared/contact-kinds";
import { baht, thaiDate } from "@/lib/shared/format";
import { hasB2C, type CustomerMode } from "@/lib/shared/tenants";
import { Blank, PageHead, Panel, num } from "@/components/console/ui";
import { ListViews, Pager, SortTh, type ListState } from "@/components/console/list-view";

/* ── รายการผู้ติดต่อของบัญชี B2B (docs/ux-plan.md U3) ──
   หน้ารายชื่อเดิม (ยอดซื้อ · ซื้อซ้ำ) เป็นของยุคค้าปลีก — บัญชี B2B ได้คอลัมน์แบบ CRM แทน */

const BASE = "/app/customers";
const VIEWS: { key: ContactView; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "employed", label: "ยังสังกัดบริษัท" },
  { key: "touched", label: "เคยติดต่อแล้ว" },
  { key: "email", label: "มีอีเมล" },
  { key: "phone", label: "มีเบอร์" },
  { key: "no_org", label: "ไม่มีสังกัด" },
  { key: "stopped", label: "ห้ามติดต่อ" },
];

/* บัญชีที่มีลูกค้าบุคคลด้วย (docs/crm-plan.md F2) — แยกบริษัท/บุคคลด้วยสังกัดปัจจุบัน · มีคอลัมน์ยอดซื้อ */
const HYBRID_VIEWS: { key: ContactView; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "employed", label: "ลูกค้าบริษัท" },
  { key: "no_org", label: "ลูกค้าบุคคล" },
  { key: "buyers", label: "เคยซื้อ" },
  { key: "touched", label: "เคยติดต่อแล้ว" },
  { key: "stopped", label: "ห้ามติดต่อ" },
];

export async function B2BContacts({ sp, mode = "b2b" }: { sp: Record<string, string | string[] | undefined>; mode?: CustomerMode }) {
  const buy = hasB2C(mode);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const v = await viewer();
  const view = (CONTACT_VIEWS as readonly string[]).includes(one("view") ?? "") ? (one("view") as ContactView) : "all";
  const sort = (CONTACT_SORTS as readonly string[]).includes(one("sort") ?? "") ? (one("sort") as ContactSort) : undefined;
  const dir = one("dir") === "asc" || one("dir") === "desc" ? (one("dir") as "asc" | "desc") : undefined;
  const q = one("q")?.slice(0, 120);
  const list = await listContacts(v.tenantId, { q, view, sort, dir, page: Number(one("page")) || 1, purchases: buy }, { id: v.actor, clearance: v.clearance });
  const state: ListState = { q, view, sort, dir, page: list.page };

  return (
    <>
      <PageHead
        label="ผู้ติดต่อ"
        title={buy ? "ลูกค้าและผู้ติดต่อ" : "ผู้ติดต่อ"}
        actions={<>
          <Link href="/app/customers/new" className="c-btn c-btn-primary">+ ผู้ติดต่อ</Link>
          <Link href="/app/vault" className="c-btn c-btn-ghost">{buy ? "นำเข้ารายชื่อ" : "นำเข้าไฟล์"}</Link>
          {/* ไฟล์ยอดขาย/ออเดอร์ (F4) — ตัวนำเข้าเดิมจับคนจากเบอร์/อีเมลเดียวกับรายชื่อ ยอดซื้อจึงไปอยู่กับคนเดิม */}
          {buy && <Link href="/app/import" className="c-btn c-btn-ghost">นำเข้ายอดขาย</Link>}
          <Link href={`/app/exports${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="c-btn c-btn-ghost">ส่งออก CSV</Link>
        </>}
      />
      {one("deleted") === "1" && <p role="status" className="c-msg c-msg-ok mb-4">ลบแล้ว — อีเมลและเบอร์อยู่ในทะเบียนการลบ ไม่ถูกนำเข้าซ้ำ</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListViews base={BASE} state={state} views={buy ? HYBRID_VIEWS : VIEWS} />
        <form className="flex min-w-0 flex-1 basis-64 justify-end gap-2" action={BASE}>
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={q ?? ""} className="c-input max-w-xs" placeholder="ชื่อ หรืออีเมล/เบอร์แบบเต็ม" aria-label="ค้นผู้ติดต่อ" />
          <button type="submit" className="c-btn c-btn-ghost">ค้นหา</button>
        </form>
      </div>

      <Panel className="p-0">
        <p className="c-thai border-b border-[var(--c-line)] px-5 py-3 text-[0.84rem] text-[var(--c-text-3)]">
          {num(list.total)} คน{q ? ` ที่ตรงกับ “${q}”` : ""}
        </p>
        {list.rows.length ? (
          <div className="c-scroll px-5 pb-2" tabIndex={0} role="region" aria-label="ตารางผู้ติดต่อ">
            <table className="c-table min-w-[56rem]">
              <thead>
                <tr>
                  <SortTh base={BASE} state={state} col="name" label="ชื่อ" />
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">ตำแหน่ง</th>
                  <SortTh base={BASE} state={state} col="org" label="บริษัท" />
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">ช่องทาง</th>
                  {buy && <SortTh base={BASE} state={state} col="spent" label="ยอดซื้อ" defaultDir="desc" align="right" />}
                  <SortTh base={BASE} state={state} col="last" label="ติดต่อล่าสุด" defaultDir="desc" />
                  <SortTh base={BASE} state={state} col="recent" label="เพิ่มเมื่อ" defaultDir="desc" />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.visible
                        ? <Link href={`/app/customers/${r.id}`} className="c-thai inline-block py-1 text-[var(--c-accent)] hover:underline">{r.name}</Link>
                        : <span className="c-thai text-[var(--c-text-3)]">{r.name}</span>}
                      {r.stopped && <span className="c-pill c-pill-bad ml-2">ห้ามติดต่อ</span>}
                    </td>
                    <td className="c-thai text-[0.84rem]">{r.title ?? <span className="text-[var(--c-text-4)]">—</span>}</td>
                    <td className="c-thai text-[0.84rem]">
                      {r.orgId ? <Link href={`/app/accounts/${r.orgId}`} className="hover:text-[var(--c-accent)]">{r.org}</Link> : (r.org ?? <span className="text-[var(--c-text-4)]">—</span>)}
                    </td>
                    <td className="c-thai text-[0.8rem] text-[var(--c-text-3)]">{r.kinds.length ? r.kinds.map((k) => CONTACT_KIND_LABEL[k as keyof typeof CONTACT_KIND_LABEL] ?? k).join(" · ") : "—"}</td>
                    {buy && (
                      <td className="c-mono text-right text-[0.82rem]">
                        {r.orders ? <>{baht(r.spent ?? 0)} <span className="text-[var(--c-text-4)]">· {num(r.orders)} ครั้ง</span></> : <span className="text-[var(--c-text-4)]">—</span>}
                      </td>
                    )}
                    <td className="c-thai text-[0.82rem]">{r.lastAt ? thaiDate(r.lastAt) : <Blank label="ยังไม่เคยติดต่อ" />}</td>
                    <td className="c-thai text-[0.82rem] text-[var(--c-text-3)]">{thaiDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai px-5 py-5 text-[0.88rem] text-[var(--c-text-3)]">ไม่พบผู้ติดต่อที่ตรงเงื่อนไข — อีเมลและเบอร์ต้องพิมพ์ครบ เพราะเก็บแบบเข้ารหัส</p>
        )}
        <div className="px-5 pb-5"><Pager base={BASE} state={state} page={list.page} pages={list.pages} /></div>
      </Panel>
    </>
  );
}
