import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { approveExportAction, cancelExportAction, requestExportAction } from "@/app/(app)/export-actions";
import { listExports, scopeFrom, type ExportRequest } from "@/lib/engine/exports";
import { thaiDateTime } from "@/lib/shared/format";
import { MFA_NEEDED_TH, can, deniedTh } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel, num } from "@/components/console/ui";

export const metadata = { title: "ส่งออกข้อมูล" };
export const dynamic = "force-dynamic";

/* ── ส่งออกแบบขออนุมัติ (B6 · docs/solo-plan.md หัวข้อ 6.1) ─────────────
   ขอพร้อมเหตุผล → อนุมัติ (เจ้าของอีกคน = พร้อมทันที · ตัวเองในบัญชีที่มีเจ้าของคนเดียว = รอ 1 ชั่วโมง)
   → ผู้ขอดาวน์โหลดครั้งเดียวภายใน 24 ชั่วโมง · ขอบเขตมาจากตัวกรองของหน้ารายชื่อ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";
const FILTER_TH: Record<string, string> = {
  all: "ทั้งหมด", buyers: "เคยซื้อ", never: "ยังไม่เคยซื้อ", line: "มี LINE", phone: "มีเบอร์", email: "มีอีเมล",
  consent: "ยินยอมรับข่าวสาร", no_consent: "ยังไม่ยินยอม",
};
const STAGE: Record<ExportRequest["stage"], { th: string; pill: string }> = {
  awaiting_approval: { th: "รออนุมัติ", pill: "c-pill-warn" },
  waiting: { th: "รอครบช่วงรอ", pill: "c-pill-warn" },
  ready: { th: "ดาวน์โหลดได้", pill: "c-pill-good" },
  expired: { th: "หมดเวลา", pill: "" },
  done: { th: "ดาวน์โหลดแล้ว", pill: "" },
  cancelled: { th: "ยกเลิก", pill: "" },
};
const scopeTh = (r: ExportRequest) => `${FILTER_TH[r.scope.filter] ?? r.scope.filter}${r.scope.q ? " · มีคำค้น" : ""}`;

export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; sort?: string }> }) {
  const v = await viewer();
  const scope = scopeFrom(await searchParams);
  const requests = await listExports(v.tenantId);
  const mayRequest = can(v.role, "export_request"), mayApprove = can(v.role, "export_approve");

  return (
    <>
      <Link href="/app/customers" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← รายชื่อ</Link>
      <PageHead
        label="ข้อมูล"
        title="ส่งออกรายชื่อ"
        lead="ไฟล์มีเบอร์และอีเมล จึงต้องได้รับอนุมัติก่อนดาวน์โหลด"
        more="ออกไปแล้วตามคืนไม่ได้ — จึงต้องขอพร้อมเหตุผล · ผู้อนุมัติอีกคน (เจ้าของหรือผู้ดูแลข้อมูลส่วนบุคคล) อนุมัติ = ดาวน์โหลดได้ทันที · บัญชีที่มีผู้อนุมัติคนเดียวอนุมัติตัวเองได้ แต่ต้องรอ 1 ชั่วโมง · ผู้ขอดาวน์โหลดได้ครั้งเดียวภายใน 24 ชั่วโมง"
      />

      {(mayRequest || mayApprove) && v.mfa !== "verified" && (
        <p role="status" className="c-msg c-msg-err mb-6">{MFA_NEEDED_TH} · <Link href="/app/settings" className="underline underline-offset-4">ไปหน้าตั้งค่า</Link></p>
      )}
      {!mayRequest ? (
        <Panel flat className="mb-6 p-5"><p className="c-thai text-[0.86rem] text-[var(--c-text-3)]">{deniedTh("export_request")}</p></Panel>
      ) : (
        <Panel className="mb-6 p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ขอส่งออก</h2>
          <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
            ขอบเขต: {FILTER_TH[scope.filter]}{scope.q ? ` · คำค้น “${scope.q}”` : ""} — เปลี่ยนได้ที่ <Link href="/app/customers" className="underline underline-offset-4">หน้ารายชื่อ</Link> แล้วกดส่งออกอีกครั้ง
          </p>
          <ActionForm
            action={requestExportAction}
            fields={{ q: scope.q ?? "", filter: scope.filter, sort: scope.sort }}
            label="ส่งคำขอ"
            pendingLabel="กำลังส่ง…"
            variant="primary"
            size="sm"
            className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          >
            <label className={LABEL}>เหตุผลที่ต้องใช้ไฟล์
              <input name="reason" className="c-input" maxLength={300} placeholder="เช่น ส่งรายชื่อให้ทีมงานหน้างาน 20 ต.ค." required />
            </label>
          </ActionForm>
        </Panel>
      )}

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">คำขอส่งออก</h2>
        {requests.length ? (
          <ul className="mt-3 flex flex-col divide-y divide-[var(--c-line)]">
            {requests.map((r) => (
              <li key={r.id} className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="c-thai text-[0.9rem] text-[var(--c-text)]">
                    <span className={`c-pill mr-2 ${STAGE[r.stage].pill}`}>{STAGE[r.stage].th}</span>{r.reason}
                  </p>
                  <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
                    {scopeTh(r)} · ขอโดย {r.requestedBy} {thaiDateTime(r.requestedAt)}
                    {r.approvedBy && ` · อนุมัติโดย ${r.approvedBy === r.requestedBy ? "ตัวเอง" : r.approvedBy}`}
                    {r.stage === "waiting" && ` · ดาวน์โหลดได้ตั้งแต่ ${thaiDateTime(r.readyAt)}`}
                    {r.stage === "ready" && ` · ภายใน ${thaiDateTime(r.expiresAt)}`}
                    {r.downloadedAt && ` · ดาวน์โหลด ${thaiDateTime(r.downloadedAt)} (${num(r.rowCount ?? 0)} แถว)`}
                    {r.cancelledBy && ` · ยกเลิกโดย ${r.cancelledBy}`}
                  </p>
                </div>
                {(mayRequest || mayApprove) && (
                  <div className="flex flex-wrap gap-2">
                    {r.stage === "awaiting_approval" && mayApprove && (
                      <ActionForm action={approveExportAction} fields={{ requestId: r.id }} size="sm"
                        label={r.requestedBy === v.actor ? "อนุมัติตัวเอง (รอ 1 ชม.)" : "อนุมัติ"}
                        confirm={r.requestedBy === v.actor ? "กดอีกครั้ง — ดาวน์โหลดได้หลังรอ 1 ชั่วโมง" : undefined} pendingLabel="กำลังอนุมัติ…" />
                    )}
                    {r.stage === "ready" && r.requestedBy === v.actor && (
                      // <a> ไม่ใช่ <Link> — เป็นการดาวน์โหลดไฟล์
                      <a href={`/app/customers/export?request=${r.id}`} className="c-btn c-btn-primary c-btn-sm" download>ดาวน์โหลด (ครั้งเดียว)</a>
                    )}
                    {(r.stage === "awaiting_approval" || r.stage === "waiting" || r.stage === "ready") && (
                      <ActionForm action={cancelExportAction} fields={{ requestId: r.id }} label="ยกเลิก" size="sm" pendingLabel="กำลังยกเลิก…" />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีคำขอ</p>
        )}
      </Panel>
    </>
  );
}
