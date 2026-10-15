import { DSAR_STATUS_TH, DSAR_WARN_DAYS, type DsarRequest } from "@/lib/shared/dsar";

/* สถานะคำขอสิทธิพร้อมตัวนับวัน — ทะเบียนคำขอและหน้าคำขอ */
export function DueBadge({ r }: { r: DsarRequest }) {
  if (r.status !== "open") return <span className={`c-pill ${r.status === "done" ? "c-pill-good" : ""}`}>{DSAR_STATUS_TH[r.status]}</span>;
  if (r.daysLeft < 0) return <span className="c-pill c-pill-bad">เลยกำหนด {-r.daysLeft} วัน</span>;
  if (r.daysLeft <= DSAR_WARN_DAYS) return <span className="c-pill c-pill-warn">{r.daysLeft === 0 ? "ครบกำหนดวันนี้" : `เหลือ ${r.daysLeft} วัน`}</span>;
  return <span className="c-pill">เหลือ {r.daysLeft} วัน</span>;
}
