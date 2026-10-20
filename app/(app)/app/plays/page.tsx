import { redirect } from "next/navigation";

export const metadata = { title: "แคมเปญ" };
/* ต้องเป็นหน้าไดนามิก — ไม่งั้นตอน build Next พยายามสร้างหน้านี้ล่วงหน้าแล้วชน redirect (CI build ตก) */
export const dynamic = "force-dynamic";

/* ── คลัง play (ระบบค้าปลีกเดิม) เลิกใช้แล้ว (docs/crm-plan.md G3) ──
   อนุมัติ play จากหน้าจอไม่ได้มาตั้งแต่ย้ายมาใช้แคมเปญที่ตัดสินด้วยบริการนโยบาย — หน้านี้เหลือแต่ตัวเลขที่กดต่อไม่ได้
   เกณฑ์แบบ play (ซื้อล่าสุด · หายไปนาน · ยอดซื้อ · หมวดสินค้า) อยู่ในแคมเปญ › กลุ่มเป้าหมาย "ลูกค้าบุคคล" แล้ว (F5) */
export default function PlaysPage() {
  redirect("/app/sales");
}
