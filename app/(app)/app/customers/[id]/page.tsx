import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { activeTenantId } from "@/app/(app)/tenant";
import { findDuplicates, getCustomer, type TimelineItem } from "@/lib/engine/customers";
import { profileFor } from "@/lib/shared/tenants";
import { CONTACT_KIND_LABEL, CONTACT_KIND_ORDER } from "@/lib/shared/contact-kinds";
import { FIELD_LABEL } from "@/lib/shared/ingest-types";
import { notConnectedTh } from "@/lib/shared/plays";
import { daysAgoLabel, thaiDate } from "@/lib/shared/format";
import { Metric, Panel, baht, num } from "@/components/console/ui";
import { ActionForm } from "@/components/console/action-form";
import {
  addContactAction,
  deleteCustomerAction,
  mergeCustomerAction,
  removeContactAction,
  revealContactAction,
  setConsentAction,
  updateCustomerAction,
} from "../../../customers-actions";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  pos: "หน้าร้าน",
  marketplace: "มาร์เก็ตเพลส",
  line_booking: "จองผ่าน LINE",
  walk_up: "ซื้อที่จุดขาย",
  pro_shop: "โปรช็อป",
  online_booking: "จองออนไลน์",
  branch_office: "สาขา",
  online_transfer: "โอนออนไลน์",
  campaign: "หลังได้รับแคมเปญ",
};

const EVENT_LABEL: Record<string, string> = {
  visit: "เข้ามาเยี่ยมชม",
  booking: "จองบริการ",
  form: "กรอกฟอร์ม",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "บันทึกในหน้านี้",
  csv_import: "จากไฟล์ที่นำเข้า",
  signup_form: "จากฟอร์มสมัคร",
  line_oa: "จาก LINE OA",
  seed: "ข้อมูลตัวอย่าง",
};

type Item = TimelineItem;

function TimelineRow({ item, verb }: { item: Item; verb: string }) {
  let title: ReactNode;
  let detail: ReactNode = null;
  let dot = "var(--c-text-4)";
  switch (item.kind) {
    case "purchase":
      dot = "var(--c-accent)";
      title = `${verb} ${baht(item.total)}`;
      detail = [
        item.items.join(" · "),
        CHANNEL_LABEL[item.channel] ?? item.channel,
        item.discount > 0 ? `ส่วนลด ${baht(item.discount)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    case "message":
      dot = "var(--c-cyan)";
      title =
        item.status === "simulated"
          ? `จำลองการ${item.engine === "reach" ? "ส่งรายชื่อให้โฆษณา" : "ส่งข้อความ"}: ${item.play}`
          : `${item.engine === "reach" ? "อยู่ในกลุ่มเป้าหมายโฆษณา" : "ได้รับข้อความ"}: ${item.play}`;
      detail =
        item.status === "simulated" ? (
          <>
            ยังไม่ได้เชื่อม{notConnectedTh(item.engine).channel} จึง{notConnectedTh(item.engine).nothingSent} ·{" "}
            <Link href={`/app/campaigns/${item.campaignId}`} className="underline underline-offset-4">
              ดูแคมเปญ
            </Link>
          </>
        ) : (
          <Link href={`/app/campaigns/${item.campaignId}`} className="underline underline-offset-4">
            ดูแคมเปญ
          </Link>
        );
      break;
    case "holdout":
      title = `อยู่ในกลุ่มควบคุมของ ${item.play}`;
      detail = "ตั้งใจไม่ส่งข้อความหาคนนี้ เพื่อใช้เทียบว่าแคมเปญได้ผลจริงไหม";
      break;
    case "event":
      title = EVENT_LABEL[item.type] ?? item.type;
      break;
    case "consent":
      dot = item.granted ? "var(--c-good)" : "var(--c-bad)";
      title = item.granted ? "ให้ความยินยอมรับข่าวสาร" : "ถอนความยินยอม";
      detail = SOURCE_LABEL[item.source] ?? item.source;
      break;
    case "created":
      title = "เพิ่มเข้าระบบ";
      break;
  }
  return (
    <li className="relative grid grid-cols-[6.5rem_1fr] gap-4 py-3">
      <span className="c-thai text-[0.8rem] text-[var(--c-text-3)]">{thaiDate(item.at)}</span>
      <div className="min-w-0 border-l border-[var(--c-line)] pl-4">
        <span
          aria-hidden
          className="absolute mt-2 ml-[-1.28rem] h-2 w-2 rounded-full"
          style={{ background: dot }}
        />
        <p className="c-thai text-[0.9rem] text-[var(--c-text)]">{title}</p>
        {detail && <p className="c-thai mt-0.5 text-[0.8rem] text-[var(--c-text-3)]">{detail}</p>}
      </div>
    </li>
  );
}

const PROFILE_INPUTS: { name: string; label: string; type?: string; wide?: boolean }[] = [
  { name: "first_name", label: FIELD_LABEL.first_name },
  { name: "last_name", label: FIELD_LABEL.last_name },
  { name: "nickname", label: FIELD_LABEL.nickname },
  { name: "birthday", label: FIELD_LABEL.birthday, type: "date" },
  { name: "company", label: FIELD_LABEL.company },
  { name: "job_title", label: FIELD_LABEL.job_title },
  { name: "subdistrict", label: FIELD_LABEL.subdistrict },
  { name: "district", label: FIELD_LABEL.district },
  { name: "province", label: FIELD_LABEL.province },
  { name: "postcode", label: FIELD_LABEL.postcode },
];

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tenantId = await activeTenantId();
  const cid = decodeURIComponent(id);
  const [c, dupes] = await Promise.all([getCustomer(tenantId, cid), findDuplicates(tenantId, cid)]);
  if (!c) notFound();
  const v = profileFor(tenantId).vocab.th;

  const s = c.stats;
  const cycle = s.cycleDays ?? s.modelCycleDays;
  const since = s.lastAt ? Math.floor((Date.now() - Date.parse(s.lastAt)) / 86400000) : null;
  const ratio = cycle && since != null ? since / Math.max(1, cycle) : null;
  const status =
    !s.orders
      ? { text: `ยังไม่เคย${v.purchaseVerb}`, tone: "muted" as const }
      : ratio == null
        ? { text: "ยังบอกรอบไม่ได้", tone: "muted" as const }
        : ratio <= 1
          ? { text: "อยู่ในรอบปกติ", tone: "good" as const }
          : ratio <= 2
            ? { text: "เลยรอบปกติมาแล้ว", tone: "plain" as const }
            : { text: `หายไปนานกว่าปกติ ${ratio.toFixed(1)} เท่า`, tone: "bad" as const };

  const p = c.profile;
  const shown = c.timeline.slice(0, 80);

  return (
    <>
      <Link href="/app/customers" className="c-thai text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← {v.people}ทั้งหมด
      </Link>

      {sp.created === "1" && (
        <p role="status" className="c-msg c-msg-ok mt-4">
          เพิ่ม{v.person}แล้ว — ไฟล์ที่นำเข้าทีหลังซึ่งมีเบอร์ อีเมล หรือรหัสเดียวกัน จะเติมประวัติให้คนนี้
        </p>
      )}

      {typeof sp.merged === "string" && (
        <p role="status" className="c-msg c-msg-ok mt-4">
          รวมแล้ว · ย้ายประวัติมา {num(Number(sp.merged) || 0)} รายการ — บรีฟจะเห็นข้อมูลที่รวมแล้วหลังคำนวณข้อมูลลูกค้ารอบถัดไป
        </p>
      )}

      <header className="mt-4 mb-6">
        <h1 className="c-h1 text-[var(--c-text)]">{c.name}</h1>
        <p className="c-thai mt-2 text-[0.84rem] text-[var(--c-text-3)]">
          เพิ่มเมื่อ {thaiDate(c.createdAt)}
          {c.membership && (
            <>
              {" · "}สมาชิกตั้งแต่ {thaiDate(c.membership.startedAt)}
              {c.membership.expiresAt && ` · หมดอายุ ${thaiDate(c.membership.expiresAt)}`}
            </>
          )}
          {p?.nickname && ` · ชื่อเล่น ${p.nickname}`}
        </p>
      </header>

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4 md:p-6">
        <Metric label={`${v.spend}รวม`} value={s.orders ? baht(s.spent) : "—"} />
        <Metric
          label={`${v.purchase}ทั้งหมด`}
          value={s.orders ? `${num(s.orders)} ครั้ง` : "—"}
          sub={s.orders ? `เฉลี่ยครั้งละ ${baht(s.avgOrder)}` : undefined}
        />
        <Metric
          label={`${v.purchase}ล่าสุด`}
          value={s.lastAt ? daysAgoLabel(s.lastAt) : "—"}
          sub={s.lastAt ? thaiDate(s.lastAt) : undefined}
        />
        <Metric
          label="รอบปกติของคนนี้"
          value={status.text}
          tone={status.tone}
          size="sm"
          sub={
            cycle
              ? `${v.purchaseVerb}ทุกราว ${num(cycle)} วัน${s.cycleDays == null ? " (ประมาณจากคนที่ซื้อแบบเดียวกัน)" : ""}`
              : undefined
          }
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="p-5">
            <h2 className="c-h2 text-[var(--c-text)]">ช่องทางติดต่อ</h2>
            <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
              แสดงแบบปิดบางส่วน กด "แสดง" เพื่อดูค่าเต็ม — ระบบบันทึกทุกครั้งว่าใครเปิดดู
            </p>
            {c.contacts.length ? (
              <ul className="mt-4 flex flex-col divide-y divide-[var(--c-line)]">
                {c.contacts.map((pt) => (
                  <li key={pt.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="c-thai text-[0.78rem] text-[var(--c-text-3)]">
                        {CONTACT_KIND_LABEL[pt.kind] ?? pt.kind}
                        {pt.label && ` · ${pt.label}`}
                        {pt.isPrimary && c.contacts.filter((x) => x.kind === pt.kind).length > 1 && " · หลัก"}
                      </span>
                      <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
                        {SOURCE_LABEL[pt.source] ?? pt.source}
                      </span>
                    </div>
                    <p className="c-mono mt-1 break-all text-[0.9rem] text-[var(--c-text)]">{pt.masked}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionForm
                        action={revealContactAction}
                        fields={{ tenantId, pointId: pt.id }}
                        label="แสดง"
                        pendingLabel="กำลังเปิด…"
                        size="sm"
                      />
                      <ActionForm
                        action={removeContactAction}
                        fields={{ tenantId, pointId: pt.id, customerId: c.id }}
                        label="ลบ"
                        confirm="กดอีกครั้งเพื่อลบ"
                        pendingLabel="กำลังลบ…"
                        size="sm"
                        variant="danger"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="c-thai mt-4 text-[0.85rem] text-[var(--c-text-3)]">ยังไม่มีช่องทางติดต่อ</p>
            )}

            <details className="mt-4">
              <summary className="c-thai cursor-pointer text-[0.86rem] text-[var(--c-accent)]">+ เพิ่มช่องทาง</summary>
              <ActionForm
                action={addContactAction}
                fields={{ tenantId, customerId: c.id }}
                label="เพิ่ม"
                pendingLabel="กำลังเพิ่ม…"
                variant="primary"
                size="sm"
                className="mt-3 flex flex-col gap-2.5"
              >
                <label className="c-thai flex flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                  ช่องทาง
                  <select name="kind" className="c-select" defaultValue="phone">
                    {CONTACT_KIND_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {CONTACT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="c-thai flex flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                  ค่า
                  <input name="value" required className="c-input" autoComplete="off" />
                </label>
                <label className="c-thai flex flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                  ป้ายกำกับ (ไม่บังคับ)
                  <input name="label" placeholder="เช่น ที่ทำงาน · เบอร์บ้าน" className="c-input" />
                </label>
              </ActionForm>
            </details>
          </Panel>

          <Panel className="p-5">
            <h2 className="c-h2 text-[var(--c-text)]">การรับข่าวสาร</h2>
            <p
              className={`c-thai mt-2 text-[0.9rem] ${c.consent.granted ? "text-[var(--c-good)]" : "text-[var(--c-text-2)]"}`}
            >
              {c.consent.granted ? "ยินยอมรับข่าวสารแล้ว" : "ยังไม่ยินยอม — ระบบจะไม่ส่งข้อความหาคนนี้"}
            </p>
            {c.consent.at && (
              <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
                {c.consent.granted ? "ให้ความยินยอมเมื่อ" : "ถอนเมื่อ"} {thaiDate(c.consent.at)}
                {c.consent.source && ` · ${SOURCE_LABEL[c.consent.source] ?? c.consent.source}`}
              </p>
            )}
            <div className="mt-3">
              {c.consent.granted ? (
                <ActionForm
                  action={setConsentAction}
                  fields={{ tenantId, customerId: c.id, granted: "0" }}
                  label="ถอนความยินยอม"
                  confirm="กดอีกครั้งเพื่อถอน"
                  pendingLabel="กำลังบันทึก…"
                  size="sm"
                />
              ) : (
                <ActionForm
                  action={setConsentAction}
                  fields={{ tenantId, customerId: c.id, granted: "1" }}
                  label="บันทึกว่าลูกค้ายินยอมแล้ว"
                  confirm="ยืนยัน — ลูกค้าให้ความยินยอมกับร้านจริง"
                  pendingLabel="กำลังบันทึก…"
                  size="sm"
                />
              )}
            </div>
          </Panel>

          <Panel className="p-5">
            <h2 className="c-h2 text-[var(--c-text)]">ข้อมูลส่วนตัว</h2>
            <ActionForm
              action={updateCustomerAction}
              fields={{ tenantId, customerId: c.id }}
              label="บันทึก"
              pendingLabel="กำลังบันทึก…"
              variant="primary"
              size="sm"
              className="mt-4 flex flex-col gap-3"
            >
              <label className="c-thai flex flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                ชื่อที่แสดง
                <input name="name" defaultValue={c.name} required className="c-input" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PROFILE_INPUTS.map((f) => (
                  <label key={f.name} className="c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                    {f.label}
                    <input
                      name={f.name}
                      type={f.type ?? "text"}
                      defaultValue={(p?.[f.name as keyof typeof p] as string | null) ?? ""}
                      className="c-input min-w-0"
                    />
                  </label>
                ))}
                <label className="c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                  {FIELD_LABEL.gender}
                  <select name="gender" defaultValue={p?.gender ?? ""} className="c-select">
                    <option value="">ไม่ระบุ</option>
                    <option value="female">หญิง</option>
                    <option value="male">ชาย</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </label>
              </div>
              <label className="c-thai flex flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                {FIELD_LABEL.note}
                <textarea name="note" rows={3} defaultValue={p?.note ?? ""} className="c-input" />
              </label>
            </ActionForm>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ประวัติ</h2>
            <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
              {v.purchase} ข้อความ แคมเปญ และความยินยอม เรียงจากล่าสุด
            </p>
            <ol className="mt-3">
              {shown.map((item, i) => (
                <TimelineRow key={`${item.kind}-${item.at}-${i}`} item={item} verb={v.purchaseVerb} />
              ))}
            </ol>
            {c.timeline.length > shown.length && (
              <p className="c-thai mt-3 text-[0.8rem] text-[var(--c-text-4)]">
                แสดง {num(shown.length)} รายการล่าสุด จากทั้งหมด {num(c.timeline.length)}
              </p>
            )}
          </Panel>

          {dupes.length > 0 && (
            <Panel className="p-5 md:p-6">
              <h2 className="c-h2 text-[var(--c-text)]">อาจเป็นคนเดียวกัน</h2>
              <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">
                ถ้าใช่ กด "รวมเข้าคนนี้" — ประวัติ{v.purchase} ช่องทางติดต่อ และแคมเปญของอีกคนจะย้ายมาที่นี่
                แล้วอีกคนจะหายไป ถ้าฝั่งใดเคยถอนความยินยอม ผลรวมจะยังถือว่าถอน
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-[var(--c-line)]">
                {dupes.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/app/customers/${d.id}`} className="text-[var(--c-text)] underline-offset-4 hover:underline">
                        {d.name}
                      </Link>
                      <p className="c-thai text-[0.78rem] text-[var(--c-text-4)]">{d.reason}</p>
                    </div>
                    <ActionForm
                      action={mergeCustomerAction}
                      fields={{ tenantId, customerId: c.id, otherId: d.id }}
                      label="รวมเข้าคนนี้"
                      confirm={`กดอีกครั้งเพื่อรวม ${d.name} เข้ากับ ${c.name}`}
                      pendingLabel="กำลังรวม…"
                      size="sm"
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel flat className="border-[var(--c-bad)]/40 p-5">
            <h2 className="c-h2 text-[var(--c-text)]">ลบ{v.person}คนนี้</h2>
            <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
              ลบชื่อ ช่องทางติดต่อ ประวัติ{v.purchase} และความยินยอมของคนนี้ออกทั้งหมด ย้อนกลับไม่ได้ —
              ใช้เมื่อลูกค้าขอให้ลบข้อมูล ผลวัดของแคมเปญที่สรุปไปแล้วไม่เปลี่ยน เพราะเป็นตัวเลขรวมของกลุ่ม
            </p>
            <ActionForm
              action={deleteCustomerAction}
              fields={{ tenantId, customerId: c.id }}
              label={`ลบ${v.person}คนนี้`}
              confirm={`กดอีกครั้งเพื่อลบ ${c.name} ถาวร`}
              pendingLabel="กำลังลบ…"
              variant="danger"
              size="sm"
              className="mt-3"
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
