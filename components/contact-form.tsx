"use client";

import { useState } from "react";

const CYCLES = ["ซื้อเติมเป็นรอบ", "กลับมาตามเวลา", "ต่ออายุเมื่อหมดอายุ", "ใช้เวลาตัดสินใจ", "ยังไม่แน่ใจ"];
const TOPICS = ["ขอทดลองใช้", "พาร์ตเนอร์ POS", "นักลงทุน", "เรื่องอื่นๆ"];
const SIZES = ["น้อยกว่า 500 คน", "500–5,000 คน", "5,000–25,000 คน", "มากกว่า 25,000 คน", "ยังไม่ทราบ"];

const field =
  "w-full border-b border-line bg-transparent py-3 text-[0.98rem] text-ink outline-none transition-colors duration-300 placeholder:text-ink-4 focus:border-signal";

export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setErrors({});
    setMessage("");

    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setState("done");
        return;
      }
      if (res.status === 422 && json.errors) {
        setErrors(json.errors);
        setState("idle");
        return;
      }
      setMessage(json.error ?? "ส่งไม่สำเร็จ กรุณาลองอีกครั้ง");
      setState("error");
    } catch {
      /* ไม่ชี้ไปอีเมลที่ยังยืนยันไม่ได้ว่ารับจริง — parallax.co.th ยังไม่
         resolve การบอกให้คนที่เพิ่งส่งไม่สำเร็จไปเมลที่จะเด้งกลับ
         คือความล้มเหลวซ้อนความล้มเหลว */
      setMessage("เชื่อมต่อไม่สำเร็จ กรุณารอสักครู่แล้วลองอีกครั้ง");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="panel border-t-2 border-t-signal p-9 md:p-11">
        <p className="t-label t-thai text-signal">รับข้อมูลแล้ว</p>
        <h3 className="t-h2 mt-6 text-ink">ขอบคุณครับ</h3>
        <p className="t-body t-thai pretty mt-6 text-ink-3">
          เราจะตอบกลับภายใน 2 วันทำการ
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      <div className="grid gap-x-10 gap-y-9 md:grid-cols-2">
        <Field label="ชื่อของคุณ" error={errors.name} required>
          <input name="name" autoComplete="name" className={field} placeholder="ชื่อและนามสกุล" />
        </Field>

        <Field label="ชื่อธุรกิจ" error={errors.company} required>
          <input name="company" autoComplete="organization" className={field} placeholder="ชื่อร้านหรือบริษัท" />
        </Field>

        <Field label="อีเมล" error={errors.email} required>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className={field}
            placeholder="you@company.co.th"
          />
        </Field>

        <Field label="เบอร์โทรศัพท์">
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={field}
            placeholder="ไม่บังคับ"
          />
        </Field>

        <Field label="ต้องการติดต่อเรื่องอะไร">
          <select name="topic" className={field} defaultValue={TOPICS[0]}>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="รูปแบบวงจรรายได้">
          <select name="cycle" className={field} defaultValue={CYCLES[4]}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="จำนวนลูกค้าที่ระบุตัวตนได้" className="md:col-span-2">
          <select name="baseSize" className={field} defaultValue={SIZES[4]}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="รายละเอียดเพิ่มเติม" className="md:col-span-2">
          <textarea
            name="message"
            rows={4}
            className={`${field} resize-none`}
            placeholder="ใช้ POS อะไร มีประวัติยอดขายกี่เดือน หรือมีคำถามอะไรเพิ่มเติม"
          />
        </Field>
      </div>

      {state === "error" && (
        <p className="t-small t-thai border-l border-signal pl-5 text-signal">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn btn-primary disabled:opacity-55"
        >
          {state === "sending" ? "กำลังส่ง…" : "ส่งข้อมูล"}
        </button>
        <p className="t-small text-ink-4">
          เราใช้ข้อมูลนี้เพื่อตอบกลับคุณเท่านั้น
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  error,
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="t-label text-ink-4">
        {label}
        {required && <span className="ml-1.5 text-signal">*</span>}
      </span>
      {children}
      {error && <span className="t-small mt-1 text-signal">{error}</span>}
    </label>
  );
}
