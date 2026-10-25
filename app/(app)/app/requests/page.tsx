import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { openRequestAction } from "@/app/(app)/dsar-actions";
import { listRequests } from "@/lib/engine/dsar";
import { get } from "@/lib/engine/sql";
import {
  DSAR_CHANNELS, DSAR_CHANNEL_TH, DSAR_DUE_DAYS, DSAR_KINDS, DSAR_KIND_TH, DSAR_WARN_DAYS,
} from "@/lib/shared/dsar";
import { bangkokDay, thaiDate } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { Metric, PageHead, Panel, num } from "@/components/console/ui";
import { DueBadge } from "@/components/console/dsar-badge";

export const metadata = { title: "คำขอสิทธิ" };
export const dynamic = "force-dynamic";

/* ── คำขอสิทธิ (docs/plan.md หัวข้อ 7.4 · B6) ─────────────────────
   ทะเบียนคำขอพร้อมตัวนับ 30 วัน · เปิดคำขอจากอีเมล/เบอร์ของผู้ขอ (หาด้วย HMAC ไม่เก็บค่าที่พิมพ์)
   หรือจากหน้าคน (?subject=<รหัส>) · รายการไม่แสดงชื่อผู้ขอ — เปิดดูที่หน้าคำขอ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const v = await viewer();
  const { subject } = await searchParams;
  const [requests, person] = await Promise.all([
    listRequests(v.tenantId),
    subject ? get<{ id: string; name: string }>("SELECT id, name FROM customers WHERE tenant_id = ? AND id = ?", v.tenantId, subject) : null,
  ]);
  const open = requests.filter((r) => r.status === "open");
  const late = open.filter((r) => r.daysLeft < 0).length;
  const soon = open.filter((r) => r.daysLeft >= 0 && r.daysLeft <= DSAR_WARN_DAYS).length;
  const closedLate = requests.filter((r) => r.closedAt && bangkokDay(new Date(r.closedAt)) > r.dueAt).length;

  return (
    <>
      <PageHead
        label="ข้อมูล"
        title="คำขอสิทธิ"
        lead={`คำขอจากเจ้าของข้อมูล — ต้องตอบภายใน ${DSAR_DUE_DAYS} วัน`}
        more="เข้าถึง โอน แก้ไข คัดค้าน ถอน ลบ หรือจำกัดการใช้ · นับจากวันที่ได้รับ · ปิดคำขอลบหรือถอน = ระบบทำการนั้นจริง ไม่ใช่แค่เปลี่ยนสถานะ"
      />

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="เปิดอยู่" value={num(open.length)} tone={open.length ? "accent" : "muted"} />
        <Metric label={`ครบกำหนดใน ${DSAR_WARN_DAYS} วัน`} value={num(soon)} tone={soon ? "accent" : "muted"} />
        <Metric label="เลยกำหนด" value={num(late)} tone={late ? "bad" : "muted"} />
        <Metric label="ปิดหลังกำหนด (ทั้งหมด)" value={num(closedLate)} tone={closedLate ? "bad" : "muted"} sub={`ปิดแล้ว ${num(requests.length - open.length)}`} />
      </Panel>

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">บันทึกคำขอใหม่</h2>
        <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
          {person
            ? <>ผู้ขอ: <Link href={`/app/customers/${person.id}`} className="underline underline-offset-4">{person.name}</Link></>
            : "ใส่อีเมลหรือเบอร์ที่ผู้ขอใช้ติดต่อมา ระบบหาคนด้วยค่าเข้ารหัสทางเดียว และไม่เก็บค่าที่พิมพ์ · ไม่พบในระบบก็ยังต้องบันทึกและตอบผู้ขอ"}
        </p>
        <ActionForm
          action={openRequestAction}
          fields={person ? { subjectId: person.id } : {}}
          label="บันทึกคำขอ"
          pendingLabel="กำลังบันทึก…"
          variant="primary"
          size="sm"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {!person && (
            <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2 sm:col-span-2 lg:col-span-3">
              <label className={LABEL}>ผู้ขอ
                <select name="contactKind" className="c-select" defaultValue="email">
                  <option value="email">อีเมล</option>
                  <option value="phone">เบอร์</option>
                </select>
              </label>
              <label className={LABEL}>&nbsp;
                <input name="contactValue" className="c-input" autoComplete="off" placeholder="อีเมลหรือเบอร์ของผู้ขอ" maxLength={120} />
              </label>
            </div>
          )}
          <label className={LABEL}>ชนิดคำขอ
            <select name="kind" className="c-select" defaultValue="access">
              {DSAR_KINDS.map((k) => <option key={k} value={k}>{DSAR_KIND_TH[k]}</option>)}
            </select>
          </label>
          <label className={LABEL}>ได้รับทาง
            <select name="channel" className="c-select" defaultValue="email">
              {DSAR_CHANNELS.map((c) => <option key={c} value={c}>{DSAR_CHANNEL_TH[c]}</option>)}
            </select>
          </label>
          <label className={LABEL}>วันที่ได้รับ (เริ่มนับ {DSAR_DUE_DAYS} วัน)
            <input type="date" name="receivedAt" className="c-input" defaultValue={bangkokDay()} max={bangkokDay()} required />
          </label>
        </ActionForm>
      </Panel>

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ทะเบียนคำขอ</h2>
        {requests.length ? (
          <div className="c-scroll mt-4">
            <table className="c-table min-w-[44rem]">
              <thead>
                <tr><th>เลขเรื่อง</th><th>ชนิด</th><th>รับเมื่อ</th><th>ครบกำหนด</th><th>ยืนยันตัวตน</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/app/requests/${r.id}`} className="c-mono text-[var(--c-text)] underline-offset-4 hover:underline">{r.ref}</Link></td>
                    <td className="c-thai">{DSAR_KIND_TH[r.kind]}</td>
                    <td className="c-thai text-[0.8rem]">{thaiDate(r.receivedAt)}</td>
                    <td className="c-thai text-[0.8rem]">{thaiDate(r.dueAt)}</td>
                    <td className="c-thai text-[0.8rem]">{r.verifiedAt ? "ยืนยันแล้ว" : r.status === "open" ? "ยังไม่ยืนยัน" : "—"}</td>
                    <td><DueBadge r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai mt-4 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีคำขอ</p>
        )}
      </Panel>
    </>
  );
}
