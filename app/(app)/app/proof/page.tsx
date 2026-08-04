import { activeTenantId } from "@/app/(app)/tenant";
import { all } from "@/lib/engine/sql";
import Link from "next/link";
import { playById } from "@/lib/shared/plays";
import { roiSummary } from "@/lib/engine/proof";

import { profileFor } from "@/lib/shared/tenants";
import type { Verdict } from "@/lib/shared/types";
import {
  Empty,
  Metric,
  PageHead,
  Panel,
  VerdictPill,
  baht,
  num,
  pct,
} from "@/components/console/ui";
import { ciLabel } from "@/lib/shared/format";
import { PLANS } from "@/lib/shared/plans";
import { measureAllAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";
import { proofBlockedReason } from "@/lib/engine/billing";

export const dynamic = "force-dynamic";

export default async function ProofPage() {
  const demoTools = demoToolsEnabled();
  const tenantId = await activeTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const [proofBlocked, roi, rows] = await Promise.all([
    proofBlockedReason(tenantId),
    roiSummary(tenantId),
    all<{
    id: string;
    play_id: string;
    treated_size: number;
    holdout_size: number;
    approved_at: string;
    horizon_days: number;
    rph_treated: number;
    rph_holdout: number;
    lift_abs: number;
    lift_pct: number;
    ci_low: number;
    ci_high: number;
    verdict: Verdict;
    matured: number;
  }>(`SELECT c.id, c.play_id, c.treated_size, c.holdout_size, c.approved_at,
              a.horizon_days, a.rph_treated, a.rph_holdout, a.lift_abs, a.lift_pct,
              a.ci_low, a.ci_high, a.verdict, a.matured
       FROM attributions a
       JOIN campaigns c ON c.id = a.campaign_id
       WHERE c.tenant_id = ? AND c.dry_run = 0
       ORDER BY c.approved_at DESC, a.horizon_days`, tenantId),
  ]);

  const total = Object.values(roi.verdictMix).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead
        label="ผลที่วัดได้"
        title="สิ่งที่ส่งไปได้ผลจริงไหม"
        lead="ทุกแคมเปญกันคนกลุ่มหนึ่งไว้ไม่ส่ง แล้วเทียบสองกลุ่ม ส่วนต่างคือสิ่งที่ข้อความทำให้เกิดขึ้นจริง ไม่ใช่รายได้ที่จะเข้ามาอยู่แล้ว และถ้าไม่ได้ผล หน้านี้จะบอกตรง ๆ"
        actions={
          <ActionForm
            action={measureAllAction}
            fields={{ tenantId }}
            label="วัดผลที่ถึงกำหนด"
            pendingLabel="กำลังวัด…"
          />
        }
      />

      {/* ── แผนที่ไม่รวม Proof เห็นเหตุผล ไม่ใช่เห็นตัวเลข ──
          เดิมหน้านี้คำนวณให้ทุกแผนเท่ากันหมด ทั้งที่ตารางราคาเขียนว่า
          Pilot ไม่ได้ — ประกาศอย่างหนึ่ง ส่งมอบอีกอย่างหนึ่ง

          ที่แสดงแทนคือสิ่งที่จะได้เมื่ออัปเกรด ไม่ใช่กำแพงเปล่า ๆ */}
      {proofBlocked ? (
        <Panel flat className="border-l-2 border-[var(--c-warn)] p-6 md:p-7">
          <p className="c-label text-[var(--c-warn)]">not on this plan</p>
          <h2 className="c-h2 mt-3 text-[var(--c-text)]">
            Measured proof unlocks on {PLANS.growth.name}
          </h2>
          <p className="c-thai mt-3 max-w-2xl text-[0.88rem] leading-relaxed text-[var(--c-text-2)]">
            {proofBlocked}
          </p>
          <p className="c-thai mt-4 max-w-2xl text-[0.84rem] leading-relaxed text-[var(--c-text-3)]">
            สิ่งที่จะได้: ทุกแคมเปญกันคนกลุ่มหนึ่งไว้ไม่ส่ง แล้วเทียบสองกลุ่ม ตัวเลขที่อ่านจึงเป็นสิ่งที่
            ข้อความทำให้เกิดขึ้นจริง ไม่ใช่รายได้ที่จะเข้ามาอยู่แล้ว และเมื่อส่วนต่างแยกจากความผันผวน
            ไม่ออก หน้านี้จะบอกตรง ๆ แทนที่จะปัดขึ้น
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/app/billing" className="c-btn c-btn-primary">
              ดูแผน
            </Link>
            <Link href="/app" className="c-btn c-btn-ghost">
              กลับไปบรีฟ
            </Link>
          </div>
        </Panel>
      ) : (
      <>
      {/* ── หน้านี้คือหน้าที่คนจะแคปไปแชร์ ──

          ตัวเลขบนนี้เป็นบาทกับเปอร์เซ็นต์ที่อ่านเหมือนผลจริงของธุรกิจจริง
          แถบบอกว่าเป็นเดโมอยู่บนสุดของคอลัมน์ก็จริง แต่ภาพที่ครอปเฉพาะ
          ตัวเลขจะไม่มีมันติดไปด้วย — คำกำกับต้องอยู่ติดกับตัวเลขเอง

          ขึ้นเฉพาะบนคอนโซลสาธารณะ ตอนพัฒนาไม่ต้องมี */}
      {!demoTools && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-warn)] p-5">
          <p className="c-label text-[var(--c-warn)]">synthetic dataset</p>
          <p className="c-thai mt-2.5 max-w-3xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
            ตัวเลขทุกตัวข้างล่างคำนวณจริงโดยเครื่องยนต์ — ทั้งกลุ่มที่กันไว้ ส่วนต่าง และช่วงความเชื่อมั่น —
            แต่คำนวณจากชุดข้อมูลที่สร้างขึ้น ไม่ใช่ลูกค้าจริง ยังไม่มีธุรกิจไหนถูกวัดด้วยระบบนี้
            และเราจะไม่อ้างส่วนต่างจนกว่าจะมี
          </p>
        </Panel>
      )}

      {profile.measurementCaveat && (
        <Panel flat className="mb-6 p-5">
          <p className="c-label text-[var(--c-warn)]">how to read this account</p>
          <p className="c-thai mt-2.5 max-w-3xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
            {profile.measurementCaveat}
          </p>
        </Panel>
      )}

      <Panel className="mb-6 p-5 md:p-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          <Metric
            label={`ต้นทุนต่อ${v.th.person}ที่กลับมา`}
            value={
              roi.costPerRepeatCustomer != null
                ? baht(roi.costPerRepeatCustomer)
                : "ยังไม่พอสรุป"
            }
            sub="ยอดใช้จ่ายทั้งหมด ÷ คนที่กลับมาเพราะข้อความ"
            tone={roi.costPerRepeatCustomer != null ? "accent" : "muted"}
            size="lg"
          />
          <Metric
            label="รายได้ส่วนเพิ่ม 90 วันล่าสุด"
            value={roi.liftBaht > 0 ? baht(roi.liftBaht) : "—"}
            sub="รวมทุกแคมเปญที่วัดผลแล้ว"
            tone={roi.liftBaht > 0 ? "good" : "muted"}
          />
          <Metric
            label="ยอดใช้จ่าย"
            value={baht(roi.spendBaht)}
            sub="ค่าข้อความที่ส่งจริง บวกส่วนลดที่ให้ไป"
          />
          <Metric
            label="ต้นทุนต่อรายได้ส่วนเพิ่มหนึ่งบาท"
            value={
              roi.costPerIncrementalBaht != null
                ? `฿${roi.costPerIncrementalBaht}`
                : "ยังไม่พอสรุป"
            }
            sub={
              roi.costPerIncrementalBaht != null
                ? `฿1 spent returns about ${baht(1 / roi.costPerIncrementalBaht)}`
                : "ต้นทุนของรายได้ส่วนเพิ่มหนึ่งบาท"
            }
            tone={roi.costPerIncrementalBaht != null ? "plain" : "muted"}
          />
        </div>

        <hr className="c-hair my-6" />

        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="c-label">ส่วนต่างเฉลี่ย พร้อมช่วงความเชื่อมั่น</p>
            <p className="c-thai mt-1.5 text-[0.74rem] text-[var(--c-text-4)]">
              เฉลี่ยจากทุกแคมเปญที่วัดผลแล้ว รวมตัวที่ยังสรุปไม่ได้ด้วย — ถ้าเฉลี่ยเฉพาะตัวที่มีนัยสำคัญ
              ตัวเลขจะสูงเกินจริงเสมอ
            </p>
            {roi.avgLiftPct != null ? (
              <>
                <p className="c-num mt-3 text-[2.2rem] text-[var(--c-good)]">
                  {roi.avgLiftPct > 0 ? "+" : ""}
                  {pct(roi.avgLiftPct)}
                </p>
                <p className="c-mono mt-2 text-[0.78rem] text-[var(--c-text-3)]">
                  95% CI · {roi.ciLow!.toFixed(1)}% to{" "}
                  {roi.ciHigh!.toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="c-thai mt-3 text-[0.85rem] text-[var(--c-warn)]">
                Not enough yet — needs a campaign at 90 days with a large enough holdout
              </p>
            )}
            {Object.keys(roi.horizonMix).length > 0 && (
              <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">
                From{" "}
                {Object.entries(roi.horizonMix)
                  .map(([h, n]) => `${num(n)} at T+${h}`)
                  .join(" · ")}{" "}
                — each campaign is read at the most mature horizon it can support, so a
              usable T+30 result is not discarded just for being short of 90 days.
              </p>
            )}
          </div>

          <div>
            <p className="c-label">สัดส่วนข้อสรุป</p>
            {total ? (
              <div className="mt-4 flex flex-col gap-3">
                {(
                  [
                    ["positive", "ได้ผล", "var(--c-good)"],
                    ["no_effect", "ไม่ต่างจากไม่ส่ง", "var(--c-bad)"],
                    ["insufficient_data", "ยังไม่พอสรุป", "var(--c-warn)"],
                  ] as const
                ).map(([k, label, color]) => {
                  const n = roi.verdictMix[k];
                  return (
                    <div key={k}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="c-thai text-[0.82rem] text-[var(--c-text-2)]">
                          {label}
                        </span>
                        <span className="c-mono text-[0.82rem] text-[var(--c-text-3)]">
                          {num(n)}
                        </span>
                      </div>
                      <div className="c-meter mt-1.5">
                        <span
                          style={{
                            width: `${(n / total) * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="c-thai mt-3 text-[0.85rem] text-[var(--c-text-3)]">
                No measured campaigns yet
              </p>
            )}
          </div>
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Empty>
          ยังไม่มีผล — อนุมัติแคมเปญจากบรีฟเช้านี้ แล้วกดวัดผลที่ถึงกำหนด
        </Empty>
      ) : (
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ทุกแคมเปญที่วัดผลแล้ว</h2>
          <p className="c-thai mt-2 max-w-3xl text-[0.82rem] text-[var(--c-text-3)]">
            ตัวเลขต่อคนคือ "อัตราการกลับมา × ยอดกลางของคนที่ซื้อ" ไม่ใช่รายได้ดิบต่อหัว ข้อสรุปตัดสิน
            จากอัตราการกลับมา เพราะรายได้ดิบผันผวนเกินกว่าจะสรุปได้ที่กลุ่มไม่กี่พันคน
          </p>
          <p className="c-thai mt-1.5 max-w-3xl text-[0.82rem] text-[var(--c-warn)]">
            กลุ่ม 300–1,000 คนใช้โหมดรวมผล 90 วัน แถวเหล่านั้นจึงแสดงตัวเลขเดียวกัน เพราะสรุปจาก
            กลุ่มควบคุมที่รวมกัน ไม่ใช่จากแคมเปญนั้นเดี่ยว ๆ
          </p>
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[62rem]">
              <thead>
                <tr>
                  <th>play</th>
                  <th>ช่วงเวลา</th>
                  <th>ส่ง / กันไว้</th>
                  <th>ต่อคน · กลุ่มที่ส่ง</th>
                  <th>ต่อคน · กลุ่มที่กันไว้</th>
                  <th>ส่วนต่าง</th>
                  <th>95% CI</th>
                  <th>ข้อสรุป</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.id}-${r.horizon_days}`}>
                    <td>
                      <span className="text-[var(--c-text)]">
                        {playById(r.play_id)?.name ?? r.play_id}
                      </span>
                    </td>
                    <td className="c-mono">T+{r.horizon_days}</td>
                    <td className="c-mono whitespace-nowrap">
                      {num(r.treated_size)} / {num(r.holdout_size)}
                    </td>
                    <td className="c-mono">{baht(r.rph_treated)}</td>
                    <td className="c-mono">{baht(r.rph_holdout)}</td>
                    {/* แสดงค่าประเมินเมื่อ "วัดได้แล้ว" แม้ยังสรุปไม่ได้
                        เพราะค่านั้นเข้าไปอยู่ในค่าเฉลี่ยด้านบนจริง ถ้าซ่อนไว้
                        ผู้ใช้จะกระทบยอดกับตัวเลขเรือธงไม่ได้

                        ที่ต้องซ่อนคือแถวที่ยังไม่ถึงกำหนดวัด ซึ่งไม่มีค่าประเมิน
                        อยู่เลย ตัวเลขในนั้นเป็นเพียงค่าจำลอง ไม่ใช่ผลจากข้อมูล */}
                    {r.matured !== 1 ? (
                      <>
                        <td className="c-mono text-[var(--c-text-4)]">—</td>
                        <td className="c-mono text-[var(--c-text-4)]">—</td>
                      </>
                    ) : (
                      <>
                        <td className="c-mono whitespace-nowrap">
                          <span
                            className={
                              r.lift_abs > 0
                                ? "text-[var(--c-good)]"
                                : "text-[var(--c-bad)]"
                            }
                          >
                            {r.lift_abs > 0 ? "+" : ""}
                            {pct(r.lift_pct)}
                          </span>
                        </td>
                        <td className="c-mono whitespace-nowrap text-[var(--c-text-3)]">
                          {ciLabel(r.ci_low, r.ci_high)}
                        </td>
                      </>
                    )}
                    <td>
                      <VerdictPill verdict={r.verdict} />
                    </td>
                    <td>
                      <Link
                        href={`/app/campaigns/${r.id}`}
                        className="c-btn c-btn-ghost c-btn-sm"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      </>
      )}
    </>
  );
}
