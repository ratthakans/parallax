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

export async function POST(req: Request) {
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

  const record = { ...data, receivedAt: new Date().toISOString() };

  // Forwarding destination is configured per environment. Without it the
  // submission is only logged — see README before going live.
  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
    } catch (err) {
      console.error("[contact] forward failed", err);
      return NextResponse.json(
        { error: "Could not send. Please email us directly at hello@parallax.co.th" },
        { status: 502 },
      );
    }
  } else {
    console.warn(
      "[contact] CONTACT_WEBHOOK_URL is not set — submission logged only",
      record,
    );
  }

  return NextResponse.json({ ok: true });
}
