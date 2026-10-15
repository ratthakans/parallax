import Link from "next/link";
import { notFound } from "next/navigation";
import { viewer } from "@/app/(app)/viewer";
import { closeRequestAction, verifyIdentityAction } from "@/app/(app)/dsar-actions";
import { getRequest } from "@/lib/engine/dsar";
import { listBases } from "@/lib/engine/policy";
import { DSAR_CHANNEL_TH, DSAR_KIND_DONE_TH, DSAR_KIND_TH } from "@/lib/shared/dsar";
import { thaiDate, thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";
import { DueBadge } from "@/components/console/dsar-badge";

export const dynamic = "force-dynamic";

/* ── คำขอสิทธิหนึ่งเรื่อง ── ยืนยันตัวตน → (รายงาน) → ปิด · ขั้นที่ทำไม่ได้แสดงว่าทำไม ไม่ซ่อน */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await viewer();
  const r = await getRequest(v.tenantId, id);
  if (!r) notFound();
  const owner = v.role === "owner";
  const needsReport = r.kind === "access" || r.kind === "portability";
  const needsPurpose = r.kind === "withdraw" || r.kind === "object" || r.kind === "restrict";
  const purposes = needsPurpose ? await listBases(v.tenantId) : [];
  const hasSubject = Boolean(r.subjectId && !r.subjectGone);

  return (
    <>
      <Link href="/app/requests" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← คำขอสิทธิ</Link>
      <PageHead label={`คำขอสิทธิ · ${r.ref}`} title={DSAR_KIND_TH[r.kind]} lead={DSAR_KIND_DONE_TH[r.kind]} />

      <Panel flat className="mb-6 grid gap-4 p-5 text-[0.86rem] md:grid-cols-2 md:p-6">
        <dl className="c-thai grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[var(--c-text-2)]">
          <dt className="text-[var(--c-text-4)]">สถานะ</dt><dd><DueBadge r={r} /></dd>
          <dt className="text-[var(--c-text-4)]">ผู้ขอ</dt>
          <dd>
            {hasSubject
              ? <Link href={`/app/customers/${r.subjectId}`} className="underline underline-offset-4">{r.subjectName}</Link>
              : r.subjectGone ? "ถูกลบออกจากระบบแล้ว" : "ไม่พบข้อมูลของผู้ขอในระบบ"}
          </dd>
          <dt className="text-[var(--c-text-4)]">ได้รับทาง</dt><dd>{DSAR_CHANNEL_TH[r.channel]} · {thaiDate(r.receivedAt)}</dd>
          <dt className="text-[var(--c-text-4)]">ครบกำหนด</dt><dd>{thaiDate(r.dueAt)}</dd>
        </dl>
        <dl className="c-thai grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[var(--c-text-2)]">
          <dt className="text-[var(--c-text-4)]">บันทึกโดย</dt><dd>{r.createdBy} · {thaiDateTime(r.createdAt)}</dd>
          <dt className="text-[var(--c-text-4)]">ยืนยันตัวตน</dt>
          <dd>{r.verifiedAt ? `${r.verificationNote} — ${r.verifiedBy} · ${thaiDateTime(r.verifiedAt)}` : "ยังไม่ยืนยัน"}</dd>
          {needsReport && <><dt className="text-[var(--c-text-4)]">รายงาน</dt><dd>{r.reportAt ? `สร้างล่าสุด ${thaiDateTime(r.reportAt)}` : "ยังไม่สร้าง"}</dd></>}
          {r.closedAt && <><dt className="text-[var(--c-text-4)]">ปิดโดย</dt><dd>{r.closedBy} · {thaiDateTime(r.closedAt)}</dd>
            <dt className="text-[var(--c-text-4)]">ผล</dt><dd className="whitespace-pre-line">{r.outcomeNote}</dd></>}
        </dl>
      </Panel>

      {r.status === "open" && (
        <div className="grid gap-6">
          {/* ── 1 · ยืนยันตัวตน ── */}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">1 · ยืนยันตัวตนผู้ขอ</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
              เท่าที่จำเป็น — เช่น ให้ตอบกลับจากอีเมลที่อยู่ในระบบ หรือโทรกลับเบอร์ที่อยู่ในระบบ · บันทึกวิธีที่ใช้ ไม่ต้องเก็บสำเนาบัตร
              {!hasSubject && " · ไม่พบข้อมูลในระบบ: ข้ามขั้นนี้และปิดคำขอโดยบันทึกว่าแจ้งผู้ขอแล้ว"}
            </p>
            {hasSubject && (
              <ActionForm action={verifyIdentityAction} fields={{ requestId: r.id }} label={r.verifiedAt ? "บันทึกใหม่" : "บันทึกว่ายืนยันแล้ว"}
                pendingLabel="กำลังบันทึก…" size="sm" className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className={LABEL}>ยืนยันด้วยวิธีใด
                  <input name="note" className="c-input" maxLength={300} placeholder="เช่น ผู้ขอตอบกลับจากอีเมลที่อยู่ในระบบ 15 ต.ค." required />
                </label>
              </ActionForm>
            )}
          </Panel>

          {/* ── 2 · รายงาน (เข้าถึง · โอน) ── */}
          {needsReport && hasSubject && (
            <Panel className="p-5 md:p-6">
              <h2 className="c-h2 text-[var(--c-text)]">2 · รายงานข้อมูลของผู้ขอ</h2>
              <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
                ไฟล์ JSON รวมทุกที่ที่ข้อมูลของผู้ขออยู่ — ช่องทางติดต่อแบบเต็ม สังกัด ปฏิสัมพันธ์ ความยินยอม วัตถุประสงค์และฐาน แหล่งที่มา แคมเปญ ประวัติการแก้ค่า
                ข้อมูลที่ AI สร้าง และใครเปิดดูข้อมูลติดต่อ · ชื่อบุคคลอื่นถูกแทนแล้ว แต่ข้อความอิสระต้องตรวจเอง — ดูรายการ “reviewBeforeSending” ในไฟล์
              </p>
              {!r.verifiedAt ? (
                <p className="c-thai mt-3 text-[0.84rem] text-[var(--c-warn)]">ยืนยันตัวตนก่อน — รายงานมีข้อมูลเต็ม</p>
              ) : !owner ? (
                <p className="c-thai mt-3 text-[0.84rem] text-[var(--c-text-3)]">เจ้าของบัญชีเป็นผู้สร้างรายงาน</p>
              ) : (
                <a href={`/app/requests/${r.id}/report`} className="c-btn c-btn-ghost c-btn-sm mt-3 inline-flex">ดาวน์โหลดรายงาน ({r.ref}.json)</a>
              )}
            </Panel>
          )}

          {/* ── ปิดคำขอ ── */}
          <Panel flat className={`p-5 ${r.kind === "erase" ? "border-[var(--c-bad)]/40" : ""}`}>
            <h2 className="c-h2 text-[var(--c-text)]">{needsReport && hasSubject ? "3" : "2"} · ปิดคำขอ</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
              {hasSubject ? DSAR_KIND_DONE_TH[r.kind] : "ไม่พบข้อมูล: ปิดเป็น “ดำเนินการแล้ว” พร้อมบันทึกว่าแจ้งผู้ขออย่างไร"}
              {" · "}ปฏิเสธได้เมื่อมีเหตุตามกฎหมาย (เช่น ยืนยันตัวตนไม่ได้ · ต้องเก็บตามหน้าที่ทางกฎหมาย) และต้องแจ้งเหตุผลแก่ผู้ขอ
            </p>
            {!owner ? (
              <p className="c-thai mt-3 text-[0.84rem] text-[var(--c-text-3)]">เจ้าของบัญชีเป็นผู้ปิดคำขอ</p>
            ) : (
              <ActionForm
                action={closeRequestAction}
                fields={{ requestId: r.id }}
                label="ปิดคำขอ"
                confirm={r.kind === "erase" && hasSubject ? `กดอีกครั้ง — ถ้าเลือก “ดำเนินการแล้ว” ${r.subjectName} จะถูกลบถาวร` : "กดอีกครั้งเพื่อปิดคำขอ"}
                pendingLabel="กำลังปิด…"
                variant={r.kind === "erase" ? "danger" : "primary"}
                size="sm"
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <label className={LABEL}>ผล
                  <select name="outcome" className="c-select" defaultValue="done">
                    <option value="done">ดำเนินการแล้ว</option>
                    <option value="rejected">ปฏิเสธ</option>
                  </select>
                </label>
                {needsPurpose && hasSubject && (
                  <label className={LABEL}>วัตถุประสงค์
                    <select name="purposeId" className="c-select" defaultValue="">
                      <option value="">ทุกวัตถุประสงค์</option>
                      {purposes.map((p) => <option key={p.purpose_id} value={p.purpose_id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
                <label className={`${LABEL} sm:col-span-2`}>บันทึก (แจ้งผู้ขออย่างไร · แก้อะไร · เหตุที่ปฏิเสธ)
                  <textarea name="note" className="c-input min-h-[5rem]" maxLength={1000} />
                </label>
              </ActionForm>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
