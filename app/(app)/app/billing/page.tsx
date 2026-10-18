import { activeTenantId, retailOnly } from "@/app/(app)/tenant";
import Link from "next/link";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";
import { hasSyntheticData } from "@/lib/engine/synthetic";

import { profileFor } from "@/lib/shared/tenants";
import {
  recentCampaignCosts,
  planForBaseSize,
  usageFor,
} from "@/lib/engine/billing";
import {
  CAP_ROWS,
  CREDIT_PACKS,
  MESSAGE_COST_BAHT,
  PLANS,
  PLAN_ORDER,
  annualBaht,
  annualDiscountPct,
  capLabel,
  perMessage,
} from "@/lib/shared/plans";
import { roiSummary } from "@/lib/engine/proof";
import { playById } from "@/lib/shared/plays";
import { Empty, Metric, PageHead, Panel, baht, num } from "@/components/console/ui";
import { thaiDate } from "@/lib/shared/format";
import { buyCreditsAction, changePlanAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";

export const metadata = { title: "แพ็กเกจและการชำระเงิน" };
export const dynamic = "force-dynamic";

/* หัวตารางภาษาไทยไม่ใช้ mono ตัวพิมพ์ใหญ่ของ .c-table th (ดู console.css) */
const TH = "font-sans normal-case tracking-normal text-[0.75rem]";

const date = (iso: string) => thaiDate(iso);

/* แถบวัดที่ต้องอ่านออกว่า "ใกล้เต็มหรือยัง" ไม่ใช่แค่ดูสวย
   จึงเปลี่ยนสีที่ 80% — จุดที่ยังมีเวลาทำอะไรได้ ไม่ใช่ที่ 100% */
function Bar({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  const colour =
    p >= 100
      ? "var(--c-bad)"
      : p >= 80
        ? "var(--c-warn)"
        : "var(--c-accent)";
  return (
    <div className="c-meter mt-3" role="img" aria-label={`ใช้ไป ${Math.round(p)}%`}>
      <span style={{ width: `${p}%`, background: colour }} />
    </div>
  );
}

export default async function BillingPage() {
  const tenantId = await retailOnly();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const [u, costs, roi] = await Promise.all([
    usageFor(tenantId),
    recentCampaignCosts(tenantId),
    roiSummary(tenantId),
  ]);
  const plan = u.plan;
  const tools = demoToolsEnabled();
  const synthetic = await hasSyntheticData(tenantId);

  const suggested = planForBaseSize(u.identified);
  const packRate = u.messagesThisPeriod > 0 ? u.creditSpendThisPeriod : 0;

  /* คำถามเดียวที่ตอบยากที่สุดในหน้านี้: คุ้มไหม
     ตัวเลขซ้ายคือค่าใช้จ่ายที่จ่ายจริง ตัวเลขขวาคือยอดเพิ่มที่ "วัดได้"
     ไม่ใช่ที่ประมาณ — ถ้ายังวัดไม่ได้ต้องเขียนว่ายังวัดไม่ได้ */
  const measuredLift = roi.liftBaht;
  const yearlyFee = (plan.monthlyBaht ?? 0) * 12;

  return (
    <>
      <PageHead
        label="ค่าใช้จ่าย"
        title={`แผน ${plan.name} — จ่ายไปเท่าไร ได้อะไรกลับมา`}
        lead={`ค่าบริการคิดตามจำนวน${v.th.people}ที่ระบุตัวได้ ค่าส่งข้อความเป็นเครดิตจ่ายล่วงหน้า ไม่ซ่อนอยู่ในค่าบริการ`}
      />

      {u.overCap && (
        <div className="c-panel-flat mb-6 border-l-2 border-[var(--c-bad)] p-5">
          <p className="c-label text-[var(--c-bad)]">เกินเพดานของแผน</p>
          <p className="c-thai mt-2 max-w-3xl text-[0.87rem] leading-relaxed text-[var(--c-text-2)]">
            ฐานมี{v.th.people}ที่ระบุตัวได้ {num(u.identified)} คน เกินเพดาน{" "}
            {num(plan.contactCap ?? 0)} คนของแผน {plan.name} — การนำเข้าครั้งถัดไปจะถูกปฏิเสธจนกว่าจะเปลี่ยนแผน
          </p>
        </div>
      )}

      {/* ── รอบบิลนี้ ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="c-h2 text-[var(--c-text)]">รอบบิลนี้</h2>
            <p className="c-mono mt-1.5 text-[0.78rem] text-[var(--c-text-3)]">
              {date(u.period.start.toISOString())} –{" "}
              {date(new Date(u.period.end.getTime() - 1).toISOString())} · {" "}
              เหลือ {u.period.daysLeft} วัน
            </p>
          </div>
          <span className="c-pill c-pill-keep">ตัดรอบทุกวันที่ {u.billingDay}</span>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="ค่าบริการรายเดือน"
            value={plan.monthlyBaht == null ? "ตามตกลง" : baht(plan.monthlyBaht)}
            sub={`${plan.name} · ต่อเดือน`}
          />
          <Metric
            label="เครดิตที่ซื้อรอบนี้"
            value={baht(u.creditSpendThisPeriod)}
            sub={
              u.purchasesThisPeriod.length
                ? `ซื้อ ${u.purchasesThisPeriod.length} ครั้ง`
                : "ยังไม่ได้ซื้อ"
            }
            tone={packRate > 0 ? "plain" : "muted"}
          />
          <Metric
            label="รวมรอบนี้"
            value={baht(u.invoiceThisPeriod)}
            tone="accent"
            sub="ค่าบริการ + เครดิต"
          />
          <Metric
            label="ค่าส่งที่เกิดขึ้นจริง"
            value={baht(u.messageCostThisPeriod)}
            sub={`${num(u.messagesThisPeriod)} ข้อความ × ฿${MESSAGE_COST_BAHT}`}
            tone="muted"
          />
        </div>
      </Panel>

      {/* ── สองเพดานที่คิดเงิน ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="c-h2 text-[var(--c-text)]">{v.th.people}ที่ระบุตัวได้</h2>
            <span className="c-mono text-[0.8rem] text-[var(--c-text-3)]">
              {num(u.identified)}
              {u.contactCap != null && ` / ${num(u.contactCap)}`}
            </span>
          </div>
          <Bar pct={u.contactPct ?? 0} />
          <p className="c-thai mt-4 text-[0.8rem] leading-relaxed text-[var(--c-text-3)]">
            {u.contactCap == null
              ? `แผน ${plan.name} ไม่มีเพดานตัวเลข — ตามสัญญา`
              : u.contactPct != null && u.contactPct >= 80
                ? `ใช้ไป ${Math.round(u.contactPct)}% ของเพดาน — เพิ่มได้อีก ${num(u.contactCap - u.identified)} คน`
                : `เพิ่มได้อีก ${num(Math.max(0, u.contactCap - u.identified))} คนก่อนถึงเพดาน`}
          </p>
          <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">
            นับคนที่มีตัวระบุอย่างน้อยหนึ่งอย่าง เพื่อให้จับคู่หรือติดต่อได้
            ไม่ใช่นับจำนวนแถวในไฟล์ที่นำเข้า
          </p>
        </Panel>

        <Panel className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="c-h2 text-[var(--c-text)]">เครดิตข้อความ</h2>
            <span className="c-mono text-[0.8rem] text-[var(--c-text-3)]">
              คงเหลือ {num(u.creditsLeft)}
            </span>
          </div>
          <Bar
            pct={
              u.creditsLeft + u.messagesThisPeriod > 0
                ? (u.messagesThisPeriod / (u.creditsLeft + u.messagesThisPeriod)) * 100
                : 0
            }
          />
          <p className="c-thai mt-4 text-[0.8rem] leading-relaxed text-[var(--c-text-3)]">
            รอบนี้ส่งไป {num(u.messagesThisPeriod)} ข้อความ
            {u.creditRunwayDays != null &&
              ` — ถ้าส่งในอัตรานี้ เครดิตจะพอใช้อีกราว ${num(u.creditRunwayDays)} วัน`}
          </p>
          <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">
            เครดิตหมดเมื่อไรการส่งหยุดทันที ไม่มีการเรียกเก็บย้อนหลัง ไม่มียอดติดลบ —
            แคมเปญที่ค้างจะรายงานตรง ๆ ว่าเหลือกี่คนที่ยังรออยู่
          </p>

          {/* ยังไม่มีระบบชำระเงิน — บน production ปุ่มซื้อพาไปขอซื้อ ไม่ใช่เพิ่มเครดิตให้ฟรี
              (เดิมกดแล้วเครดิตเข้าทันทีโดยไม่มีใครจ่าย) ส่วนเครื่องพัฒนาและเดโมยังกดลองได้ */}
          {!tools && (
            <p className="c-thai mt-6 border-t border-[var(--c-line)] pt-5 text-[0.84rem] text-[var(--c-text-2)]">
              ยังไม่เปิดชำระเงินออนไลน์ —{" "}
              <Link href="/contact" className="text-[var(--c-cyan)] underline underline-offset-4">
                ขอซื้อเครดิต
              </Link>{" "}
              แล้วเราจะเติมให้หลังชำระ
            </p>
          )}
          <div className={`mt-6 grid gap-2.5 border-t border-[var(--c-line)] pt-5 sm:grid-cols-3 ${tools ? "" : "hidden"}`}>
            {CREDIT_PACKS.map((pk) => (
              <ActionForm
                key={pk.messages}
                action={buyCreditsAction}
                fields={{ tenantId, messages: pk.messages }}
                buttonClassName="w-full flex-col !py-2.5"
                pendingLabel="กำลังเพิ่ม…"
                label={
                  <>
                    <span className="c-mono text-[0.82rem]">+{num(pk.messages)}</span>
                    <span className="text-[0.75rem] text-[var(--c-text-4)]">
                      {baht(pk.baht)} · ฿{perMessage(pk).toFixed(2)}/ข้อความ
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* ── คุ้มไหม ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">คุ้มไหม</h2>
        <p className="c-thai mt-1.5 max-w-3xl text-[0.83rem] text-[var(--c-text-3)]">
          ค่าใช้จ่ายจริง เทียบกับยอดเพิ่มที่<em>วัดได้</em>จากกลุ่มควบคุม — ไม่ใช่การคาดการณ์จากอัตราตอบกลับ
        </p>
        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="ค่าบริการต่อปี"
            value={yearlyFee > 0 ? baht(yearlyFee) : "ตามตกลง"}
            sub={
              annualBaht(plan) != null
                ? `จ่ายรายปี ${baht(annualBaht(plan)!)} — ประหยัด ${annualDiscountPct}%`
                : undefined
            }
          />
          <Metric
            label="ค่าส่งสะสมทั้งหมด"
            value={baht(u.messagesAllTime * MESSAGE_COST_BAHT)}
            sub={`${num(u.messagesAllTime)} ข้อความตั้งแต่เปิดบัญชี`}
            tone="muted"
          />
          <Metric
            label="ส่วนต่างที่วัดได้"
            value={measuredLift > 0 ? baht(measuredLift) : "ยังวัดไม่ได้"}
            sub={
              roi.campaigns > 0
                ? `จาก ${roi.campaigns} แคมเปญที่ครบกำหนด`
                : "ยังไม่มีแคมเปญที่ครบกำหนด"
            }
            tone={measuredLift > 0 ? "good" : "muted"}
          />
          {/* หน้า Proof แสดง "ต้นทุนต่อบาทที่เพิ่มขึ้น" ซึ่งออกมาเป็น ฿0.0062
              เลขที่เล็กกว่าหนึ่งสตางค์อ่านไม่ออกว่าดีหรือแย่ หน้านี้เป็น
              หน้าเรื่องเงินเข้าเงินออก จึงกลับด้านให้เป็นสิ่งที่ตอบคำถามตรง ๆ */}
          <Metric
            label="ได้กลับมาต่อทุก ฿1 ที่จ่าย"
            value={
              roi.costPerIncrementalBaht != null && roi.costPerIncrementalBaht > 0
                ? baht(1 / roi.costPerIncrementalBaht)
                : "—"
            }
            sub={
              roi.costPerIncrementalBaht != null
                ? "ต้นทุนรวมส่วนลดที่ให้ไปจริง ไม่ใช่แค่ค่าส่ง"
                : "ต้องมีผลที่สรุปได้ก่อน"
            }
            tone={roi.costPerIncrementalBaht != null ? "accent" : "muted"}
          />
        </div>
        <p className="c-thai mt-6 max-w-3xl text-[0.78rem] leading-relaxed text-[var(--c-text-4)]">
          "ส่วนต่างที่วัดได้" เฉลี่ยจากทุกแคมเปญที่ครบกำหนด ไม่ใช่เฉพาะตัวที่ได้ผล —
          ถ้าเฉลี่ยเฉพาะตัวที่ชนะ ตัวเลขจะสูงเกินจริงเสมอ ดูรายละเอียดที่{" "}
          <Link href="/app/proof" className="text-[var(--c-cyan)] underline">
            ผลที่วัดได้
          </Link>
        </p>
        {/* ตัวเลขนี้สูงเกินจริงในบัญชีตัวอย่าง และต้องเขียนไว้ตรงนี้
            ไม่ใช่ปล่อยให้เข้าใจว่าเป็นผลจากร้านจริง — ชุดข้อมูลสังเคราะห์
            ถูกใส่ผลของแคมเปญไว้ที่ +28% ซึ่งสูงกว่าที่คาดจากร้านจริง
            และแคมเปญที่ไม่ให้ส่วนลดจะมีตัวหารเป็นค่าส่งข้อความล้วน ๆ */}
        {synthetic && (
          <p className="c-thai mt-4 max-w-3xl border-l-2 border-[var(--c-warn)] pl-4 text-[0.78rem] leading-relaxed text-[var(--c-text-3)]">
            บัญชีนี้ใช้ชุดข้อมูลจำลอง ตัวเลขผลตอบแทนจึงสูงกว่าที่ร้านจริงควรคาดหวังมาก
            โดยเฉพาะแคมเปญที่ไม่มีส่วนลด
          </p>
        )}
      </Panel>

      {/* ── ค่าส่งรายแคมเปญ ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ค่าส่งรายแคมเปญ</h2>
        <p className="c-thai mt-1.5 max-w-3xl text-[0.83rem] text-[var(--c-text-3)]">
          เรียงล่าสุดก่อน — แถวที่ทำเครื่องหมายไว้นับเข้ารอบบิลนี้ ประวัติของบัญชีตัวอย่างยาวกว่าหนึ่งปี
            ส่วนใหญ่จึงอยู่นอกรอบ
        </p>
        {costs.length === 0 ? (
          <div className="mt-5">
            <Empty>ยังไม่มีอะไรถูกส่ง</Empty>
          </div>
        ) : (
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[34rem]">
              <thead>
                <tr>
                  <th className={TH}>วิธี</th>
                  <th className={TH}>ส่งเมื่อ</th>
                  <th className={`${TH} text-right`}>ผู้รับ</th>
                  <th className={`${TH} text-right`}>ค่าส่ง</th>
                  <th className={`${TH} text-right`}>รอบนี้</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/app/campaigns/${c.id}`}
                        className="text-[var(--c-text)] hover:text-[var(--c-cyan)]"
                      >
                        {playById(c.play_id)?.nameTh ?? c.play_id}
                      </Link>
                    </td>
                    <td className="c-mono whitespace-nowrap text-[0.76rem]">
                      {date(c.last_sent_at)}
                    </td>
                    <td className="c-num text-right">{num(Number(c.sent))}</td>
                    <td className="c-num text-right">{baht(Number(c.cost))}</td>
                    <td className="text-right text-[var(--c-cyan)]">
                      {c.inPeriod ? "•" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="c-label">
                    รวมรอบนี้
                  </td>
                  <td className="c-num text-right text-[var(--c-text)]">
                    {num(u.messagesThisPeriod)}
                  </td>
                  <td className="c-num text-right text-[var(--c-text)]">
                    {baht(u.messageCostThisPeriod)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {/* ── เปลี่ยนแผน ── */}
      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="c-h2 text-[var(--c-text)]">แผนทั้งหมด</h2>
            <p className="c-thai mt-1.5 max-w-2xl text-[0.83rem] text-[var(--c-text-3)]">
              บัญชีนี้อยู่แผน {plan.name}
              {suggested !== plan.id &&
                ` — ฐาน ${num(u.identified)} คนควรใช้แผน ${PLANS[suggested].name} ขึ้นไป`}
            </p>
          </div>
          <Link href="/pricing" className="c-btn c-btn-ghost c-btn-sm">
            ดูราคาทั้งหมด
          </Link>
        </div>

        <div className="c-scroll mt-6">
          <table className="c-table min-w-[42rem]">
            <thead>
              <tr>
                <th className="w-[15rem]" />
                {PLAN_ORDER.map((id) => (
                  <th
                    key={id}
                    className={
                      id === plan.id ? "text-[var(--c-cyan)]" : undefined
                    }
                  >
                    {PLANS[id].name}
                    {id === plan.id && " ·"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="c-label">ค่าบริการรายเดือน</td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="c-num text-[var(--c-text)]">
                    {PLANS[id].monthlyBaht == null
                      ? "ตามตกลง"
                      : baht(PLANS[id].monthlyBaht!)}
                    {PLANS[id].priceSuffix ? ` ${PLANS[id].priceSuffix}` : ""}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="c-label">{v.th.people}ที่ระบุตัวได้</td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="c-num">
                    {PLANS[id].contactCap == null
                      ? "ตามตกลง"
                      : num(PLANS[id].contactCap!)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="c-label">เครดิตแรกเข้า (ครั้งเดียว)</td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="c-num">
                    {PLANS[id].welcomeCredits > 0
                      ? num(PLANS[id].welcomeCredits)
                      : "—"}
                  </td>
                ))}
              </tr>
              {CAP_ROWS.map((r) => (
                <tr key={r.key}>
                  <td className="c-thai text-[0.8rem] text-[var(--c-text-3)]">
                    {r.label}
                  </td>
                  {PLAN_ORDER.map((id) => {
                    const c = PLANS[id].caps[r.key];
                    return (
                      <td
                        key={id}
                        className={
                          c.kind === "no"
                            ? "text-[var(--c-text-4)]"
                            : c.kind === "roadmap"
                              ? "text-[var(--c-warn)]"
                              : "text-[var(--c-text-2)]"
                        }
                      >
                        {capLabel(c)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!tools && (
          <p className="c-thai mt-6 border-t border-[var(--c-line)] pt-5 text-[0.84rem] text-[var(--c-text-2)]">
            อยากเปลี่ยนแผน?{" "}
            <Link href="/contact" className="text-[var(--c-cyan)] underline underline-offset-4">
              ติดต่อเรา
            </Link>{" "}
            — แผนจะเปลี่ยนหลังตกลงและชำระเงิน
          </p>
        )}
        <div className={`mt-6 flex flex-wrap gap-2.5 border-t border-[var(--c-line)] pt-5 ${tools ? "" : "hidden"}`}>
          {PLAN_ORDER.filter((id) => id !== plan.id).map((id) => (
            <ActionForm
              key={id}
              action={changePlanAction}
              fields={{ tenantId, plan: id }}
              label={`เปลี่ยนเป็น ${PLANS[id].name}`}
              pendingLabel="กำลังเปลี่ยน…"
              size="sm"
            />
          ))}
        </div>
        <p className={`c-thai mt-4 max-w-3xl text-[0.76rem] leading-relaxed text-[var(--c-text-4)] ${tools ? "" : "hidden"}`}>
          การสลับแผนเป็นเครื่องมือเดโม — เขียนลงฐานข้อมูลตรง ๆ เพื่อให้เห็นว่าเพดานกัดตรงไหนจริง
            ลองเปลี่ยนเป็น Pilot แล้วกลับไปหน้าบรีฟ
        </p>
      </Panel>
    </>
  );
}
