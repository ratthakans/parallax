import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { activeMode, activeTenantId } from "@/app/(app)/tenant";
import { findDuplicates, getCustomer, type TimelineItem } from "@/lib/engine/customers";
import { requestsFor } from "@/lib/engine/dsar";
import { DSAR_KIND_TH } from "@/lib/shared/dsar";
import { DueBadge } from "@/components/console/dsar-badge";
import { profileFor } from "@/lib/shared/tenants";
import { CONTACT_KIND_LABEL, CONTACT_KIND_ORDER } from "@/lib/shared/contact-kinds";
import { FIELD_LABEL } from "@/lib/shared/ingest-types";
import { notConnectedTh } from "@/lib/shared/plays";
import { daysAgoLabel, thaiDate } from "@/lib/shared/format";
import { Panel, baht, num } from "@/components/console/ui";
import { RecordHeader, RecordTabs, pickTab } from "@/components/console/record";
import { NoteCapture } from "@/components/console/note-capture";
import { viewer } from "@/app/(app)/viewer";
import { personB2B } from "@/lib/engine/accounts/person";
import { dealsOfPerson } from "@/lib/engine/deals";
import { listBases } from "@/lib/engine/policy";
import { PreferenceForm } from "@/components/console/preference-form";
import { listTasks } from "@/lib/engine/tasks";
import { teamMembers } from "@/lib/engine/team";
import { NewTaskForm, TaskList } from "@/components/console/tasks";
import { personIdsOf } from "@/lib/engine/vault/merge";
import { dealRoleTh, stageTh } from "@/lib/shared/deals";
import { hasB2B, hasB2C } from "@/lib/shared/tenants";
import { INTERACTION_TH, type InteractionKind } from "@/lib/shared/accounts";
import { ELIGIBILITY_TH, PREFERENCE_TH, type Eligibility } from "@/lib/shared/vault";
import { TARGET_STATUS_TH, type TargetStatus } from "@/lib/shared/policy";
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

export const metadata = { title: "ผู้ติดต่อ" };
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
            ยังไม่ได้เชื่อม {notConnectedTh(item.engine).channel} จึง{notConnectedTh(item.engine).nothingSent} ·{" "}
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
  const [c, dupes, requests] = await Promise.all([getCustomer(tenantId, cid), findDuplicates(tenantId, cid), requestsFor(tenantId, cid)]);
  if (!c) notFound();
  const v = profileFor(tenantId).vocab.th;
  /* บัญชี B2B ได้หน้าระเบียนแบบผู้ติดต่อ (สังกัด · แคมเปญ · กิจกรรม) — บัญชีค้าปลีกเดิมได้ตัวเลขการซื้อตามเดิม */
  const me = await viewer();
  const mode = await activeMode();
  /* ส่วน CRM (สังกัด · ดีล · งาน · กิจกรรม · ความยินยอมแบบนโยบาย) ใช้ได้ทุกโหมด — บัญชีขายให้บุคคลก็ขายด้วยดีลและติดตามด้วยงาน (QA รอบ 2 · R2-02) */
  const b2b = await personB2B(tenantId, cid, { id: me.actor, clearance: me.clearance });
  const purposes = b2b ? (await listBases(tenantId)).map((b) => ({ id: b.purpose_id, name: b.name })) : [];
  const deals = b2b ? await dealsOfPerson(tenantId, await personIdsOf(tenantId, cid), { id: me.actor, clearance: me.clearance }) : [];
  const [personTasks, team] = b2b
    ? await Promise.all([listTasks(tenantId, "open", { id: me.actor, clearance: me.clearance }, new Date(), { personId: cid }), teamMembers(tenantId, me.actor)])
    : [[], []];
  const currentJob = b2b?.jobs.find((j) => j.current) ?? null;

  const s = c.stats;
  /* ทั้งสองแบบ (docs/crm-plan.md F2) — สลับตามระเบียน ไม่ใช่ตามบัญชี:
     ส่วนบริษัทเมื่อคนนี้มีสังกัด · ส่วนการซื้อเมื่อเคยซื้อหรือเป็นลูกค้าบุคคล · ดีล งาน กิจกรรม ความยินยอม ใช้กับทุกคน */
  const indiv = hasB2C(mode);
  const orgPerson = !!b2b?.jobs.length;
  const showPurchases = indiv && (s.orders > 0 || !orgPerson);
  const showJobs = !indiv || orgPerson;
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

  const TABS = ["overview", "details", "consent", "manage"] as const;
  const tab = pickTab(TABS, typeof sp.tab === "string" ? sp.tab : undefined);
  const base = `/app/customers/${encodeURIComponent(c.id)}`;
  const kinds = [...new Set(c.contacts.map((x) => x.kind))];
  const openRequests = requests.filter((r) => r.status === "open").length;

  return (
    <>
      {sp.created === "1" && (
        <p role="status" className="c-msg c-msg-ok mt-4">
          เพิ่ม{v.person}แล้ว — ไฟล์ที่นำเข้าทีหลังซึ่งมี{!indiv ? "เบอร์หรืออีเมลเดียวกัน" : "เบอร์ อีเมล LINE หรือรหัสสมาชิกเดียวกัน"} จะเติมประวัติให้คนนี้
        </p>
      )}

      {typeof sp.merged === "string" && (
        <p role="status" className="c-msg c-msg-ok mt-4">
          รวมแล้ว · ย้ายประวัติมา {num(Number(sp.merged) || 0)} รายการ — บรีฟจะเห็นข้อมูลที่รวมแล้วหลังคำนวณข้อมูลลูกค้ารอบถัดไป
        </p>
      )}


      <RecordHeader
        back={{ href: "/app/customers", label: `${v.people}ทั้งหมด` }}
        kind={indiv && !orgPerson ? (hasB2B(mode) ? "ลูกค้าบุคคล" : v.person) : "ผู้ติดต่อ"}
        title={c.name}
        badges={<>
          {b2b?.stop && <span className="c-pill c-pill-bad">{PREFERENCE_TH[b2b.stop]}แล้ว</span>}
          {mode === "b2c" && <span className={`c-pill ${c.consent.granted ? "c-pill-good" : ""}`}>{c.consent.granted ? "ยินยอมรับข่าวสาร" : "ยังไม่ยินยอมรับข่าวสาร"}</span>}
          {openRequests > 0 && <span className="c-pill c-pill-warn">คำขอสิทธิเปิดอยู่ {openRequests}</span>}
          {p?.nickname && <span className="c-pill">ชื่อเล่น {p.nickname}</span>}
        </>}
        actions={b2b ? <a href="#activity" className="c-btn c-btn-ghost c-btn-sm xl:hidden">บันทึกกิจกรรม</a> : undefined}
        highlights={b2b ? [
          ...(showJobs ? [
            { label: "ตำแหน่ง", value: currentJob?.title ?? "ไม่ทราบ" },
            { label: "บริษัท", value: currentJob ? (currentJob.visible ? <Link href={`/app/accounts/${currentJob.orgId}`} className="text-[var(--c-accent)] hover:underline">{currentJob.org}</Link> : currentJob.org) : "ไม่ทราบ" },
          ] : []),
          ...(showPurchases ? [
            { label: "ยอดซื้อรวม", value: s.orders ? `${baht(s.spent)} · ${num(s.orders)} ครั้ง` : "ยังไม่เคยซื้อ" },
            { label: "ซื้อล่าสุด", value: s.lastAt ? daysAgoLabel(s.lastAt) : "—" },
            ...(s.orders ? [{ label: "รอบปกติ", value: status.text }] : []),
          ] : []),
          { label: "ช่องทาง", value: kinds.length ? kinds.map((k) => CONTACT_KIND_LABEL[k]).join(" · ") : "ไม่มี" },
          { label: "ติดต่อล่าสุด", value: b2b.interactions[0] ? thaiDate(b2b.interactions[0].at) : "ยังไม่เคย" },
          ...(showPurchases ? [] : [{ label: "แคมเปญ", value: num(b2b.campaigns.length) }]),
          { label: "เพิ่มเมื่อ", value: thaiDate(c.createdAt) },
        ] : [
          { label: `${v.spend}รวม`, value: s.orders ? baht(s.spent) : "—" },
          { label: `${v.purchase}ทั้งหมด`, value: s.orders ? `${num(s.orders)} ครั้ง` : "—" },
          { label: `${v.purchase}ล่าสุด`, value: s.lastAt ? daysAgoLabel(s.lastAt) : "—" },
          { label: "รอบปกติ", value: status.text },
          { label: "ช่องทาง", value: kinds.length ? kinds.map((k) => CONTACT_KIND_LABEL[k]).join(" · ") : "ไม่มี" },
          { label: "เพิ่มเมื่อ", value: thaiDate(c.createdAt) },
        ]}
      />

      <div className={`grid gap-5 ${b2b ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <div className="min-w-0">
          <RecordTabs base={base} active={tab} tabs={[
            { key: "overview", label: "ภาพรวม" },
            { key: "details", label: "รายละเอียด" },
            { key: "consent", label: "ความยินยอม" },
            { key: "manage", label: "จัดการ" },
          ]} />
          <div className="grid min-w-0 content-start gap-5">
            {tab === "overview" && <>
              {b2b && <>
          {showJobs && <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">สังกัดตามเวลา</h2>
            {b2b!.jobs.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {b2b!.jobs.map((j, i) => (
                  <li key={`${j.orgId}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <span className="c-thai min-w-0 text-[0.92rem]">
                      {j.visible ? <Link href={`/app/accounts/${j.orgId}`} className="text-[var(--c-accent)] hover:underline">{j.org}</Link> : <span className="text-[var(--c-text-3)]">{j.org}</span>}
                      <span className="text-[var(--c-text-3)]"> · {j.title ?? "ไม่ทราบตำแหน่ง"}</span>
                      {!j.current && <span className="c-pill ml-2">ออกแล้ว</span>}
                    </span>
                    <span className="c-thai text-[0.8rem] text-[var(--c-text-3)]">{j.from ? thaiDate(j.from) : "ไม่ทราบวันเริ่ม"} – {j.to ? thaiDate(j.to) : "ปัจจุบัน"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ไม่ทราบ — ยังไม่มีสังกัดในฐาน</p>}
          </Panel>}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ดีล</h2>
            {deals.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {deals.map((x) => (
                  <li key={x.id} className="c-thai flex flex-wrap items-baseline justify-between gap-2 py-2 text-[0.88rem]">
                    <span className="min-w-0">
                      <Link href={`/app/deals/${x.id}`} className="text-[var(--c-accent)] hover:underline">{x.name}</Link>
                      {!x.own && <span className="text-[var(--c-text-3)]"> · {x.org}</span>}
                    </span>
                    <span className="flex gap-1.5">
                      {x.own && <span className="c-pill">ดีลของลูกค้าคนนี้</span>}
                      {x.role && <span className="c-pill">{dealRoleTh(x.role)}</span>}
                      <span className="c-pill">{stageTh(x.stage)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่อยู่ในดีลใด{showPurchases ? "" : " — เพิ่มได้จากหน้าดีล (คนในดีล)"}</p>}
            {/* ดีลกับลูกค้าบุคคล (F3) — บัญชีที่มีลูกค้าบุคคล และคนนี้ไม่ได้มาในนามบริษัท */}
            {hasB2C(mode) && !orgPerson && <Link href={`/app/deals/new?person=${encodeURIComponent(c.id)}`} className="c-btn c-btn-ghost c-btn-sm mt-3 inline-flex">+ ดีลกับลูกค้าคนนี้</Link>}
          </Panel>
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">แคมเปญ</h2>
            {b2b!.campaigns.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {b2b!.campaigns.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/app/sales/${x.id}`} className="c-thai text-[0.92rem] text-[var(--c-accent)] hover:underline">{x.name}</Link>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`c-pill ${x.eligibility === "eligible" ? "c-pill-good" : x.eligibility === "suppressed" ? "c-pill-bad" : "c-pill-warn"}`}>{ELIGIBILITY_TH[x.eligibility as Eligibility] ?? x.eligibility}</span>
                      <span className="c-pill">{TARGET_STATUS_TH[x.status as TargetStatus] ?? x.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่อยู่ในแคมเปญใด</p>}
          </Panel>
              </>}
              {showPurchases && <>
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">{b2b ? "ประวัติการซื้อ" : "ประวัติ"}</h2>
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

              </>}
          <Panel className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">คำขอสิทธิ</h2>
              <Link href={`/app/requests?subject=${encodeURIComponent(c.id)}`} className="c-thai text-[0.84rem] text-[var(--c-cyan)] underline underline-offset-4">
                บันทึกคำขอของคนนี้
              </Link>
            </div>
            <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">
              คนนี้ขอดูข้อมูล ขอลบ ถอน หรือคัดค้าน — บันทึกเป็นคำขอเพื่อเริ่มนับ 30 วัน และให้ระบบทำตามคำขอเมื่อปิดเรื่อง
            </p>
            {requests.length > 0 && (
              <ul className="mt-3 flex flex-col divide-y divide-[var(--c-line)]">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/app/requests/${r.id}`} className="c-thai text-[0.86rem] text-[var(--c-text)] underline-offset-4 hover:underline">
                      <span className="c-mono">{r.ref}</span> · {DSAR_KIND_TH[r.kind]}
                    </Link>
                    <DueBadge r={r} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

            </>}
            {tab === "details" && <>
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

            </>}
            {tab === "consent" && <>
          {b2b && (
            <Panel className="p-5 md:p-6">
              <h2 className="c-h2 text-[var(--c-text)]">ความยินยอม · ถอน · คัดค้าน</h2>
              <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">บันทึกแบบเพิ่มอย่างเดียว พร้อมหลักฐาน — การตัดสินว่าติดต่อได้ไหมต่อแคมเปญอยู่ที่บริการนโยบาย</p>
              {b2b.preferences.length ? (
                <ul className="mt-3 divide-y divide-[var(--c-line)]">
                  {b2b.preferences.map((x, i) => (
                    <li key={i} className="py-2.5">
                      <p className="c-thai text-[0.9rem] text-[var(--c-text)]">
                        <span className={`c-pill mr-2 ${x.kind === "consent" ? "c-pill-good" : "c-pill-bad"}`}>{PREFERENCE_TH[x.kind]}</span>
                        {x.purpose ?? "ทุกวัตถุประสงค์"} · {x.channel === "any" ? "ทุกช่องทาง" : x.channel}
                      </p>
                      <p className="c-thai mt-0.5 text-[0.78rem] text-[var(--c-text-3)]">{thaiDate(x.at)} · บันทึกโดย {x.by}{x.note ? ` · ${x.note}` : ""}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีบันทึก</p>}
              <div className="mt-4 border-t border-[var(--c-line)] pt-4">
                <PreferenceForm customerId={c.id} back={`/app/customers/${c.id}`} purposes={purposes} />
              </div>
            </Panel>
          )}
          {/* ความยินยอมรับข่าวสารแบบค้าปลีก — บัญชี B2B ใช้แผงด้านบน (บริการนโยบายตัดสินต่อวัตถุประสงค์) ไม่แสดงสองระบบซ้อนกัน (BUG-17) */}
          {/* ความยินยอมรับข่าวแบบค้าปลีกเดิม (consents) — ใช้กับแคมเปญส่งข้อความเดิม มีเฉพาะบัญชีขายให้บุคคล */}
          {mode === "b2c" && <Panel className="p-5">
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
          </Panel>}

            </>}
            {tab === "manage" && <>
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
              · อีเมลและเบอร์ถูกจำไว้แบบเข้ารหัสทางเดียวในทะเบียนการลบ เพื่อไม่ให้นำเข้าซ้ำจากไฟล์เก่า
            </p>
            <ActionForm
              action={deleteCustomerAction}
              fields={{ tenantId, customerId: c.id }}
              label={`ลบ${v.person}คนนี้`}
              confirm={`กดอีกครั้งเพื่อลบ ${c.name} ถาวร`}
              pendingLabel="กำลังลบ…"
              variant="danger"
              size="sm"
              className="mt-3 grid gap-3 sm:grid-cols-2"
            >
              <label className="c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">เหตุที่ลบ
                <select name="reason" className="c-select" defaultValue="request">
                  <option value="request">ตามคำขอของเจ้าของข้อมูล</option>
                  <option value="retention">ครบอายุข้อมูล</option>
                  <option value="manual">อื่น ๆ (ผู้ใช้ลบ)</option>
                </select>
              </label>
              <label className="c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">อ้างอิงคำขอ (ถ้ามี)
                <input name="requestRef" className="c-input" placeholder="เช่น เลขเรื่อง DSAR-2026-014" maxLength={120} />
              </label>
            </ActionForm>
          </Panel>
            </>}
          </div>
        </div>
        {b2b && (
          <aside id="activity" className="grid min-w-0 scroll-mt-28 content-start gap-5">
          <Panel className="p-4 md:p-5">
            <h2 className="c-h2 text-[var(--c-text)]">งาน <span className="text-[var(--c-text-4)]">({personTasks.length})</span></h2>
            <div className="mt-3"><TaskList tasks={personTasks} link={{ personId: c.id }} showRecord /></div>
            <details className="mt-3">
              <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer list-none">+ งาน</summary>
              <div className="mt-3"><NewTaskForm link={{ personId: c.id, orgId: currentJob?.visible ? currentJob.orgId : undefined }} team={team} compact /></div>
            </details>
          </Panel>
          <Panel className="p-4 md:p-5">
            <h2 className="c-h2 text-[var(--c-text)]">กิจกรรม</h2>
            {currentJob?.visible && (
              <div className="mt-3">
                <NoteCapture orgId={currentJob.orgId} people={[{ personId: c.id, name: c.name }]} subject={c.id} />
              </div>
            )}
            {b2b!.interactions.length ? (
              <ol className="mt-4 grid gap-0">
                {b2b!.interactions.slice(0, 30).map((i) => (
                  <li key={i.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-t border-[var(--c-line)] py-3 first:border-t-0">
                    <span className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{thaiDate(i.at)}</span>
                    <div className="c-thai min-w-0 text-[0.88rem] text-[var(--c-text-2)]">
                      <p className="text-[var(--c-text)]">{INTERACTION_TH[i.kind as InteractionKind] ?? i.kind}{i.org ? ` · ${i.org}` : ""}</p>
                      {i.masked ? <p className="text-[var(--c-text-4)]">บันทึกระดับสูง — เห็นเฉพาะผู้บันทึก</p> : <>
                        {i.summary && <p className="mt-0.5 whitespace-pre-line break-words">{i.summary}</p>}
                        {i.outcome && <p className="text-[var(--c-text-3)]">ผล: {i.outcome}</p>}
                      </>}
                      {i.owner && <p className="mt-0.5 text-[0.76rem] text-[var(--c-text-4)]">บันทึกโดย {i.owner}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีกิจกรรม</p>}
          </Panel>
          </aside>
        )}
      </div>
    </>
  );
}
