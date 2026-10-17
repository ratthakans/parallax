"use client";

import { useRef, useState, useTransition } from "react";
import { applyOrgUpdateAction, planOrgUpdateAction } from "@/app/(app)/bulk-actions";
import type { OrgUpdatePlan, Target } from "@/lib/engine/org-update";
import { num } from "./ui";

/* ── อัปเดตบริษัทจากไฟล์ (docs/crm-plan.md D2) ── เลือกไฟล์ → ดูทุกช่องที่จะเปลี่ยน → ยืนยัน
   เปลี่ยนการจับคู่คอลัมน์ได้ แล้วระบบคำนวณตัวอย่างใหม่ · ไฟล์อยู่ที่เบราว์เซอร์จนกว่าจะยืนยัน */

export function OrgUpdater({ targets }: { targets: { key: string; label: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<OrgUpdatePlan | null>(null);
  const [mapping, setMapping] = useState<Record<number, Target>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function preview(f: File, m?: Record<number, Target>) {
    setMsg(null);
    setFile(f);
    const fd = new FormData();
    fd.set("file", f);
    if (m) fd.set("mapping", JSON.stringify(m));
    start(async () => {
      const r = await planOrgUpdateAction(fd);
      if (!r.ok) { setPlan(null); setMsg({ ok: false, text: r.error }); return; }
      setPlan(r.plan);
      setMapping(Object.fromEntries(r.plan.columns.map((c) => [c.index, c.target])));
    });
  }

  function apply() {
    if (!file || !plan) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("sha256", plan.sha256);
    fd.set("mapping", JSON.stringify(mapping));
    start(async () => {
      const r = await applyOrgUpdateAction(fd);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: `อัปเดตแล้ว ${num(r.changes)} ช่อง — ย้อนทั้งชุดได้จากประวัติด้านล่าง` });
      setPlan(null); setFile(null);
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="grid gap-4">
      <input ref={input} type="file" accept=".csv,.xlsx" className="c-input" disabled={pending}
        onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) preview(f); }} aria-label="เลือกไฟล์บริษัท" />
      {pending && <p className="c-thai text-[0.86rem] text-[var(--c-text-3)]">กำลังอ่านไฟล์…</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`c-msg ${msg.ok ? "c-msg-ok" : "c-msg-err"}`}>{msg.text}</p>}
      {plan && file && (
        <>
          <div className="c-panel p-4">
            <p className="c-thai text-[0.86rem] font-semibold text-[var(--c-text)]">คอลัมน์ในไฟล์</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {plan.columns.map((c) => (
                <label key={c.index} className="c-thai flex min-w-0 flex-col gap-1 text-[0.78rem] text-[var(--c-text-3)]">
                  {c.header || `คอลัมน์ ${c.index + 1}`}
                  <select className="c-select" value={mapping[c.index] ?? "ignore"} disabled={pending}
                    onChange={(e) => { const m = { ...mapping, [c.index]: e.currentTarget.value as Target }; setMapping(m); preview(file, m); }}>
                    {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <p className="c-thai text-[0.88rem] text-[var(--c-text-2)]">
            {num(plan.rows)} แถว · พบบริษัท {num(plan.matched)} · จะเปลี่ยน <b>{num(plan.changes.length)}</b> ช่อง{plan.problems.length ? ` · ข้าม ${num(plan.problems.length)} รายการ` : ""}
          </p>
          {plan.changes.length > 0 && (
            <div className="c-scroll max-h-[28rem] overflow-y-auto" tabIndex={0} role="region" aria-label="สิ่งที่จะเปลี่ยน">
              <table className="c-table min-w-[36rem]">
                <thead><tr><th>บริษัท</th><th>ช่อง</th><th>ค่าเดิม</th><th>ค่าใหม่</th></tr></thead>
                <tbody>
                  {plan.changes.slice(0, 500).map((c, i) => (
                    <tr key={i}>
                      <td className="c-thai">{c.org}</td><td className="c-thai">{c.label}</td>
                      <td className="c-thai text-[var(--c-text-3)]">{c.oldValue ?? "—"}</td><td className="c-thai font-semibold">{c.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan.problems.length > 0 && (
            <details>
              <summary className="c-thai cursor-pointer text-[0.84rem] text-[var(--c-warn)]">รายการที่ข้าม ({num(plan.problems.length)})</summary>
              <ul className="c-thai mt-2 grid gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                {plan.problems.slice(0, 200).map((p, i) => <li key={i}>แถว {p.line}: {p.reason}</li>)}
              </ul>
            </details>
          )}
          <div className="flex gap-2">
            <button type="button" className="c-btn c-btn-primary" disabled={pending || !plan.changes.length} onClick={apply}>
              ยืนยันอัปเดต {num(plan.changes.length)} ช่อง
            </button>
            <button type="button" className="c-btn c-btn-ghost" disabled={pending}
              onClick={() => { setPlan(null); setFile(null); setMsg(null); if (input.current) input.current.value = ""; }}>ยกเลิก</button>
          </div>
        </>
      )}
    </div>
  );
}
