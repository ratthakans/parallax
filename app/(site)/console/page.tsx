import { redirect } from "next/navigation";

/** Console ย้ายไปอยู่ที่ /app แล้ว คงเส้นทางเดิมไว้เพื่อไม่ให้ลิงก์เก่าตาย */
export default function ConsoleRedirect() {
  redirect("/app");
}
