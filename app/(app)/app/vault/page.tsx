import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import { listSources } from "@/lib/engine/vault/sources";
import { listBatches } from "@/lib/engine/vault/batches";
import { SOURCE_KIND_TH } from "@/lib/shared/vault";
import { thaiDateTime } from "@/lib/shared/format";
import { PageHead, Panel, num } from "@/components/console/ui";

export const metadata = { title: "นำเข้าข้อมูล" };
export const dynamic = "force-dynamic";

/* ── Data Vault · แหล่งข้อมูล ─────────────────────────────────────

   Blueprint บท 4: ลงทะเบียนแหล่ง (วัตถุประสงค์ · เจ้าของงาน · ขอบเขต · ฟิลด์ที่จำเป็น) ก่อนอัปโหลด
   หน้านี้จึงเริ่มที่แหล่ง ไม่ใช่ที่ปุ่มอัปโหลด — อัปโหลดอยู่ในหน้าของแต่ละแหล่ง */

const TH = "font-sans normal-case tracking-normal text-[0.75rem]";

export default async function VaultPage() {
  const tenantId = await activeTenantId();
  const [sources, batches] = await Promise.all([listSources(tenantId), listBatches(tenantId)]);

  return (
    <>
      <PageHead
        label="ข้อมูล"
        title="นำเข้าข้อมูล"
        lead="นำเข้าไฟล์รายชื่อ — ระบบตรวจคนซ้ำให้ก่อนรวม"
        more="ทุกไฟล์ต้องมาจากแหล่งที่ลงทะเบียนไว้ — บอกวัตถุประสงค์ ที่มาของข้อมูล และเลือกเฉพาะฟิลด์ที่จำเป็น คอลัมน์นอกนั้นไม่ถูกเก็บ"
        actions={<>
          <Link href="/app/vault/cards" className="c-btn c-btn-ghost">เพิ่มนามบัตร</Link>
          <Link href="/app/vault/sources/new" className="c-btn c-btn-primary">ลงทะเบียนแหล่งข้อมูล</Link>
        </>}
      />

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">แหล่งที่ลงทะเบียน</h2>
        {sources.length ? (
          <div className="c-scroll mt-4">
            <table className="c-table min-w-[44rem]">
              <thead>
                <tr>
                  <th className={TH}>แหล่ง</th>
                  <th className={TH}>วัตถุประสงค์</th>
                  <th className={`${TH} text-right`}>ฟิลด์ที่เก็บ</th>
                  <th className={`${TH} text-right`}>นำเข้าแล้ว</th>
                  <th className={`${TH} text-right`}>แถวต้นทาง</th>
                  <th className={TH}>ลงทะเบียนเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/app/vault/sources/${s.id}`} className="inline-block py-1.5 text-[var(--c-text)] hover:text-[var(--c-accent)]">{s.name}</Link>
                      <span className="c-thai mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">{SOURCE_KIND_TH[s.kind]}</span>
                    </td>
                    <td className="c-thai text-[0.84rem]">{s.purposeName ?? "—"}</td>
                    <td className="c-mono text-right">{num(s.fields.length)}</td>
                    <td className="c-mono text-right">{num(s.batches)} ไฟล์</td>
                    <td className="c-mono text-right">{num(s.rows)}</td>
                    <td className="c-thai text-[0.8rem]">{thaiDateTime(s.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai mt-4 max-w-2xl text-[0.88rem] text-[var(--c-text-3)]">
            ยังไม่มีแหล่งข้อมูล — การนำเข้าข้อมูลคือการประมวลผลข้อมูลส่วนบุคคล จึงต้องบอกก่อนว่าข้อมูลชุดนี้มาจากไหน
            ใช้เพื่ออะไร และเก็บฟิลด์ไหนบ้าง แล้วจึงอัปโหลดได้
          </p>
        )}
      </Panel>

      {batches.length > 0 && (
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ไฟล์ที่นำเข้าล่าสุด</h2>
          <div className="c-scroll mt-4">
            <table className="c-table min-w-[40rem]">
              <thead>
                <tr>
                  <th className={TH}>ไฟล์</th>
                  <th className={TH}>แหล่ง</th>
                  <th className={`${TH} text-right`}>แถว</th>
                  <th className={TH}>นำเข้าเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/app/vault/batches/${b.id}`} className="inline-block py-1.5 text-[var(--c-text)] hover:text-[var(--c-accent)]">{b.filename}</Link>
                    </td>
                    <td className="c-thai text-[0.84rem]">{b.sourceName ?? "—"}</td>
                    <td className="c-mono text-right">{num(b.rowsTotal)}</td>
                    <td className="c-thai text-[0.8rem]">{thaiDateTime(b.uploadedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
