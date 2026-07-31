"use client";

import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";

/* ── การเคลื่อนไหวบนเว็บหลัก ───────────────────────────────────
   ทุกตัวในไฟล์นี้ทำงานเมื่อเลื่อนถึงเท่านั้น และหยุดสังเกตทันทีที่เห็นแล้ว
   ครั้งเดียว — การเคลื่อนไหวที่วนซ้ำทุกครั้งที่เลื่อนผ่านกลายเป็นสิ่งกวนใจ
   ตั้งแต่ครั้งที่สอง

   ทุกตัวเคารพ prefers-reduced-motion ผ่าน CSS (`.reveal` ใน globals.css)
   และผ่าน hook `useReducedMotion` สำหรับตัวที่คำนวณค่าใน JS —
   ตัวเลขที่ไล่ขึ้นต้องขึ้นค่าสุดท้ายทันที ไม่ใช่ไล่เร็วขึ้น
   ───────────────────────────────────────────────────────────── */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** เห็นแล้วหรือยัง — ใช้ร่วมกันทุกตัวในไฟล์นี้ */
export function useInView<T extends HTMLElement>(rootMargin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.06 },
    );
    io.observe(el);

    /* ── ตัวกันเนื้อหาหายถาวร ──

       สถานะตั้งต้นของทุกตัวคือ opacity 0 ถ้า observer ไม่เคยรายงาน
       เนื้อหาจะไม่โผล่เลย ไม่ใช่ "ไม่มีอนิเมชัน" แต่คือหน้าว่าง
       และเกิดขึ้นจริงได้: แท็บที่ถูกกู้คืนตอนอยู่เบื้องหลังมี
       visibilityState = hidden จน IntersectionObserver ไม่รายงานการตัดกัน
       (ยืนยันแล้วตอนทดสอบ — ทั้งหน้ายังอยู่ที่ opacity 0)

       การเคลื่อนไหวเป็นของเสริม เนื้อหาไม่ใช่ จึงตั้งเวลาปลดล็อกไว้
       ถ้าไม่มีสัญญาณภายในหนึ่งวินาทีครึ่ง ให้แสดงเลย */
    const failsafe = setTimeout(() => {
      setSeen(true);
      io.disconnect();
    }, 1500);

    return () => {
      clearTimeout(failsafe);
      io.disconnect();
    };
  }, [rootMargin]);

  return { ref, seen };
}

/** ทิศที่เนื้อหาเลื่อนเข้ามา — ใช้ให้สอดคล้องกับตำแหน่งบนหน้า
    คอลัมน์ซ้ายใช้ left คอลัมน์ขวาใช้ right กราฟิกใช้ scale */
export type RevealDir = "up" | "left" | "right" | "scale" | "fade";

const DIR_CLASS: Record<RevealDir, string> = {
  up: "reveal",
  left: "reveal reveal-l",
  right: "reveal reveal-r",
  scale: "reveal reveal-s",
  fade: "reveal reveal-f",
};

export function Reveal({
  children,
  delay = 0,
  dir = "up",
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  dir?: RevealDir;
  as?: ElementType;
  className?: string;
}) {
  const { ref, seen } = useInView<HTMLElement>();

  return (
    <Tag
      ref={ref}
      className={`${DIR_CLASS[dir]} ${seen ? "is-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/* ── Stagger ───────────────────────────────────────────────────
   ลูกแต่ละตัวเข้ามาไล่กัน แทนการเขียน delay={i * 70} มือทุกที่
   ซึ่งเดิมกระจายอยู่สิบกว่าจุดและค่า step ไม่ตรงกันเลย */
export function Stagger({
  children,
  step = 70,
  start = 0,
  dir = "up",
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  step?: number;
  start?: number;
  dir?: RevealDir;
  className?: string;
  as?: ElementType;
}) {
  const items = Children.toArray(children);
  return (
    <Tag className={className}>
      {items.map((child, i) => (
        <Reveal key={i} delay={start + i * step} dir={dir}>
          {child}
        </Reveal>
      ))}
    </Tag>
  );
}

/* ── ตัวเลขที่ไล่ขึ้น ──────────────────────────────────────────
   ตัวเลขบนหน้าเว็บนี้คือข้อโต้แย้ง ไม่ใช่ของประดับ การไล่ขึ้นทำให้
   สายตาหยุดที่ตัวเลขนานพอจะอ่านมันจริง ๆ

   รับสตริงที่มีตัวเลขอยู่ข้างในรูปแบบใดก็ได้ — "7,024" · "12.49%" ·
   "6×" · "฿786,800" — แยกส่วนที่ไม่ใช่ตัวเลขไว้เป็น prefix/suffix
   แล้วไล่แค่ตัวเลข จึงไม่ต้องแก้ค่าที่เรียกใช้อยู่แล้วทั้งเว็บ
   ถ้าหาตัวเลขไม่เจอ (เช่น "ตกลงกัน") แสดงตามเดิมทั้งก้อน */
const NUM_RE = /^([^\d]*)([\d,]+(?:\.\d+)?)([\s\S]*)$/;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function Numeral({
  value,
  duration = 1100,
  className = "",
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { ref, seen } = useInView<HTMLSpanElement>("0px 0px -8% 0px");
  const [shown, setShown] = useState<string | null>(null);

  /* ── ทำไมต้อง useMemo ──

     `NUM_RE.exec(value)` คืนอาร์เรย์ก้อนใหม่ทุกครั้งที่เรนเดอร์ ถ้าเอาก้อนนั้น
     ไปใส่ใน dependency ของ useEffect จะได้ลูปที่ไม่จบ: ทุกเฟรมเรียก setShown
     → เรนเดอร์ใหม่ → exec ได้ก้อนใหม่ → React เห็น dep เปลี่ยน → ล้าง effect
     แล้วเริ่มใหม่พร้อมรีเซ็ต t0 → ตัวเลขวิ่งขึ้นแล้วกระโดดกลับไปเริ่มใหม่
     ตลอดกาล ซึ่งคืออาการ "ตัวเลขดิ้นไม่หยุด"

     ผูก memo กับ `value` ซึ่งเป็นสตริง เทียบด้วยค่าได้ตรง ๆ จึงคงที่ข้ามเรนเดอร์ */
  const parsed = useMemo(() => {
    const m = NUM_RE.exec(value);
    if (!m) return null;
    const digits = m[2];
    const target = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(target)) return null;
    return {
      prefix: m[1],
      suffix: m[3],
      target,
      decimals: digits.includes(".") ? digits.split(".")[1].length : 0,
      grouped: digits.includes(","),
    };
  }, [value]);

  useEffect(() => {
    if (!seen || !parsed || reduced) return;

    let raf = 0;
    let done = false;
    const t0 = performance.now();
    const { target, decimals, grouped } = parsed;

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setShown(
        (target * easeOutCubic(p)).toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: grouped,
        }),
      );
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        /* คืนสตริงจริงเมื่อจบ จะได้ไม่เสี่ยงปัดค่าเพี้ยนจากการจัดรูปแบบเอง
           และตั้งธงไว้ ไม่ให้ cleanup ที่ตามมาเข้าใจว่ายังวิ่งอยู่ */
        done = true;
        setShown(null);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (!done) setShown(null);
    };
  }, [seen, parsed, duration, reduced]);

  /* ค่าที่แสดงตอนไล่ขึ้นถูกซ่อนจากโปรแกรมอ่านหน้าจอ — คนที่ฟังอยู่
     ไม่ควรได้ยินตัวเลขสิบค่ารัว ๆ ก่อนถึงค่าจริง */
  const mid = shown != null && parsed;
  return (
    <span ref={ref} className={`numeral ${className}`}>
      <span aria-hidden={mid ? true : undefined}>
        {mid ? `${parsed.prefix}${shown}${parsed.suffix}` : value}
      </span>
      {mid && <span className="sr-only">{value}</span>}
    </span>
  );
}

/* ── หัวเรื่องที่เข้ามาทีละบรรทัด ──────────────────────────────
   แบ่งด้วย \n ในข้อความที่ส่งเข้ามา ไม่ใช่เดาจากความกว้าง —
   การเดาจากความกว้างจะแตกคนละที่ทุกขนาดหน้าจอ */
export function LineReveal({
  text,
  step = 90,
  className = "",
}: {
  text: string;
  step?: number;
  className?: string;
}) {
  const { ref, seen } = useInView<HTMLSpanElement>();
  const lines = text.split("\n");
  return (
    <span ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="line-mask">
          <span
            className={`line-inner ${seen ? "is-in" : ""}`}
            style={{ transitionDelay: `${i * step}ms` }}
          >
            {line}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ── แถบความคืบหน้าการอ่าน ─────────────────────────────────────
   หน้าบนเว็บนี้ยาว การรู้ว่าเหลืออีกเท่าไรลดความรู้สึกว่าอ่านไม่จบ
   ใช้ scroll listener ธรรมดาแบบ passive — ถูกกว่าการวัดทุกเฟรม */
export function ReadingProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setPct(max > 0 ? (doc.scrollTop / max) * 100 : 0);
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="readbar" aria-hidden>
      <span style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
