"use client";

import { useState } from "react";

const CYCLES = ["Replenish", "Recall", "Expiry", "Considered", "Not sure yet"];
const TOPICS = ["Pilot programme", "POS partnership", "Investor", "Something else"];
const SIZES = ["Under 500", "500–5,000", "5,000–25,000", "Over 25,000", "Don't know"];

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
      setMessage(json.error ?? "Could not send. Please try again.");
      setState("error");
    } catch {
      setMessage(
        "Connection failed. Please email us directly at hello@parallax.co.th",
      );
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card border-t-2 border-t-signal p-9 md:p-11">
        <p className="t-label text-signal">received</p>
        <h3 className="t-h2 mt-6 text-ink">Thank you</h3>
        <p className="t-body t-thai pretty mt-6 text-ink-3">
          We reply within two business days. If it is more urgent than that, email
              us directly at{" "}
          <a href="mailto:hello@parallax.co.th" className="ulink text-signal">
            hello@parallax.co.th
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      <div className="grid gap-x-10 gap-y-9 md:grid-cols-2">
        <Field label="Your name" error={errors.name} required>
          <input name="name" className={field} placeholder="First and last name" />
        </Field>

        <Field label="Business name" error={errors.company} required>
          <input name="company" className={field} placeholder="Shop or company name" />
        </Field>

        <Field label="Email" error={errors.email} required>
          <input
            name="email"
            type="email"
            inputMode="email"
            className={field}
            placeholder="you@company.co.th"
          />
        </Field>

        <Field label="Phone">
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            className={field}
            placeholder="Optional"
          />
        </Field>

        <Field label="What is this about?">
          <select name="topic" className={field} defaultValue={TOPICS[0]}>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Revenue cycle shape">
          <select name="cycle" className={field} defaultValue={CYCLES[4]}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Identifiable customer base" className="md:col-span-2">
          <select name="baseSize" className={field} defaultValue={SIZES[4]}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Anything else worth knowing" className="md:col-span-2">
          <textarea
            name="message"
            rows={4}
            className={`${field} resize-none`}
            placeholder="Which POS you run, how many months of history you have, or any question at all"
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
          {state === "sending" ? "Sending…" : "Send"}
        </button>
        <p className="t-small text-ink-4">
          We use this only to reply to you.
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
