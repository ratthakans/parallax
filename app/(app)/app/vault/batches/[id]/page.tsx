import Link from "next/link";
import { notFound } from "next/navigation";
import { activeTenantId } from "@/app/(app)/tenant";
import { getBatchReport } from "@/lib/engine/vault/batches";
import { IMPORT_ROW_TH, type ImportRowStatus } from "@/lib/shared/vault";
import { thaiDateTime } from "@/lib/shared/format";
import { Metric, Panel, num } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── รายงานตรวจยอดของไฟล์หนึ่งไฟล์ (Blueprint บท 4 ขั้น 5) ────────────
   แสดงบรรทัด สถานะ และเหตุผล — ไม่แสดงค่าในแถว */

const ORDER: ImportRowStatus[] = ["pending_review", "rejected", "suspended", "accepted"];

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await activeTenantId();
  const r = await getBatchReport(tenantId, id);
  if (!r) notFound();

  return (
    <>
      <Link href={`/app/vault/sources/${r.sourceId}`} className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← {r.sourceName ?? "แหล่งข้อมูล"}
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="c-h1 break-all text-[var(--c-text)]">{r.filename}</h1>
        <p className="c-thai mt-2 text-[0.88rem] text-[var(--c-text-3)]">
          นำเข้าโดย {r.uploadedBy} · {thaiDateTime(r.uploadedAt)} · {num(Math.round(r.bytes / 1024))} KB
        </p>
      </header>

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        {ORDER.map((s) => (
          <Metric key={s} label={IMPORT_ROW_TH[s]} value={num(r.counts[s])} tone={r.counts[s] ? "plain" : "muted"} />
        ))}
      </Panel>

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ตรวจยอด</h2>
        <p className={`c-thai mt-3 text-[0.9rem] ${r.balanced ? "text-[var(--c-good)]" : "text-[var(--c-bad)]"}`}>
          {r.balanced
            ? `ครบ — แถวในไฟล์ ${num(r.rowsTotal)} = บันทึกแล้วทุกสถานะ ${num(r.recorded)}`
            : `ไม่ครบ — แถวในไฟล์ ${num(r.rowsTotal)} แต่บันทึกได้ ${num(r.recorded)} แถว`}
        </p>
        <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-4)]">
          แถวที่รอตรวจยังไม่ถูกรวมเป็นคนหรือบริษัท และยังไม่ถูกใช้ติดต่อ — จะผ่านขั้นตรวจตัวตนก่อน
        </p>
      </Panel>

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">เหตุผลรายแถว</h2>
        {r.reasons.length ? (
          <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางเหตุผลรายแถว">
          <table className="c-table min-w-[36rem]">
            <thead>
              <tr>
                <th className="font-sans normal-case tracking-normal text-[0.75rem]">สถานะ</th>
                <th className="font-sans normal-case tracking-normal text-[0.75rem]">เหตุผล</th>
                <th className="font-sans normal-case tracking-normal text-[0.75rem] text-right">แถว</th>
                <th className="font-sans normal-case tracking-normal text-[0.75rem]">บรรทัดในไฟล์ (ตัวอย่าง)</th>
              </tr>
            </thead>
            <tbody>
              {r.reasons.map((g) => (
                <tr key={`${g.status}|${g.reason}`}>
                  <td className="c-thai text-[0.84rem]">{IMPORT_ROW_TH[g.status]}</td>
                  <td className="c-thai text-[0.84rem]">{g.reason}</td>
                  <td className="c-mono text-right">{num(g.n)}</td>
                  <td className="c-mono text-[0.8rem] text-[var(--c-text-3)]">{g.lines.join(", ")}{g.n > g.lines.length ? " …" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="c-thai mt-4 text-[0.86rem] text-[var(--c-text-3)]">ไม่มีแถวที่มีหมายเหตุ</p>
        )}
      </Panel>
    </>
  );
}
