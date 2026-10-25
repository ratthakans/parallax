import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import { vaultOverview } from "@/lib/engine/vault";
import { profileFor } from "@/lib/shared/tenants";
import { CONTACT_KIND_LABEL, CONTACT_KIND_ORDER } from "@/lib/shared/contact-kinds";
import { daysAgoLabel, thaiDateTime } from "@/lib/shared/format";
import { Metric, PageHead, Panel, num, pct } from "@/components/console/ui";

export const metadata = { title: "ภาพรวมข้อมูล" };
export const dynamic = "force-dynamic";

/* ── ภาพรวม Data Vault ──────────────────────────────────────────

   แทนบรีฟเช้าของยุคค้าปลีก (docs/plan.md B0) — หน้านี้ตอบแค่ว่า "ในฐานมีอะไรที่นับได้จริง"
   ตาม Blueprint 2.0 บท 4: แยกตัวเลขจริงออกจากประมาณการ และไม่เติมคะแนนให้หน้าดูครบ
   ตัวชี้วัดที่ต้องใช้ตารางของระยะ B (ซ้ำที่รอตรวจ · คนและบริษัทที่ยืนยันแล้ว · ข้อมูลเก่า)
   จะเพิ่มเมื่อตารางนั้นมี */

export default async function OverviewPage() {
  const tenantId = await activeTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab.th;
  const o = await vaultOverview(tenantId);
  const share = (n: number) => (o.people > 0 ? pct((n / o.people) * 100, 0) : "—");
  const kinds = CONTACT_KIND_ORDER.filter((k) => (o.byKind[k] ?? 0) > 0);

  return (
    <>
      <PageHead
        label="ข้อมูล"
        title={`ภาพรวม${v.base}`}
        lead="นับจากข้อมูลจริงในระบบ ไม่มีประมาณการหรือคะแนนที่ระบบคิดขึ้น"
        actions={
          <>
            <Link href="/app/vault" className="c-btn c-btn-primary">แหล่งข้อมูลและนำเข้า</Link>
            <Link href="/app/customers" className="c-btn c-btn-ghost">ดู{v.people}ทั้งหมด</Link>
          </>
        }
      />

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label={`${v.people}ในฐาน`} value={num(o.people)} sub="นับทุกสถานะ — ที่คนตรวจยืนยันแล้วอยู่แถวล่าง" />
        <Metric label="มีช่องทางติดต่ออย่างน้อยหนึ่งช่อง" value={num(o.withContact)} sub={share(o.withContact)} />
        <Metric
          label="ยินยอมรับข่าวสาร (ตามข้อมูลเดิม)"
          value={num(o.consentGranted)}
          sub={`${share(o.consentGranted)} · ยังไม่แยกตามวัตถุประสงค์`}
          tone={o.consentGranted > 0 ? "plain" : "muted"}
        />
        <Metric
          label="นำเข้าแล้ว"
          value={o.imports > 0 ? `${num(o.imports)} ครั้ง` : "ยังไม่เคย"}
          sub={o.lastImportAt ? `ล่าสุด ${daysAgoLabel(o.lastImportAt)} · ${thaiDateTime(o.lastImportAt)}` : undefined}
          tone={o.imports > 0 ? "plain" : "muted"}
        />
      </Panel>

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="แหล่งข้อมูลที่ลงทะเบียน" value={num(o.sources)} tone={o.sources ? "plain" : "muted"} />
        <Metric label="แถวต้นทางที่รับเข้า" value={num(o.sourceRows)} sub="จากไฟล์ที่นำเข้าผ่าน Data Vault" />
        <Metric label="รอตรวจตัวตน" value={num(o.pendingReview)} sub="ยังไม่รวมเป็นคนหรือบริษัท" tone={o.pendingReview ? "plain" : "muted"} />
        <Metric label="ถูกปฏิเสธ" value={num(o.rejected)} sub="ชี้ไปหาใครไม่ได้ · แถวว่าง" tone="muted" />
      </Panel>

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="องค์กร" value={num(o.orgs)} sub="นิติบุคคลละหนึ่งแถว · ในเครือไม่ถูกรวม" tone={o.orgs ? "plain" : "muted"} />
        <Metric label={`${v.people}ที่คนตรวจยืนยันแล้ว`} value={num(o.confirmedPeople)} sub={share(o.confirmedPeople)} tone={o.confirmedPeople ? "plain" : "muted"} />
        <Metric
          label="รอคนตัดสิน (ตรวจข้อมูลซ้ำ)"
          value={num(o.openPairs + o.openOrgGroups)}
          sub={`${num(o.openPairs)} คู่คน · ${num(o.openOrgGroups)} กลุ่มองค์กร`}
          tone={o.openPairs + o.openOrgGroups ? "plain" : "muted"}
        />
        <Metric label="รู้แหล่งที่มา" value={num(o.peopleWithSource)} sub={share(o.peopleWithSource)} tone={o.peopleWithSource ? "plain" : "muted"} />
      </Panel>

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ช่องทางติดต่อที่มี</h2>
        {kinds.length ? (
          <table className="c-table mt-4 max-w-xl">
            <thead>
              <tr>
                <th>ช่องทาง</th>
                <th className="text-right">{v.people}</th>
                <th className="text-right">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k}>
                  <td className="c-thai">{CONTACT_KIND_LABEL[k]}</td>
                  <td className="c-mono text-right">{num(o.byKind[k])}</td>
                  <td className="c-mono text-right">{share(o.byKind[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="c-thai mt-4 text-[0.86rem] text-[var(--c-text-3)]">
            ยังไม่มีช่องทางติดต่อในฐาน — นำเข้าไฟล์ที่มีอีเมลหรือเบอร์โทรเพื่อเริ่ม
          </p>
        )}
        <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">
          การมีช่องทางไม่ได้แปลว่าติดต่อได้ — ต้องตรวจเงื่อนไขการใช้ข้อมูลตามวัตถุประสงค์ก่อนทุกครั้ง
        </p>
      </Panel>
    </>
  );
}
