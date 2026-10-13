import { ELIGIBILITY_TH, type Eligibility } from "@/lib/shared/vault";

/* สถานะการติดต่อ (Blueprint บท 5) — สีบอกระดับ คำบอกความหมาย · ไม่ใช้สีอย่างเดียว */
const TONE: Record<Eligibility, string> = {
  eligible: "c-pill c-pill-good",
  review_required: "c-pill c-pill-warn",
  suppressed: "c-pill c-pill-bad",
  channel_invalid: "c-pill",
};

export function EligibilityPill({ status }: { status: Eligibility }) {
  return <span className={`${TONE[status] ?? "c-pill"} whitespace-nowrap`}>{ELIGIBILITY_TH[status] ?? status}</span>;
}
