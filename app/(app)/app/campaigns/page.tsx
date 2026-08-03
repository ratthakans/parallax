import { all } from "@/lib/engine/sql";
import Link from "next/link";
import { playById } from "@/lib/shared/plays";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import type { Verdict } from "@/lib/shared/types";
import {
  Empty,
  MEASUREMENT_LABEL,
  Metric,
  PageHead,
  Panel,
  VerdictPill,
  baht,
  num,
} from "@/components/console/ui";
import { measureAllAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  play_id: string;
  status: string;
  approved_at: string;
  approved_by: string;
  holdout_pct: number;
  measurement: string;
  audience_size: number;
  treated_size: number;
  holdout_size: number;
  dry_run: number;
  est_cost: number;
  sent: number;
  verdict90: Verdict | null;
};

export default async function CampaignsPage() {
  const tenantId = await getActiveTenantId();

  const rows = await all<Row>(`SELECT c.*,
              (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id) AS sent,
              (SELECT a.verdict FROM attributions a
                WHERE a.campaign_id = c.id AND a.horizon_days = 90) AS verdict90
       FROM campaigns c
       WHERE c.tenant_id = ?
       ORDER BY c.approved_at DESC`, tenantId);

  const live = rows.filter((r) => !r.dry_run);
  /* แคมเปญที่อนุมัติแล้วแต่ยังไม่ได้ส่ง คือ "งานที่ค้างอยู่"

     เดิมแถวเหล่านี้ขึ้นสถานะ "กำลังวัด" เหมือนกับแคมเปญที่ส่งไปแล้ว
     เพราะ status ถูกตั้งเป็น measuring ตั้งแต่ตอนอนุมัติ ผู้ใช้จึงมองไม่ออกเลย
     ว่ายังมีอะไรค้าง — งานที่ค้างต้องเห็นได้ ไม่ใช่ต้องเปิดดูทีละแถว */
  const pending = live.filter((r) => r.sent < r.treated_size);
  const totalTreated = live.reduce((s, r) => s + r.treated_size, 0);
  const totalHoldout = live.reduce((s, r) => s + r.holdout_size, 0);
  const totalSent = live.reduce((s, r) => s + r.sent, 0);

  return (
    <>
      <PageHead
        label="แคมเปญ"
        title="อนุมัติแล้ว · ส่งแล้ว · รอผล"
        lead="Approval freezes the list immediately — nobody can be added or removed after, because a list that can change makes the measurement worthless. Send from the button on each row."
        actions={
          <ActionForm
            action={measureAllAction}
            fields={{ tenantId }}
            label="วัดผลที่ถึงกำหนด"
            pendingLabel="กำลังวัด…"
          />
        }
      />

      {pending.length > 0 && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-accent)] p-5">
          <p className="c-label text-[var(--c-accent)]">outstanding work</p>
          <p className="c-thai mt-2 text-[0.88rem] text-[var(--c-text-2)]">
            {num(pending.length)} approved but unsent — {" "}
              {num(pending.reduce((acc, r) => acc + (r.treated_size - r.sent), 0))} people
              still waiting on a message
          </p>
          {/* ── ปุ่มพวกนี้พาไปหน้าที่มีปุ่มส่ง ไม่ได้ส่งเอง ──

              เดิมเขียนว่า "Send …" ทั้งที่เป็นแค่ลิงก์ และในหน้าปลายทาง
              ปุ่มหน้าตาเดียวกันเขียนว่า "Send — 70 recipients" แล้วส่งจริง
              คำเดียวกันทำสองอย่าง โดยอย่างหนึ่งย้อนกลับไม่ได้ */}
          <div className="mt-4 flex flex-wrap gap-2">
            {pending.slice(0, 4).map((r) => (
              <Link
                key={r.id}
                href={`/app/campaigns/${r.id}`}
                className="c-btn c-btn-primary c-btn-sm"
              >
                ตรวจเพื่อส่ง · {playById(r.play_id)?.name ?? r.play_id} ·{" "}
                {num(r.treated_size - r.sent)}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <Panel flat className="mb-8 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="แคมเปญที่ยังเดินอยู่" value={num(live.length)} />
        <Metric label="ส่งไปทั้งหมด" value={num(totalTreated)} tone="accent" />
        <Metric
          label="กันไว้ทั้งหมด"
          value={num(totalHoldout)}
          sub="มุมที่สองของการวัด"
          tone="muted"
        />
        <Metric label="Messages sent" value={num(totalSent)} />
      </Panel>

      {rows.length === 0 ? (
        <Empty>
          No campaigns yet — approve one from the Morning Brief and the first row appears here
        </Empty>
      ) : (
        <Panel className="p-5 md:p-6">
          <div className="c-scroll">
            <table className="c-table min-w-[58rem]">
              <thead>
                <tr>
                  <th>play</th>
                  <th>อนุมัติเมื่อ</th>
                  <th>กลุ่ม</th>
                  <th>ส่ง / กันไว้</th>
                  <th>วิธีวัด</th>
                  <th>ส่งแล้ว</th>
                  <th>ค่าใช้จ่าย</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const play = playById(r.play_id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="text-[var(--c-text)]">
                          {play?.name ?? r.play_id}
                        </span>
                        <span className="c-mono mt-1 block text-[0.68rem] text-[var(--c-text-4)]">
                          {r.play_id}
                        </span>
                      </td>
                      <td className="c-mono whitespace-nowrap text-[0.76rem]">
                        {new Date(r.approved_at).toLocaleString("en-GB", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="c-mono">{num(r.audience_size)}</td>
                      <td className="c-mono whitespace-nowrap">
                        {num(r.treated_size)} / {num(r.holdout_size)}
                        <span className="ml-1.5 text-[var(--c-text-4)]">
                          ({r.holdout_pct}%)
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[0.78rem]">
                        {MEASUREMENT_LABEL[r.measurement] ?? r.measurement}
                      </td>
                      <td className="c-mono">{num(r.sent)}</td>
                      <td className="c-mono whitespace-nowrap">{baht(r.est_cost)}</td>
                      <td className="whitespace-nowrap">
                        {r.dry_run ? (
                          <span className="c-pill">ซ้อมส่ง</span>
                        ) : r.sent < r.treated_size ? (
                          <span className="c-pill c-pill-reach">ยังไม่ส่ง</span>
                        ) : r.verdict90 ? (
                          <VerdictPill verdict={r.verdict90} />
                        ) : (
                          <span className="c-pill c-pill-warn">กำลังวัดผล</span>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/app/campaigns/${r.id}`}
                          className={`c-btn c-btn-sm ${
                            !r.dry_run && r.sent < r.treated_size
                              ? "c-btn-primary"
                              : "c-btn-ghost"
                          }`}
                        >
                          {!r.dry_run && r.sent < r.treated_size
                            ? "ตรวจเพื่อส่ง"
                            : "Open"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
