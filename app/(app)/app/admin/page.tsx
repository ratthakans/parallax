import { currentUser } from "@/lib/shared/session";
import { adminData } from "@/lib/engine/admin";
import { PLANS, PLAN_ORDER } from "@/lib/shared/plans";
import { ROLE_TH, roleFrom } from "@/lib/shared/roles";
import { daysAgoLabel, thaiDate, thaiDateTime } from "@/lib/shared/format";
import { Metric, PageHead, Panel, num } from "@/components/console/ui";
import { ActionForm } from "@/components/console/action-form";
import { mockCreateShopAction, mockInviteUserAction } from "../../admin-actions";

export const dynamic = "force-dynamic";

/* ── ผู้ดูแลระบบ ──────────────────────────────────────────────────

   หน้าของทีม PARALLAX ไม่ใช่ของร้าน: ทุกร้าน ทุกผู้ใช้ และคำขอทดลองใช้จากเว็บ
   (contact_leads) ที่ก่อนหน้านี้อ่านได้จาก Supabase Table Editor เท่านั้น
   สิทธิ์ตรวจใน adminData() — คนที่ไม่ใช่ผู้ดูแลไม่ได้ข้อมูลแม้แต่แถวเดียว */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function AdminPage() {
  const user = await currentUser();
  const data = await adminData(user?.email);

  if (!data) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <p className="c-label-th text-[var(--c-warn)]">ไม่มีสิทธิ์</p>
        <h1 className="c-h1 mt-4 text-[var(--c-text)]">หน้านี้สำหรับทีมผู้ดูแลระบบ PARALLAX</h1>
        <p className="c-thai mt-4 text-[0.9rem] leading-relaxed text-[var(--c-text-2)]">
          บัญชี {user?.email ?? "นี้"} ไม่อยู่ในรายชื่อผู้ดูแล — ผู้ดูแลกำหนดด้วยตัวแปร ADMIN_EMAILS บนเซิร์ฟเวอร์
        </p>
      </div>
    );
  }

  const { shops, leads, users } = data;
  const week = Date.now() - 7 * 86400000;
  const newLeads = leads.filter((l) => Date.parse(l.receivedAt) >= week).length;

  return (
    <>
      <PageHead
        label="ผู้ดูแลระบบ"
        title="ร้าน ผู้ใช้ และคำขอทดลองใช้"
        lead="ทุกร้านในระบบ ใครเข้าร้านไหนได้ และข้อความที่เข้ามาจากฟอร์มบนเว็บ"
      />

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="ร้านทั้งหมด" value={num(shops.length)} sub={`ข้อมูลจริง ${num(shops.filter((s) => !s.synthetic && s.customers > 0).length)} ร้าน`} />
        <Metric label="ผู้ใช้" value={users.length ? num(users.length) : "—"} sub={users.length ? undefined : "ดูได้เมื่อใช้ Supabase"} />
        <Metric label="คำขอทดลองใช้ 7 วัน" value={num(newLeads)} tone={newLeads > 0 ? "accent" : "muted"} sub={`ทั้งหมด ${num(leads.length)}`} />
        <Metric label="ลูกค้าทุกร้านรวม" value={num(shops.reduce((s, x) => s + x.customers, 0))} />
      </Panel>

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">คำขอทดลองใช้จากเว็บ</h2>
        <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">
          ทุกข้อความจากฟอร์ม /contact เก็บที่นี่ แม้ยังไม่ได้ตั้ง webhook — ตอบกลับภายใน 2 วันทำการตามที่หน้าขอบคุณบอกไว้
        </p>
        {leads.length ? (
          <ul className="mt-4 flex flex-col divide-y divide-[var(--c-line)]">
            {leads.map((l) => (
              <li key={l.id} className="grid gap-2 py-4 md:grid-cols-[13rem_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="text-[var(--c-text)]">{l.name}</p>
                  <p className="c-thai text-[0.8rem] text-[var(--c-text-3)]">{l.company}</p>
                  <p className="c-thai mt-1 text-[0.75rem] text-[var(--c-text-4)]">
                    {thaiDateTime(l.receivedAt)} · {daysAgoLabel(l.receivedAt)}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    {l.topic && <span className="c-pill c-pill-keep">{l.topic}</span>}
                    {l.cycle && <span className="c-pill">{l.cycle}</span>}
                    {l.baseSize && <span className="c-pill">{l.baseSize}</span>}
                    {l.forwarded && <span className="c-pill c-pill-good">ส่งต่อ webhook แล้ว</span>}
                  </div>
                  {l.message && (
                    <p className="c-thai mt-2 whitespace-pre-line text-[0.86rem] text-[var(--c-text-2)]">{l.message}</p>
                  )}
                  <p className="c-thai mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem]">
                    <a href={`mailto:${l.email}`} className="text-[var(--c-cyan)] underline underline-offset-4">{l.email}</a>
                    {l.phone && (
                      <a href={`tel:${l.phone}`} className="text-[var(--c-cyan)] underline underline-offset-4">{l.phone}</a>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="c-thai mt-4 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีคำขอเข้ามา</p>
        )}
      </Panel>

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ร้านทั้งหมด</h2>
        <div className="c-scroll mt-4">
          <table className="c-table min-w-[52rem]">
            <thead>
              <tr>
                <th>ร้าน</th>
                <th>แผน</th>
                <th className="text-right">ลูกค้า</th>
                <th className="text-right">ผู้ใช้</th>
                <th className="text-right">เครดิต</th>
                <th>นำเข้าล่าสุด</th>
                <th>ใช้งานล่าสุด</th>
                <th>ข้อมูล</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="text-[var(--c-text)]">{s.name}</span>
                    <span className="c-thai mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">{s.industry}</span>
                  </td>
                  <td className="c-thai">{s.plan}</td>
                  <td className="c-mono text-right">{num(s.customers)}</td>
                  <td className="c-mono text-right">{num(s.users)}</td>
                  <td className="c-mono text-right">{num(s.credits)}</td>
                  <td className="c-thai text-[0.8rem]">{s.lastImportAt ? thaiDate(s.lastImportAt) : "ยังไม่เคย"}</td>
                  <td className="c-thai text-[0.8rem]">{daysAgoLabel(s.lastActivityAt)}</td>
                  <td>
                    {s.customers === 0 ? (
                      <span className="c-pill">ว่าง</span>
                    ) : s.synthetic ? (
                      <span className="c-pill c-pill-warn">ตัวอย่าง</span>
                    ) : (
                      <span className="c-pill c-pill-good">ข้อมูลจริง</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ผู้ใช้</h2>
        {users.length ? (
          <div className="c-scroll mt-4">
            <table className="c-table min-w-[36rem]">
              <thead>
                <tr>
                  <th>อีเมล</th>
                  <th>ร้าน</th>
                  <th>บทบาท</th>
                  <th>เข้าระบบล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={`${u.email}-${u.tenantId}`}>
                    <td className="c-mono text-[0.82rem]">{u.email}</td>
                    <td className="c-thai">{shops.find((s) => s.id === u.tenantId)?.name ?? u.tenantId}</td>
                    <td className="c-thai">{ROLE_TH[roleFrom(u.role)].name}</td>
                    <td className="c-thai text-[0.8rem]">{u.lastSignInAt ? thaiDateTime(u.lastSignInAt) : "ยังไม่เคย"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">
            เครื่องนี้ใช้ฐานข้อมูลทดสอบที่ไม่มีระบบล็อกอิน — รายชื่อผู้ใช้จะขึ้นบนระบบจริง (Supabase)
          </p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5 md:p-6">
          <div className="flex items-center gap-2">
            <h2 className="c-h2 text-[var(--c-text)]">เพิ่มร้านใหม่</h2>
            <span className="c-pill c-pill-warn">ตัวอย่าง</span>
          </div>
          <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">
            ตอนนี้ร้านถูกกำหนดไว้ในโค้ด ปุ่มนี้แสดงขั้นตอนที่ระบบจริงจะทำ แต่ยังไม่สร้างอะไร
          </p>
          <ActionForm
            action={mockCreateShopAction}
            label="ดูว่าระบบจะทำอะไร"
            pendingLabel="กำลังตรวจ…"
            variant="primary"
            size="sm"
            className="mt-4 flex flex-col gap-3"
          >
            <label className={LABEL}>
              ชื่อร้าน
              <input name="name" className="c-input" placeholder="เช่น ร้านกาแฟสาขาสยาม" />
            </label>
            <label className={LABEL}>
              อีเมลเจ้าของร้าน
              <input name="ownerEmail" type="email" className="c-input" placeholder="owner@example.com" />
            </label>
            <label className={LABEL}>
              แผน
              <select name="plan" className="c-select" defaultValue="free">
                {PLAN_ORDER.map((id) => (
                  <option key={id} value={PLANS[id].name}>{PLANS[id].name}</option>
                ))}
              </select>
            </label>
          </ActionForm>
        </Panel>

        <Panel className="p-5 md:p-6">
          <div className="flex items-center gap-2">
            <h2 className="c-h2 text-[var(--c-text)]">เชิญผู้ใช้เข้าร้าน</h2>
            <span className="c-pill c-pill-warn">ตัวอย่าง</span>
          </div>
          <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">
            บทบาท "ผู้บริหาร" จะเห็นหน้าภาพรวมผู้บริหารอย่างเดียว ไม่มีปุ่มอนุมัติหรือส่ง
          </p>
          <ActionForm
            action={mockInviteUserAction}
            label="ดูว่าระบบจะทำอะไร"
            pendingLabel="กำลังตรวจ…"
            variant="primary"
            size="sm"
            className="mt-4 flex flex-col gap-3"
          >
            <label className={LABEL}>
              อีเมล
              <input name="email" type="email" className="c-input" placeholder="name@example.com" />
            </label>
            <label className={LABEL}>
              ร้าน
              <select name="shop" className="c-select">
                {shops.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              บทบาท
              <select name="role" className="c-select" defaultValue="staff">
                <option value="owner">เจ้าของ — ทำได้ทุกอย่าง รวมถึงลบข้อมูล</option>
                <option value="staff">ทีมงาน — อนุมัติและส่งได้</option>
                <option value="exec">ผู้บริหาร — ดูอย่างเดียว</option>
              </select>
            </label>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
