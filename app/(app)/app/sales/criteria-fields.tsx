import type { Criteria } from "@/lib/shared/policy";
import { hasB2B, hasB2C, type CustomerMode } from "@/lib/shared/tenants";

/* ช่องกรอกเกณฑ์เป้าหมาย — ใช้ทั้งตอนสร้างและตอนแก้แคมเปญ · ทุกช่องตรวจกับหลักฐานในฐานได้ ไม่มีคะแนน */
const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

/* บัญชีที่มีลูกค้าบุคคล (docs/crm-plan.md F5): เลือกกลุ่มเป้าหมายก่อน · ขายให้บุคคลอย่างเดียว = เกณฑ์ยอดซื้ออย่างเดียว */
export function CriteriaFields({ c = {}, mode = "b2b" }: { c?: Criteria; mode?: CustomerMode }) {
  const person = <PersonFields c={c} />;
  if (!hasB2B(mode)) return <><input type="hidden" name="audience" value="person" />{person}</>;
  if (!hasB2C(mode)) return <OrgFields c={c} />;
  return (
    <div className="grid gap-4">
      <label className={LABEL}>กลุ่มเป้าหมาย
        <select name="audience" defaultValue={c.audience ?? "org"} className="c-select max-w-sm">
          <option value="org">คนที่สังกัดบริษัท</option>
          <option value="person">ลูกค้าบุคคล</option>
        </select>
      </label>
      <details open={c.audience !== "person"}>
        <summary className="c-thai cursor-pointer text-[0.84rem] text-[var(--c-accent)]">เกณฑ์ของคนที่สังกัดบริษัท</summary>
        <div className="mt-3"><OrgFields c={c} /></div>
      </details>
      <details open={c.audience === "person"}>
        <summary className="c-thai cursor-pointer text-[0.84rem] text-[var(--c-accent)]">เกณฑ์ของลูกค้าบุคคล</summary>
        <div className="mt-3">{person}</div>
      </details>
    </div>
  );
}

function PersonFields({ c }: { c: Criteria }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className={LABEL}>ซื้อล่าสุดภายใน (วัน)
        <input type="number" name="boughtWithinDays" min={1} max={3650} defaultValue={c.boughtWithinDays ?? ""} className="c-input" placeholder="เช่น 90" />
      </label>
      <label className={LABEL}>ไม่ได้ซื้อมาแล้วอย่างน้อย (วัน)
        <input type="number" name="lapsedForDays" min={1} max={3650} defaultValue={c.lapsedForDays ?? ""} className="c-input" placeholder="เช่น 180 — ดึงลูกค้าที่หายไปกลับมา" />
      </label>
      <label className={LABEL}>ซื้ออย่างน้อย (ครั้ง)
        <input type="number" name="minOrders" min={1} max={1000} defaultValue={c.minOrders ?? ""} className="c-input" />
      </label>
      <label className={LABEL}>ยอดซื้อรวมอย่างน้อย (บาท)
        <input name="minSpent" inputMode="numeric" defaultValue={c.minSpent ?? ""} className="c-input" placeholder="เช่น 20000" />
      </label>
      <label className={LABEL}>เคยซื้อสินค้า (หมวดหรือชื่อ)
        <input name="boughtCategory" defaultValue={c.boughtCategory ?? ""} className="c-input" placeholder="เช่น putter" />
      </label>
      <label className="c-thai flex items-center gap-2 self-end text-[0.86rem] text-[var(--c-text-2)]">
        <input type="checkbox" name="excludeOpenDealsPerson" value="1" defaultChecked={c.audience === "person" && c.excludeOpenOpportunities} className="h-6 w-6" />
        ไม่รวมลูกค้าที่มีดีลเปิดอยู่แล้ว
      </label>
    </div>
  );
}

function OrgFields({ c }: { c: Criteria }) {
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
