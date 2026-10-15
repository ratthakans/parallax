import type { Criteria } from "@/lib/shared/policy";

/* ช่องกรอกเกณฑ์เป้าหมาย — ใช้ทั้งตอนสร้างและตอนแก้แคมเปญ · ทุกช่องตรวจกับหลักฐานในฐานได้ ไม่มีคะแนน */
const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export function CriteriaFields({ c = {} }: { c?: Criteria }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className={LABEL}>ตำแหน่งมีคำว่า (คั่นด้วยจุลภาค)
        <input name="titleKeywords" defaultValue={(c.titleKeywords ?? []).join(", ")} className="c-input" placeholder="การตลาด, marketing, ผู้อำนวยการ" />
      </label>
      <label className={LABEL}>เคยร่วมงานที่ชื่อมี
        <input name="program" defaultValue={c.program ?? ""} className="c-input" placeholder="เช่น Sunline Energy Week" />
      </label>
      <label className={LABEL}>ในบทบาท (คั่นด้วยจุลภาค)
        <input name="roles" defaultValue={(c.roles ?? []).join(", ")} className="c-input" placeholder="ผู้ออกบูธ, สปอนเซอร์" />
      </label>
      <label className={LABEL}>ตั้งแต่ปี/ครั้งที่
        <input name="sinceEdition" defaultValue={c.sinceEdition ?? ""} className="c-input" placeholder="เช่น 2023" />
      </label>
      <label className={LABEL}>อุตสาหกรรมของบริษัท
        <input name="industry" defaultValue={c.industry ?? ""} className="c-input" placeholder="บริษัทที่ไม่ทราบอุตสาหกรรมจะไม่เข้าเกณฑ์" />
      </label>
      <label className={LABEL}>คนต่อบริษัทไม่เกิน
        <input type="number" name="maxPerOrg" min={1} max={10} defaultValue={c.maxPerOrg ?? 2} className="c-input" />
      </label>
      <label className={LABEL}>คนในทีมรู้จัก
        <select name="warmPath" defaultValue={c.warmPath ?? ""} className="c-input">
          <option value="">ไม่กำหนด (แสดงเส้นทางเป็นเหตุผลถ้ามี)</option>
          <option value="direct">ต้องมีคนในทีมรู้จักตัวเขาโดยตรง</option>
          <option value="any">ต้องเข้าถึงได้ภายในสองทอด</option>
        </select>
      </label>
      <label className={LABEL}>บริษัทมีปฏิสัมพันธ์ภายใน (วัน)
        <input type="number" name="interactedWithinDays" min={1} max={3650} defaultValue={c.interactedWithinDays ?? ""} className="c-input" placeholder="เช่น 90" />
      </label>
      <label className={LABEL}>บริษัทเงียบมาแล้วอย่างน้อย (วัน)
        <input type="number" name="quietForDays" min={1} max={3650} defaultValue={c.quietForDays ?? ""} className="c-input" placeholder="เช่น 180 — หาบัญชีที่ห่างไป" />
      </label>
      <label className="c-thai flex items-center gap-2 text-[0.86rem] text-[var(--c-text-2)] md:col-span-3">
        <input type="checkbox" name="excludeOpenOpportunities" value="1" defaultChecked={c.excludeOpenOpportunities} className="h-6 w-6" />
        ไม่รวมบริษัทที่มีโอกาสขายเปิดอยู่แล้ว
      </label>
    </div>
  );
}
