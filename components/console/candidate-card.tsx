import type { Candidate } from "@/lib/shared/types";
import { previewCopy, vocabFor } from "@/lib/engine/dispatch";
import { profileFor } from "@/lib/shared/tenants";
import { explainPlay } from "@/lib/engine/ai";
import { approveAction } from "@/app/(app)/actions";
import { ActionForm } from "./action-form";
import { reachBlockedReason } from "@/lib/engine/billing";
import { CYCLE_LABEL } from "@/lib/shared/types";
import {
  AiBadge,
  EnginePill,
  MEASUREMENT_LABEL,
  Meter,
  Panel,
  baht,
  num,
} from "./ui";

/* การ์ดหนึ่งใบ = play หนึ่งตัวที่พร้อมกด

   ลำดับการอ่านคือสิ่งที่ตั้งใจ: ประโยคภาษาคนมาก่อน → ตัวเลขที่ตัดสินใจได้จริง
   สามตัว → ปุ่มเดียวที่ควรกด ส่วนศัพท์เทคนิคทั้งหมด (selector · สูตรคะแนน ·
   กติกาการวัด) อยู่ใน details ที่พับไว้ เพราะต้องอธิบายได้ทุกครั้ง (D7)
   แต่ไม่ต้องอ่านทุกครั้งเพื่อกดอนุมัติ */

export async function CandidateCard({
  candidate,
  tenantId,
  rank,
}: {
  candidate: Candidate;
  tenantId: string;
  rank?: number;
}) {
  const { play } = candidate;
  const planBlock = reachBlockedReason(tenantId);
  const size = candidate.audience.length;
  /* ตัวเลขนี้เป็นค่าประมาณ ไม่ใช่ค่าจริง

     การแบ่งกลุ่มทดสอบ/กลุ่มควบคุมใช้ hash(customer_id + campaign_id) และ
     campaign_id ยังไม่เกิดจนกว่าจะกดอนุมัติ จำนวนจริงจึงคลาดจากสัดส่วนที่ตั้งไว้
     เล็กน้อยเสมอ (เคยเห็น 921 บนปุ่ม แล้วส่งจริง 943)

     เขียนว่า "ราว" ให้ตรงกับความจริง ดีกว่าโชว์เลขที่ดูแน่นอนบนปุ่มที่กดแล้ว
     ย้อนกลับไม่ได้ แล้วให้ผู้ใช้ไปเจอเลขอื่นในหน้าถัดไป */
  const treated = Math.round(size * (1 - candidate.holdout_pct / 100));
  const holdout = size - treated;
  const approx = candidate.holdout_pct > 0;
  const v = profileFor(tenantId).vocab;
  const copy = previewCopy(play, play.guards.max_discount_pct, tenantId);
  const net = candidate.expected_value - candidate.estimated_cost;

  const why = await explainPlay({
    playName: play.name,
    logic: play.logic,
    size,
    filtered: candidate.filtered,
    responseRate: candidate.expected_response_rate,
    orderValue: candidate.expected_order_value,
    vocab: vocabFor(tenantId),
  });

  const measurementNote =
    candidate.measurement === "pooled_90d_holdout"
      ? "At this size results pool every 90 days — no per-campaign difference"
      : candidate.measurement === "time_shifted"
        ? "Too small for a holdout — measured by time-shifting instead"
        : "Large enough to report a per-campaign difference";

  return (
    <Panel className="p-5 md:p-6">
      {/* ── หัวการ์ด ── */}
      <div className="flex flex-wrap items-center gap-2">
        {rank != null && (
          <span className="c-mono text-[0.68rem] text-[var(--c-text-4)]">
            {String(rank).padStart(2, "0")}
          </span>
        )}
        <EnginePill engine={play.engine} />
        <span className="c-thai text-[0.74rem] text-[var(--c-text-4)]">
          {play.engine === "keep"
            ? `Bring existing ${v.people} back`
            : `Find new ${v.people} shaped like the best ones`}
        </span>
      </div>

      <h2 className="c-h2 mt-3 text-[var(--c-text)]">{play.name}</h2>

      {/* ── ประโยคภาษาคน ── */}
      <p className="c-thai mt-3 max-w-3xl text-[0.95rem] leading-relaxed text-[var(--c-text-2)]">
        {why.value}
      </p>
      <div className="mt-2.5">
        <AiBadge source={why.source} note={why.note} />
      </div>

      {/* ── สามตัวเลขที่ใช้ตัดสินใจ ── */}
      {/* ที่ 375px คอลัมน์สามช่องเหลือช่องละ 84px แต่ตัวเลขบาทหกหลัก
          ต้องการ ~93px จึงถูกตัด (พบกับ ฿551,155 ของบัญชีพรรค)
          เรียงลงแนวตั้งบนมือถือ อ่านง่ายกว่าและไม่มีอะไรหาย */}
      <div className="mt-6 grid grid-cols-1 gap-4 border-y border-[var(--c-line)] py-5 sm:grid-cols-3">
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <p className="c-label sm:mb-0">{approx ? "recipients (approx)" : "recipients"}</p>
          <p className="c-num text-[1.6rem] text-[var(--c-text)] sm:mt-2">
            {num(treated)}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <p className="c-label sm:mb-0">expected return</p>
          <p className="c-num text-[1.6rem] text-[var(--c-cyan)] sm:mt-2">
            {baht(candidate.expected_value)}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <p className="c-label sm:mb-0">messaging cost</p>
          <p className="c-num text-[1.6rem] text-[var(--c-text)] sm:mt-2">
            {baht(candidate.estimated_cost)}
          </p>
        </div>
      </div>
      <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">
        From {num(size)} qualifying {v.people} · net around {baht(net)} ·
        a projection, not a measured result
      </p>

      {/* ── ปุ่ม ──
          แผนที่ไม่มี Reach ต้องปิดปุ่มด้วย ไม่ใช่ปล่อยให้กดแล้วเจอ error
          จาก approveCampaign — เพดานบังคับที่ชั้น dispatch อยู่แล้ว
          หน้าจอมีหน้าที่ไม่หลอกให้กดสิ่งที่กดไม่ได้ */}
      {planBlock ? (
        <div className="mt-5">
          <p className="c-thai text-[0.86rem] text-[var(--c-warn)]">{planBlock}</p>
          <p className="c-thai mt-1.5 text-[0.78rem] text-[var(--c-text-4)]">
            The numbers above are fully calculated, so you can see what is waiting before deciding to upgrade.
          </p>
        </div>
      ) : candidate.blocked ? (
        <div className="mt-5">
          <p className="c-thai text-[0.86rem] text-[var(--c-warn)]">
            Cannot send yet — {candidate.blocked}
          </p>
          <p className="c-thai mt-1.5 text-[0.78rem] text-[var(--c-text-4)]">
            A limit is doing its job. Nothing to do — it returns next cycle if the conditions clear.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex flex-wrap items-start gap-2.5">
            <ActionForm
              action={approveAction}
              fields={{
                tenantId,
                playId: play.id,
                tone: copy[1]?.tone ?? copy[0].tone,
              }}
              label={`Approve — send to ${approx ? "~" : ""}${num(treated)}`}
              pendingLabel="Freezing the list…"
              variant="primary"
            />
            <ActionForm
              action={approveAction}
              fields={{ tenantId, playId: play.id, dryRun: "1" }}
              label="Dry run"
              pendingLabel="Freezing the list…"
            />
          </div>
          <p className="c-thai mt-3 max-w-3xl text-[0.78rem] text-[var(--c-text-4)]">
            This does not send yet — the list is frozen first, then you press send on
            the campaign page.{" "}
            {holdout > 0 ? (
              <>
                About {num(holdout)} will be held back so we can tell whether the
                revenue came from the message at all. The exact count is known at
                approval, because the split is computed from the campaign id.
              </>
            ) : (
              <>
                This cohort is too small to hold anyone back. Everyone gets the message
                and it is measured by time-shifting instead — weaker evidence, so the
                result indicates a direction rather than confirming one.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── รายละเอียดสำหรับคนที่อยากเห็น ──
          สองบานพับต่อการ์ด ไม่ใช่สาม: เดิมสามใบ × สามบานพับ = เก้าแถวของ chrome
          บนหน้าเดียว "วิธีวัดผล" กับ "สูตรคำนวณ" เป็นคำถามเดียวกัน —
          ตรวจได้ไหมว่าเลขนี้มาจากไหน — จึงรวมเป็นบานเดียว
          ส่วนข้อความที่จะส่งแยกไว้ เพราะเป็นสิ่งที่ควรอ่านก่อนกดอนุมัติ */}
      <details className="mt-6 border-t border-[var(--c-line)] pt-5">
        <summary className="c-label cursor-pointer select-none text-[var(--c-text-2)]">
          The message · three tones to choose from
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {copy.map((c) => (
            <div key={c.tone}>
              <p className="c-label">{c.tone}</p>
              <pre className="c-code mt-2">{c.body}</pre>
            </div>
          ))}
        </div>
        <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">
          Written once per campaign, never per person — the{" "}
          <span className="c-mono">{"{{name}}"}</span>{" "}
          <span className="c-mono">{"{{last_product}}"}</span>{" "}
          placeholders are filled with each person's name and {v.item} at send time
        </p>
      </details>

      <details className="mt-4 border-t border-[var(--c-line)] pt-5">
        <summary className="c-label cursor-pointer select-none text-[var(--c-text-2)]">
          How it is measured, the criteria, and every formula
        </summary>

        <div className="mt-4">
          <Meter treated={treated} holdout={holdout} />
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p className="c-mono text-[0.72rem] text-[var(--c-text-3)]">
              Treated {num(treated)} · held back {num(holdout)} (
              {candidate.holdout_pct}%)
            </p>
            <p className="c-mono text-[0.72rem] text-[var(--c-text-4)]">
              {MEASUREMENT_LABEL[candidate.measurement]}
            </p>
          </div>
          <p className="c-thai mt-2.5 text-[0.8rem] text-[var(--c-text-2)]">
            {measurementNote}
          </p>
          <p className="c-thai mt-2 text-[0.78rem] text-[var(--c-text-4)]">
            The held-back group never receives this message. If they {v.purchaseVerb}
                at the same rate as the treated group, the message caused nothing —
                and the system will say so plainly.
          </p>
        </div>

        <hr className="c-hair my-6" />

        <p className="c-thai text-[0.82rem] text-[var(--c-text-3)]">{play.logic}</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <p className="c-label">selection criteria · selector</p>
            <pre className="c-code mt-2.5">
              {Object.entries(play.selector)
                .map(([k, val]) => `${k}: ${JSON.stringify(val)}`)
                .join("\n")}
            </pre>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <p className="c-label">excluded</p>
              {candidate.filtered.length ? (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {candidate.filtered.map((f) => (
                    <li
                      key={f.reason}
                      className="c-thai flex justify-between gap-4 text-[0.8rem] text-[var(--c-text-2)]"
                    >
                      <span>{f.reason}</span>
                      <span className="c-mono shrink-0 text-[var(--c-text-4)]">
                        {num(f.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-4)]">
                  Nobody was excluded this round
                </p>
              )}
            </div>
            <div>
              <p className="c-label">ranking formula</p>
              <pre className="c-code mt-2.5">{`score ${candidate.score}
= expected value ${baht(candidate.expected_value)}
÷ estimated cost ${baht(candidate.estimated_cost)}

expected response ${(candidate.expected_response_rate * 100).toFixed(2)}%
  (posterior across accounts in the same cycle)
expected order value ${baht(candidate.expected_order_value)}
cycle shape ${play.cycle_shape.map((c) => CYCLE_LABEL[c]).join(" · ")}
play id ${play.id}`}</pre>
            </div>
          </div>
        </div>
        <p className="c-thai mt-4 text-[0.76rem] text-[var(--c-text-4)]">
          Selection and ranking are entirely arithmetic — no AI involved. Repeatable,
              and explainable line by line.
        </p>
      </details>
    </Panel>
  );
}
