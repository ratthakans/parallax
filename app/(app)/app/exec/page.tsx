import { myTenants } from "@/app/(app)/tenant";
import { execOverview } from "@/lib/engine/exec";
import { daysAgoLabel } from "@/lib/shared/format";
import { Metric, PageHead, Panel, baht, num, pct } from "@/components/console/ui";
import { RevenueBars } from "@/components/console/revenue-bars";
import { switchTenantAction } from "../../actions";

export const dynamic = "force-dynamic";

/* ── ภาพรวมผู้บริหาร ─────────────────────────────────────────────

   สำหรับคนที่ไม่ได้ใช้คอนโซลทุกเช้า แต่ต้องตอบได้ว่า "ระบบนี้ทำงานไหม คุ้มไหม
   และร้านไหนต้องดู" — อ่านอย่างเดียว ไม่มีปุ่มอนุมัติหรือส่ง
   เห็นทุกร้านที่บัญชีนี้เข้าถึงได้ (myTenants) ไม่ใช่เฉพาะร้านที่เปิดอยู่ */

function change(now: number, before: number): { text: string; tone: "good" | "bad" | "muted" } {
  if (before <= 0) return { text: now > 0 ? "ไม่มีข้อมูลช่วงก่อนให้เทียบ" : "—", tone: "muted" };
  const d = ((now - before) / before) * 100;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(0)}% จาก 90 วันก่อนหน้า`, tone: d >= 0 ? "good" : "bad" };
}

export default async function ExecPage() {
  const ids = await myTenants();
  const { shops, totals, monthly } = await execOverview(ids);
  const delta = change(totals.revenue90, totals.revenuePrev90);
  const attention = shops.flatMap((s) => s.attention.map((a) => ({ shop: s.name, text: a })));

  return (
    <>
      <PageHead
        label="ภาพรวมผู้บริหาร"
        title={shops.length > 1 ? `ทุกร้านในมุมเดียว · ${num(shops.length)} ร้าน` : `ภาพรวม ${shops[0]?.name ?? ""}`}
        lead="อ่านอย่างเดียว — ตัวเลขจริงจากข้อมูลของแต่ละร้าน อัปเดตทุกครั้งที่ทีมนำเข้าไฟล์หรือวัดผล"
      />

      <p className="c-thai mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--c-line)] px-3 py-1 text-[0.78rem] text-[var(--c-text-3)]">
        <span className="c-pill c-pill-warn">ตัวอย่าง</span>
        สิทธิ์แบบผู้บริหาร (ดูอย่างเดียว) ยังไม่แยกในระบบ — ตอนนี้ทุกคนที่เข้าคอนโซลเห็นหน้านี้
      </p>

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="ยอดซื้อ 90 วันล่าสุด" value={baht(totals.revenue90)} sub={delta.text} />
        <Metric label="ลูกค้าทั้งหมด" value={num(totals.customers)} />
        <Metric
          label="เลยรอบซื้อปกติแล้ว"
          value={num(totals.lapsing)}
          sub="คนที่ควรทักก่อนจะหายไป"
          tone={totals.lapsing > 0 ? "bad" : "muted"}
        />
        <Metric
          label="ยอดเพิ่มที่วัดได้จริง"
          value={totals.measuredLift > 0 ? baht(totals.measuredLift) : "ยังวัดไม่ได้"}
          sub={totals.measuredLift > 0 ? "เทียบกับกลุ่มที่ไม่ได้รับข้อความ" : `${num(totals.campaignsMeasuring)} แคมเปญกำลังวัดผล`}
          tone={totals.measuredLift > 0 ? "good" : "muted"}
        />
      </Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel className="p-5 md:p-6">
          <RevenueBars data={monthly} title="ยอดซื้อรายเดือน · 12 เดือนล่าสุด" />
        </Panel>

        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">เรื่องที่ควรดู</h2>
          {attention.length ? (
            <ul className="mt-4 flex flex-col gap-3">
              {attention.slice(0, 8).map((a, i) => (
                <li key={i} className="c-thai border-l-2 border-[var(--c-warn)] pl-3 text-[0.86rem] text-[var(--c-text-2)]">
                  {shops.length > 1 && <span className="block text-[0.75rem] text-[var(--c-text-4)]">{a.shop}</span>}
                  {a.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="c-thai mt-4 text-[0.86rem] text-[var(--c-good)]">ไม่มีเรื่องที่ต้องดูตอนนี้ — ทุกร้านทำงานตามปกติ</p>
          )}
        </Panel>
      </div>

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">รายร้าน</h2>
        <div className="c-scroll mt-4">
          <table className="c-table min-w-[60rem]">
            <thead>
              <tr>
                <th>ร้าน</th>
                <th className="text-right">ลูกค้า</th>
                <th className="text-right">ยอดซื้อ 90 วัน</th>
                <th>เทียบช่วงก่อน</th>
                <th className="text-right">เลยรอบ</th>
                <th className="text-right">ยินยอม</th>
                <th className="text-right">ยอดเพิ่มที่วัดได้</th>
                <th>ทีมเปิดบรีฟ</th>
                <th>ใช้งานล่าสุด</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => {
                const d = change(s.revenue90, s.revenuePrev90);
                return (
                  <tr key={s.tenantId}>
                    <td>
                      <span className="text-[var(--c-text)]">{s.name}</span>
                      <span className="c-thai mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">
                        {s.industry} · แผน {s.plan}
                      </span>
                    </td>
                    <td className="c-mono text-right">{num(s.customers)}</td>
                    <td className="c-mono text-right">{baht(s.revenue90)}</td>
                    <td
                      className={`c-thai text-[0.8rem] ${d.tone === "good" ? "text-[var(--c-good)]" : d.tone === "bad" ? "text-[var(--c-bad)]" : "text-[var(--c-text-4)]"}`}
                    >
                      {d.text.replace(" จาก 90 วันก่อนหน้า", "")}
                    </td>
                    <td className="c-mono text-right">{num(s.lapsing)}</td>
                    <td className="c-mono text-right">{pct(s.consentShare * 100, 0)}</td>
                    <td className="c-mono text-right">{s.measuredLift > 0 ? baht(s.measuredLift) : "—"}</td>
                    <td className="c-thai text-[0.8rem]">{num(s.briefOpens28)} / 28 วัน</td>
                    <td className="c-thai text-[0.8rem]">{daysAgoLabel(s.lastActivityAt)}</td>
                    <td>
                      {/* สลับไปร้านนั้นแล้วพาไปบรีฟของร้าน — แค่เปลี่ยนร้านที่ดูอยู่ ไม่แก้ข้อมูลใด */}
                      <form action={switchTenantAction}>
                        <input type="hidden" name="tenantId" value={s.tenantId} />
                        <button type="submit" className="c-btn c-btn-ghost c-btn-sm">เปิดร้านนี้</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">
          "ยอดเพิ่มที่วัดได้" นับเฉพาะแคมเปญที่ครบกำหนดและเทียบกับกลุ่มควบคุมแล้ว ·
          "ทีมเปิดบรีฟ" คือจำนวนวันใน 28 วันล่าสุดที่มีคนเปิดหน้าบรีฟเช้า
        </p>
      </Panel>
    </>
  );
}
