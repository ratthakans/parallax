import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Payload = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  cycle?: string;
  baseSize?: string;
  message?: string;
  topic?: string;
};

const CYCLES = ["Replenish", "Recall", "Expiry", "Considered", "Not sure yet"];
const TOPICS = ["Pilot programme", "POS partnership", "Investor", "Something else"];

function clean(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/* ── จำกัดอัตราการยิง ────────────────────────────────────────────

   ปลายทางนี้เคยรับได้ไม่จำกัด ใครก็ยิงหมื่นครั้งได้ และเมื่อไรที่ตั้ง
   CONTACT_WEBHOOK_URL แล้ว มันจะกลายเป็นเครื่องขยายเสียงยิงเข้า Slack
   หรือ LINE ของเราเองด้วยความเร็วเท่าที่ผู้ยิงจะทำได้

   นับในหน่วยความจำของ instance เท่านั้น ซึ่งบน Vercel แปลว่ากันได้
   แค่ระดับ instance ไม่ใช่ทั้งระบบ — ยังดีกว่าไม่มี และการกันจริงจัง
   ต้องใช้ที่เก็บสถานะร่วม ซึ่งเป็นงานเดียวกับตอนย้ายฐานข้อมูล */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // กันไม่ให้ Map โตไม่หยุดบน instance ที่อยู่ยาว
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const data = {
    name: clean(body.name, 120),
    company: clean(body.company, 160),
    email: clean(body.email, 200),
    phone: clean(body.phone, 40),
    cycle: clean(body.cycle, 40),
    baseSize: clean(body.baseSize, 40),
    topic: clean(body.topic, 40),
    message: clean(body.message, 4000),
  };

  const errors: Record<string, string> = {};
  if (!data.name) errors.name = "Please enter your name";
  if (!data.company) errors.company = "Please enter your business name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.email = "Please enter a valid email";
  if (data.cycle && !CYCLES.includes(data.cycle)) errors.cycle = "Unrecognised value";
  if (data.topic && !TOPICS.includes(data.topic)) errors.topic = "Unrecognised value";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  const webhook = process.env.CONTACT_WEBHOOK_URL;

  /* ── ไม่มีปลายทาง = ปฏิเสธตรง ๆ ไม่ใช่รับแล้วทิ้ง ────────────────

     เดิมเมื่อไม่ได้ตั้ง CONTACT_WEBHOOK_URL โค้ดจะ console.warn แล้วคืน
     { ok: true } ผู้ส่งเห็นหน้าขอบคุณและเชื่อว่าเราได้รับแล้ว ทั้งที่
     ข้อมูลอยู่แค่ใน log ของ Vercel ซึ่งไม่มีใครเฝ้าและหายไปตามอายุ log

     บนเว็บที่ยังไม่มีลูกค้าสักราย ฟอร์มนี้คือทางเดียวที่คนติดต่อเข้ามาได้
     การกลืนมันเงียบ ๆ คือความล้มเหลวที่แพงที่สุดเท่าที่หน้านี้จะทำได้

     lead ที่เรารู้ว่าเสีย ดีกว่า lead ที่เสียโดยไม่มีใครรู้

     ── และของเดิมยังเขียนข้อมูลส่วนบุคคลลง log ──

     console.warn(..., record) พิมพ์ชื่อ · บริษัท · อีเมล · เบอร์โทร
     ลง log ของเซิร์ฟเวอร์ ซึ่งขัดกับหน้า /trust ของเราเองที่บอกว่า
     ไม่เก็บข้อมูลส่วนบุคคลไว้เกินจำเป็น ตอนนี้ log บอกแค่ว่ามีคนส่งเข้ามา
     กับหัวข้อที่เขาเลือก ไม่มีตัวระบุบุคคลสักตัว */
  if (!webhook) {
    console.error(
      `[contact] CONTACT_WEBHOOK_URL is not set — refused a submission (topic: ${
        data.topic || "unspecified"
      }). Set the variable to start receiving leads.`,
    );
    return NextResponse.json(
      {
        error:
          "This form is not connected to an inbox yet, so nothing would reach us. Rather than pretend it went through, we would rather you knew.",
      },
      { status: 503 },
    );
  }

  const record = { ...data, receivedAt: new Date().toISOString() };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`webhook responded ${res.status}`);
  } catch (err) {
    /* ไม่พิมพ์ record ลง log ด้วยเหตุผลเดียวกับข้างบน */
    console.error("[contact] forward failed", err);
    return NextResponse.json(
      { error: "Could not send. Please try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
