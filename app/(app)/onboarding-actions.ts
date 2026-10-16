"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { denied, viewer } from "@/app/(app)/viewer";
import { acceptDpa, chooseTemplates, confirmMfa, loadSignupDemo } from "@/lib/engine/signup";
import { messageOf, type ActionState } from "@/lib/shared/action-state";

/* ── ขั้นตั้งต้นของบัญชีสมัครเอง (docs/solo-plan.md S9) ─────────────────────

   ทุก action ผ่าน denied() เหมือนคอนโซลส่วนอื่น แต่ปลด locked ก่อน — locked แปลว่า "ยังตั้งค่าไม่ครบ"
   ซึ่งคือเหตุผลที่ action พวกนี้มีอยู่ ลำดับขั้น (DPA → ยืนยันสองชั้น → แม่แบบ → ข้อมูลสมมุติ)
   บังคับที่ engine (lib/engine/signup) ไม่ใช่ที่หน้าจอ — ยิง action ข้ามขั้นตรง ๆ ได้ error กลับไป
   การสร้างบัญชีเองอยู่ที่ app/(gate)/signup/actions.ts เพราะเกิดก่อนมีบัญชี (ยังไม่มี viewer ให้ตรวจ) */

const done = () => {
  revalidatePath("/onboarding");
  redirect("/onboarding");
};

export async function acceptDpaAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied({ ...v, locked: null }, "policy");
  if (no) return { error: no };
  const res = await acceptDpa(v.tenantId, fd.get("accept") === "yes", v.actor, v.mfa);
  if (!res.ok) return { error: res.error };
  done();
  return null;
}

export async function confirmMfaStepAction(_p: ActionState): Promise<ActionState> {
  const v = await viewer();
  const no = denied({ ...v, locked: null }, "policy");
  if (no) return { error: no };
  const res = await confirmMfa(v.tenantId, v.actor, v.mfa);
  if (!res.ok) return { error: res.error };
  done();
  return null;
}

export async function chooseTemplatesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied({ ...v, locked: null }, "policy");
  if (no) return { error: no };
  const picks = fd.getAll("code").map(String).map((code) => ({ code, confirmation: String(fd.get(`confirm_${code}`) ?? "") }));
  const res = await chooseTemplates(v.tenantId, picks, v.actor, v.mfa);
  if (!res.ok) return { error: res.error };
  done();
  return null;
}

export async function loadDemoAction(_p: ActionState): Promise<ActionState> {
  const v = await viewer();
  const no = denied({ ...v, locked: null }, "import");
  if (no) return { error: no };
  let res: Awaited<ReturnType<typeof loadSignupDemo>>;
  try {
    res = await loadSignupDemo(v.tenantId, v.actor, v.mfa);
  } catch (err) {
    return { error: messageOf(err) };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath("/app", "layout");
  redirect("/app/today");
}
