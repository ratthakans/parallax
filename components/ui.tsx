import { Numeral, Stagger } from "@/components/reveal";
import Link from "next/link";
import type { ReactNode } from "react";

/* ── gradient field + grain ──────────────────────────────── */

export function Field({
  variant = "aurora",
  grain = true,
}: {
  variant?: "aurora" | "wash" | "deep";
  grain?: boolean;
}) {
  const blobs = variant === "aurora" ? 3 : 2;
  return (
    <>
      <div className={`field field--${variant}`} aria-hidden>
        {Array.from({ length: blobs }, (_, i) => (
          <span key={i} className="field__blob">
            <i />
          </span>
        ))}
      </div>
      {grain && (
        <div
          className={`grain ${variant === "deep" ? "grain--dark" : "grain--light"}`}
          aria-hidden
        />
      )}
    </>
  );
}

/* ── hero signal field ───────────────────────────────────── */

/** พื้นหลัง hero ที่เคลื่อนไหว — ภาพ CI + mesh หมุน + ตารางไถล + ลำแสงกวาด */
export function SignalField({
  plate = "/img/blue-transition-cover-v1.jpg",
  grain = true,
}: {
  plate?: string;
  grain?: boolean;
}) {
  return (
    <div className="signal" aria-hidden>
      <div
        className="signal__plate"
        style={{ backgroundImage: `url(${plate})` }}
      />
      <div className="signal__mesh" />
      <div className="signal__mesh" />
      <div className="signal__grid" />
      <div className="signal__sweep" />
      <div className="signal__scrim" />
      {grain && <div className="grain grain--dark" />}
    </div>
  );
}

/* ── deck-flavoured system atoms ─────────────────────────
   ภาษาภาพชุดเดียวกับเด็คนักลงทุน: แถบสถานะแบบ mono · ป้ายคำสั่ง ·
   การ์ดสัญญาณที่มีสถานะ LIVE — ทำให้หน้าเว็บอ่านเหมือนระบบที่กำลังทำงาน
   ไม่ใช่โบรชัวร์ */

export function SysBar({
  left,
  right,
  tone = "light",
}: {
  left: string;
  right: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={`sysbar ${tone === "dark" ? "sysbar--dark" : ""}`}>
      <span>{left}</span>
      <span className="sysbar__rule" aria-hidden />
      <span>{right}</span>
    </div>
  );
}

export function Cmd({
  children,
  hot = false,
}: {
  children: ReactNode;
  hot?: boolean;
}) {
  return <span className={`cmd ${hot ? "cmd--hot" : ""}`}>{children}</span>;
}

/** การ์ดสัญญาณ — เลขกำกับ หัวเรื่องสองบรรทัด คำอธิบาย และสถานะ */
export function SignalCard({
  index,
  title,
  body,
  status,
  tone = "light",
}: {
  index: string;
  title: ReactNode;
  body: string;
  status?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={`sigcard ${tone === "dark" ? "sigcard--dark" : ""}`}>
      <span className="t-label sigcard__index">{index}</span>
      <h3 className="t-h3 sigcard__title">{title}</h3>
      <p className="t-small t-thai sigcard__body">{body}</p>
      {status && (
        <span className="sigcard__status">
          {status}
          <i aria-hidden />
        </span>
      )}
    </div>
  );
}

/* ── brand mark ──────────────────────────────────────────── */
/* two sight lines from two positions converging on one point —
   the only way to know distance instead of just position */

/* ── section furniture ───────────────────────────────────── */

export function Label({
  children,
  n,
  tone = "dark",
  className = "",
}: {
  children: ReactNode;
  n?: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <p
      className={`t-label flex items-center gap-3 ${
        tone === "light" ? "text-cyan/60" : "text-ink-4"
      } ${className}`}
    >
      {n && (
        <>
          <span className={tone === "light" ? "text-frost/52" : "text-ink-4/70"}>
            {n}
          </span>
          <span
            className={`label-rule h-px w-6 ${
              tone === "light" ? "bg-frost/25" : "bg-line"
            }`}
          />
        </>
      )}
      {children}
    </p>
  );
}

export function Section({
  children,
  className = "",
  id,
  tone = "paper",
  size = "band",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "paper" | "mist" | "dark" | "none";
  size?: "band" | "band-sm";
}) {
  const toneClass =
    tone === "dark"
      ? "surface-dark"
      : tone === "mist"
        ? "surface-mist"
        : tone === "paper"
          ? "surface-paper"
          : "";
  return (
    <section
      id={id}
      className={`relative ${toneClass} ${size} ${className}`}
    >
      {children}
    </section>
  );
}

/* ── page hero shared by every inner page ────────────────── */

export function PageHero({
  label,
  title,
  lead,
  meta,
}: {
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  meta?: { k: string; v: string }[];
}) {
  return (
    <>
      <header className="relative overflow-hidden pt-36 pb-20 md:pt-44 md:pb-28">
        <Field variant="aurora" />
        <div className="shell">
          <Label>{label}</Label>
          <h1 className="t-h1 balance mt-7 max-w-4xl text-ink">{title}</h1>
          {lead && (
            <p className="t-lead t-thai pretty mt-8 max-w-2xl text-ink-2">{lead}</p>
          )}
        </div>
      </header>
      {/* the band always sits on clean paper — never on the gradient */}
      {meta && (
        <section className="surface-paper relative">
          <div className="shell">
            <MetricBand items={meta.map((m) => ({ value: m.v, label: m.k }))} />
          </div>
        </section>
      )}
    </>
  );
}

/* ── Stripe-style stat band — hairline grid, oversized figures ─ */

export function MetricBand({
  items,
}: {
  items: { value: string; label: string; sub?: string }[];
}) {
  return (
    <dl className="metricband">
      {items.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd>
            <p className="t-numeral-xl text-ink">
              <Numeral value={s.value} />
            </p>
            <p className="t-small t-thai mx-auto mt-4 max-w-[15rem] text-ink-3">
              {s.label}
            </p>
            {s.sub && (
              <p className="t-small mx-auto mt-1 max-w-[15rem] text-ink-4">{s.sub}</p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── content atoms ───────────────────────────────────────── */

export function Metric({
  value,
  label,
  sub,
  tone = "dark",
}: {
  value: string;
  label: string;
  sub?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div>
      <p
        className={`t-numeral-xl ${
          tone === "light" ? "text-cyan" : "text-ink"
        }`}
      >
        <Numeral value={value} />
      </p>
      <p
        className={`t-small t-thai mt-4 ${
          tone === "light" ? "text-frost/70" : "text-ink-2"
        }`}
      >
        {label}
      </p>
      {sub && (
        <p
          className={`t-small mt-1 ${
            tone === "light" ? "text-frost/52" : "text-ink-4"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export function Quote({
  children,
  cite,
  tone = "dark",
}: {
  children: ReactNode;
  cite?: string;
  tone?: "dark" | "light";
}) {
  return (
    <figure className="relative">
      <div
        className={`absolute top-1 left-0 h-full w-px ${
          tone === "light" ? "bg-frost/20" : "bg-signal/30"
        }`}
        aria-hidden
      />
      <blockquote
        className={`t-h3 pretty pl-7 font-light ${
          tone === "light" ? "text-frost/85" : "text-ink"
        }`}
      >
        {children}
      </blockquote>
      {cite && (
        <figcaption
          className={`t-label mt-5 pl-7 ${
            tone === "light" ? "text-frost/48" : "text-ink-4"
          }`}
        >
          {cite}
        </figcaption>
      )}
    </figure>
  );
}

export function Note({
  children,
  tone = "dark",
}: {
  children: ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <p
      className={`t-small t-thai border-l pl-5 ${
        tone === "light"
          ? "border-frost/20 text-frost/58"
          : "border-line text-ink-3"
      }`}
    >
      {children}
    </p>
  );
}

export function Panel({
  children,
  className = "",
  tone = "dark",
}: {
  children: ReactNode;
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div
      className={`${tone === "light" ? "panel-dark" : "panel"} p-7 md:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

/* ── numbered step sequence ──────────────────────────────── */

export function Steps({
  items,
  tone = "dark",
}: {
  items: { t: string; d: string; extra?: string }[];
  tone?: "dark" | "light";
}) {
  const light = tone === "light";
  return (
    <ol className="flex flex-col">
      {items.map((s, i) => (
        <li
          key={s.t}
          className={`grid gap-5 border-t py-10 lg:grid-cols-[5rem_1fr_1.25fr] lg:gap-10 ${
            light ? "border-cyan/15" : "border-line"
          } ${
            i === items.length - 1
              ? light
                ? "border-b border-b-cyan/15"
                : "border-b border-b-line"
              : ""
          }`}
        >
          <span
            className={`t-numeral text-[1.6rem] ${
              light ? "text-cyan/45" : "text-ink-4"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className={`t-h3 ${light ? "text-frost" : "text-ink"}`}>{s.t}</h3>
          <div>
            <p
              className={`t-body t-thai pretty ${
                light ? "text-frost/70" : "text-ink-2"
              }`}
            >
              {s.d}
            </p>
            {s.extra && (
              <p
                className={`t-small t-thai mt-5 border-l pl-5 ${
                  light
                    ? "border-cyan/25 text-cyan/70"
                    : "border-signal/35 text-signal"
                }`}
              >
                {s.extra}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── link primitives ─────────────────────────────────────── */

export function ArrowLink({
  href,
  children,
  tone = "dark",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 text-[0.9rem] font-medium ${
        tone === "light" ? "text-cyan" : "text-signal"
      } ${className}`}
    >
      <span className="ulink">{children}</span>
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 transition-transform duration-400 group-hover:translate-x-1"
        fill="none"
        aria-hidden
      >
        <path
          d="M2 8h11M9 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

/* ── next-page rail at the bottom of every inner page ────── */

export function NextUp({
  items,
}: {
  items: { href: string; label: string; title: string }[];
}) {
  return (
    <Section tone="paper" size="band-sm" className="rule-t">
      <div className="shell">
        <Label n="→">Read next</Label>
        <Stagger
          step={80}
          className="mt-9 grid gap-px bg-line md:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="group flex h-full flex-col justify-between gap-8 bg-paper p-7 transition-colors duration-300 hover:bg-white"
            >
              <span className="t-label text-ink-4">{i.label}</span>
              <span className="t-h3 pretty flex items-end justify-between gap-4 text-ink">
                {i.title}
                <svg
                  viewBox="0 0 16 16"
                  className="mb-1.5 h-4 w-4 shrink-0 text-signal transition-transform duration-400 group-hover:translate-x-1"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M2 8h11M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </Link>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

/* ── รายละเอียดที่พับเก็บไว้ ────────────────────────────────
   หน้าเว็บนี้มีเหตุผลรองรับทุกข้ออยู่จริง แต่การวางเหตุผลทั้งหมดไว้
   ในสายตาทำให้หน้าอ่านเหมือนเอกสาร ไม่ใช่หน้าขาย

   เหตุผลไม่ได้ถูกลบ ถูกพับ — คนที่ตัดสินใจจากหัวข้อได้ ไม่ต้องอ่าน
   คนที่จะถามว่า "ทำไม" กดครั้งเดียวแล้วได้คำตอบเต็ม
   ใช้ details/summary จริง จึงค้นด้วย ⌘F ได้และไม่พังเมื่อ JS ไม่ทำงาน */

export function More({
  children,
  label = "Why",
  tone = "dark",
}: {
  children: ReactNode;
  label?: string;
  tone?: "dark" | "light";
}) {
  return (
    <details className={`more ${tone === "light" ? "more-light" : ""}`}>
      <summary>
        <span className="more-label">{label}</span>
        <span className="more-sign" aria-hidden />
      </summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

/* ── closing CTA ─────────────────────────────────────────── */

export function CTA({
  title = "Start from the export you already have.",
  body = "One file, one brief, one proof design. Nothing to install.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Section tone="dark" className="overflow-hidden">
      <Field variant="deep" />
      <div className="shell">
        <div className="max-w-3xl">
          <h2 className="t-h2 balance text-frost">{title}</h2>
          <p className="t-lead t-thai mt-7 max-w-xl text-frost/70">{body}</p>
          <div className="mt-11 flex flex-wrap gap-3">
            <Link href="/contact" className="btn btn-frost">
              Talk to us
            </Link>
            <Link href="/app" className="btn btn-outline-frost">
              Open the console
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
