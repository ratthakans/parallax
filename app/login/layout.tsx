import "../(app)/console.css";

/* ── หน้าเข้าสู่ระบบใช้สไตล์ของคอนโซล ไม่ใช่ของเว็บการตลาด ──

   console.css ถูก import จาก layout ของกลุ่ม (app) ซึ่งหน้านี้อยู่นอก
   โดยตั้งใจ — layout นั้นมีแถบข้าง เมนู และตัวสลับบัญชี ที่ล้วนสมมติ
   ว่ารู้แล้วว่าใครล็อกอินอยู่

   จึงต้อง import สไตล์เข้ามาเอง ไม่งั้น c-btn · c-input · c-h1
   จะไม่มีนิยามและหน้าจะออกมาเป็น HTML เปล่า */
export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="console">{children}</div>;
}
