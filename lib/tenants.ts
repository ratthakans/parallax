import type { PlanId } from "./plans";
import type { CycleShape, GroupRole } from "./types";

/* ── ทะเบียนบัญชีตัวอย่าง ──────────────────────────────────────
   เพิ่มธุรกิจใหม่ = เพิ่มแถวในไฟล์นี้ ไม่ต้องแก้ตัวสร้างข้อมูล
   เส้นแบ่งเดียวกับคลัง play: โปรไฟล์เป็นข้อมูล ไม่ใช่ตรรกะ

   สี่บัญชีนี้ตั้งใจเลือกให้ "รูปทรงวงจรรายได้" ต่างกันทั้งสี่แบบ
   เพราะข้อความขายของ PARALLAX คือ engine ทำนายจากวงจร ไม่ใช่จาก
   อุตสาหกรรม ถ้าเดโมมีแต่ร้านค้าปลีก ข้อความนั้นพิสูจน์ไม่ได้
   ───────────────────────────────────────────────────────────── */

/** คำที่แต่ละธุรกิจใช้เรียกคนและการจ่ายเงิน — หน้าจอเดียวกันต้องอ่านถูก
    ทุกบัญชี ถ้าเขียน "ลูกค้า/ซื้อ" ตายตัว หน้าจอของพรรคจะอ่านไม่ได้ */
export type Vocab = {
  /** คนหนึ่งคนในฐาน */
  person: string;
  /** คนหลายคน */
  people: string;
  /** การจ่ายเงินหนึ่งครั้ง */
  purchase: string;
  /** ยอดเงินที่จ่าย */
  spend: string;
  /** ของหรือบริการที่ขาย */
  item: string;
  /** ฐานข้อมูลคนทั้งหมด */
  base: string;
  /** กลุ่มที่จ่ายมากที่สุด */
  topGroup: string;
  /** ตัวอย่างสองวงจรที่ต่างกันสุดขั้วในธุรกิจนี้ ใช้อธิบายว่าทำไมไม่ใช้เกณฑ์เดียวกับทุกคน */
  cycleExample: string;
  /** คำเรียกองค์กร — "ร้าน" ใช้กับPolitical partyไม่ได้ */
  orgKind: string;
  /** รูปกริยาของการจ่าย ใช้ต่อประโยค เช่น "กลับมา___ซ้ำ"
      ("การชำระ" เป็นคำนาม ต่อท้าย "กลับมา" ไม่ได้) */
  purchaseVerb: string;
};

export type CatalogueItem = {
  id: string;
  name: string;
  category: string;
  group_role: GroupRole;
  list_price: number;
  is_new_arrival?: boolean;
  is_dead_stock?: boolean;
};

export type TenantProfile = {
  id: string;
  name: string;
  industry: string;
  /** ที่มาของโปรไฟล์ — โชว์ในคอนโซลเพื่อไม่ให้เข้าใจผิดว่าเป็นข้อมูลจริง */
  source: string;
  cycleShape: CycleShape;
  /** แผนราคา — ค่าตรงกับ lib/plans.ts ที่หน้า /pricing อ่านตัวเดียวกัน */
  tier: PlanId;
  createdDaysAgo: number;
  vocab: Vocab;

  limits: {
    weeklyCap: number;
    quietStart: number;
    quietEnd: number;
    maxDiscountPct: number;
    credits: number;
  };

  scale: {
    people: number;
    everTransacted: number;
    repeat: number;
    recent30: number;
    silent90: number;
    /** สัดส่วนกลุ่มบนสุดที่สร้างรายได้กระจุกตัว */
    whaleShare: number;
    whaleTxns: [number, number];
    repeatTxns: [number, number];
    /** วงจรของกลุ่มบนสุด (วัน) */
    whaleCycle: [number, number];
    normalCycle: [number, number];
  };

  /** สัดส่วนที่ทักถึงทาง LINE ได้ */
  lineShare: number;
  /** สัดส่วนที่ไม่เคยให้ความยินยอมด้านการตลาด */
  noConsentShare: number;
  /** สัดส่วนที่ถอนความยินยอมแล้ว (คิดจากคนที่เคยให้) */
  revokedShare: number;

  membership: { kind: string; share: number; termDays: number } | null;

  /** สัดส่วนคนที่รอส่วนลด */
  discountSeekerShare: number;
  whaleDiscountShare: number;
  /** โอกาสที่รายการหนึ่งจะมีของหลัก */
  anchorProb: { whale: number; normal: number };
  /** ช่องทางที่บันทึกในธุรกรรม [ที่พบบ่อย, ที่พบน้อย] */
  channels: [string, string];

  catalogue: CatalogueItem[];

  /** เหตุการณ์ที่ไม่ใช่การซื้อ — ป้อนให้ play ที่ไม่ได้ดูแค่ยอดเงิน */
  events: {
    /** จำนวนครั้งที่ "มาแต่ไม่จ่าย" สูงสุดต่อคน */
    visitMax: number;
    /** สัดส่วนที่ใช้บริการที่ไม่ใช่การซื้อของ (events type=booking) */
    bookingShare: number;
    bookingLabel: string;
    /** สัดส่วนคนที่ยังไม่เคยจ่ายแต่ทิ้งข้อมูลไว้ */
    formShare: number;
  };

  /** ข้อจำกัดทางกฎหมายหรือจริยธรรมที่ต้องขึ้นเตือนในคอนโซล */
  compliance?: string;
  /** คำเตือนเรื่องการอ่านผล เมื่อวงจรของธุรกิจยาวกว่าหน้าต่างวัดผล 90 วัน */
  measurementCaveat?: string;

  seedKey: number;
};

/* ══════════════════════════════════════════════════════════════
   1 · MST Golf — Golf equipment retail สาขาเดียว
   ตัวเลขทั้งหกตรงกับ Playbook ห้ามขยับ
   ══════════════════════════════════════════════════════════════ */

const MST_GOLF: TenantProfile = {
  id: "mst-golf",
  name: "MST Golf",
  industry: "Golf equipment retail",
  source: "Dataset from the PARALLAX playbook",
  cycleShape: "considered",
  tier: "growth",
  createdDaysAgo: 400,
  vocab: {
    person: "customer",
    people: "customers",
    purchase: "purchase",
    spend: "spend",
    item: "product",
    base: "customer base",
    topGroup: "customers",
    cycleExample: "someone buying balls every month is nothing like someone replacing irons every two years",
    orgKind: "shop",
    purchaseVerb: "buy",
  },
  limits: { weeklyCap: 2, quietStart: 21, quietEnd: 9, maxDiscountPct: 20, credits: 2000 },
  scale: {
    people: 1240,
    everTransacted: 999,
    repeat: 707,
    recent30: 248,
    silent90: 585,
    whaleShare: 0.02,
    whaleTxns: [14, 22],
    repeatTxns: [2, 5],
    whaleCycle: [22, 38],
    normalCycle: [45, 155],
  },
  lineShare: 0.78,
  noConsentShare: 0.12,
  revokedShare: 0.07,
  membership: { kind: "annual", share: 0.55, termDays: 365 },
  discountSeekerShare: 0.31,
  whaleDiscountShare: 0.08,
  anchorProb: { whale: 0.88, normal: 0.28 },
  channels: ["pos", "marketplace"],
  events: { visitMax: 9, bookingShare: 0.14, bookingLabel: "fitting", formShare: 0.45 },
  seedKey: 20690729,
  catalogue: [
    { id: "p-driver-01", name: "Driver — tour spec", category: "driver", group_role: "anchor", list_price: 18900 },
    { id: "p-driver-02", name: "Driver — 2026 release", category: "driver", group_role: "anchor", list_price: 24500, is_new_arrival: true },
    { id: "p-iron-01", name: "Iron set, 7 pieces", category: "iron", group_role: "anchor", list_price: 32000 },
    { id: "p-putter-01", name: "Blade putter", category: "putter", group_role: "anchor", list_price: 8900 },
    { id: "p-wedge-01", name: "56° wedge", category: "wedge", group_role: "anchor", list_price: 6200, is_dead_stock: true },
    { id: "p-ball-01", name: "Golf balls, dozen", category: "ball", group_role: "attachment", list_price: 1650 },
    { id: "p-ball-02", name: "Golf balls — tour", category: "ball", group_role: "attachment", list_price: 2100, is_new_arrival: true },
    { id: "p-glove-01", name: "Leather glove", category: "glove", group_role: "consumable", list_price: 890 },
    { id: "p-grip-01", name: "Regrip", category: "grip", group_role: "consumable", list_price: 450 },
    { id: "p-bag-01", name: "Golf bag", category: "bag", group_role: "attachment", list_price: 5400 },
    { id: "p-cover-01", name: "Headcover", category: "accessory", group_role: "attachment", list_price: 690, is_dead_stock: true },
    { id: "p-tee-01", name: "Tees, 50 pack", category: "accessory", group_role: "consumable", list_price: 220 },
  ],
};

/* ══════════════════════════════════════════════════════════════
   2 · HONG MOVE — แท็กซี่ EV และลิมูซีนสนามบินหาดใหญ่

   รูปทรงวงจร: recall (ถึงรอบ) — คนกลับมาใช้เมื่อบินรอบถัดไป
   ไม่ใช่ replenishment เพราะไม่มีของหมดให้เติม แต่มีจังหวะที่คาดได้
   สำหรับคนเดินทางประจำ

   ฐานลูกค้าของธุรกิจสนามบินมีรูปร่างต่างจากค้าปลีกชัดเจน:
   คนส่วนใหญ่มาครั้งเดียว (นักท่องเที่ยว) แต่รายได้จริงมาจากคนกลุ่มเล็ก
   ที่บินเดือนละครั้งสองครั้ง จึงตั้ง repeat ต่ำแต่ whale ซื้อถี่มาก
   ══════════════════════════════════════════════════════════════ */

const HONG_MOVE: TenantProfile = {
  id: "hongmove",
  name: "HONG MOVE",
  industry: "EV taxi and airport limousine · Hat Yai",
  source: "Synthetic profile from services and prices published on hongmove.co.th",
  cycleShape: "recall",
  tier: "growth",
  createdDaysAgo: 520,
  vocab: {
    person: "passenger",
    people: "passengers",
    purchase: "trip",
    spend: "fare",
    item: "service",
    base: "passenger base",
    topGroup: "passengers",
    cycleExample: "someone flying into Hat Yai monthly is nothing like a tourist who comes once a year",
    orgKind: "company",
    purchaseVerb: "travel",
  },
  // เดินทางกลางคืนเป็นเรื่องปกติของสนามบิน ช่วงห้ามส่งจึงแคบกว่าค้าปลีก
  limits: { weeklyCap: 2, quietStart: 23, quietEnd: 7, maxDiscountPct: 15, credits: 9000 },
  scale: {
    people: 3180,
    everTransacted: 2905,
    repeat: 980,
    recent30: 596,
    silent90: 1640,
    whaleShare: 0.035,
    whaleTxns: [18, 34],
    repeatTxns: [2, 5],
    whaleCycle: [16, 34],
    normalCycle: [120, 420],
  },
  // จองผ่าน LINE @hongmove เป็นช่องทางหลัก จึงทักถึงได้สูงกว่าค้าปลีก
  lineShare: 0.88,
  noConsentShare: 0.1,
  revokedShare: 0.05,
  membership: { kind: "corporate", share: 0.12, termDays: 365 },
  discountSeekerShare: 0.24,
  whaleDiscountShare: 0.3, // บัญชีองค์กรต่อรองราคาเป็นปกติ
  anchorProb: { whale: 0.72, normal: 0.46 },
  channels: ["line_booking", "walk_up"],
  events: { visitMax: 5, bookingShare: 0.2, bookingLabel: "quote_request", formShare: 0.6 },
  seedKey: 771120,
  catalogue: [
    // ราคาตามที่ประกาศบนเว็บ — ลิมูซีนคิดเหมาตามเส้นทาง
    { id: "h-limo-satun", name: "Limousine — airport to Satun", category: "limousine", group_role: "anchor", list_price: 1400 },
    { id: "h-limo-pakbara", name: "Limousine — airport to Pak Bara pier", category: "limousine", group_role: "anchor", list_price: 2500 },
    { id: "h-limo-city", name: "Limousine — airport to Hat Yai city", category: "limousine", group_role: "anchor", list_price: 450 },
    { id: "h-rental-day", name: "EV rental, daily", category: "rental", group_role: "anchor", list_price: 1900 },
    { id: "h-rental-month", name: "EV rental, monthly", category: "rental", group_role: "anchor", list_price: 28000, is_new_arrival: true },
    { id: "h-tour-andaman", name: "Andaman tour package", category: "tour", group_role: "attachment", list_price: 3900 },
    { id: "h-tour-daytrip", name: "Half-day tour package", category: "tour", group_role: "attachment", list_price: 1500 },
    { id: "h-taxi-city", name: "VIP taxi — airport to city", category: "taxi", group_role: "consumable", list_price: 250 },
    { id: "h-taxi-satun", name: "VIP taxi — airport to Satun", category: "taxi", group_role: "consumable", list_price: 900 },
    { id: "h-taxi-meter", name: "VIP taxi — metered, in city", category: "taxi", group_role: "consumable", list_price: 150 },
    { id: "h-childseat", name: "Child car seat", category: "addon", group_role: "attachment", list_price: 150 },
    { id: "h-meetgreet", name: "Meet-and-greet inside the terminal", category: "addon", group_role: "attachment", list_price: 200, is_dead_stock: true },
  ],
};

/* ══════════════════════════════════════════════════════════════
   3 · Bangpakong Riverside Country Club — สนามกอล์ฟ 18 หลุม

   รูปทรงวงจร: replenishment (เติมของ) — การออกรอบเป็นการบริโภคซ้ำ
   ที่เป็นนิสัย นักกอล์ฟจริงจังออกรอบทุกสองสัปดาห์เหมือนเติมของที่ใช้หมด
   ต่างจาก MST Golf ที่ขายอุปกรณ์แบบตัดสินใจนาน (considered)

   ไม่ใช่ expiry แม้จะมีAnnual membership เพราะรายได้จริงมาจากค่ากรีนฟีที่จ่าย
   ทุกครั้งที่มาเล่น ไม่ใช่จากค่าสมาชิกปีละครั้ง วันหมดอายุสมาชิกเป็น
   สัญญาณรอง ไม่ใช่จังหวะหลักของธุรกิจ

   ธุรกิจสนามมีคนกลับมาถี่กว่าค้าปลีกมาก นักกอล์ฟจริงจังออกรอบ
   ทุกสองสัปดาห์ จึงตั้ง repeat สูงและวงจรสั้น
   ══════════════════════════════════════════════════════════════ */

const BRC_GOLF: TenantProfile = {
  id: "brc-golf",
  name: "Bangpakong Riverside CC",
  industry: "18-hole golf course · Chachoengsao",
  source: "Synthetic profile from green fees and facilities on brc-kycgolf.com",
  cycleShape: "replenishment",
  tier: "multi",
  createdDaysAgo: 900,
  vocab: {
    person: "golfer",
    people: "golfers",
    purchase: "round",
    spend: "spend",
    item: "service",
    base: "golfer base",
    topGroup: "members",
    cycleExample: "a member playing weekly is nothing like one who only comes on long weekends",
    orgKind: "club",
    purchaseVerb: "play",
  },
  limits: { weeklyCap: 2, quietStart: 20, quietEnd: 6, maxDiscountPct: 25, credits: 7500 },
  scale: {
    people: 2460,
    everTransacted: 2180,
    repeat: 1590,
    recent30: 690,
    silent90: 880,
    whaleShare: 0.05,
    whaleTxns: [26, 44],
    repeatTxns: [3, 9],
    whaleCycle: [10, 20],
    normalCycle: [35, 120],
  },
  lineShare: 0.7,
  noConsentShare: 0.14,
  revokedShare: 0.06,
  // Annual membershipคือหัวใจของ tenant นี้ จึงตั้งสัดส่วนสูงสุดในสี่บัญชี
  membership: { kind: "annual", share: 0.68, termDays: 365 },
  discountSeekerShare: 0.36, // โปรวันธรรมดาเป็นเรื่องปกติของสนาม
  whaleDiscountShare: 0.12,
  anchorProb: { whale: 0.94, normal: 0.8 }, // ออกรอบต้องจ่ายกรีนฟีทุกครั้ง
  channels: ["pro_shop", "online_booking"],
  events: { visitMax: 6, bookingShare: 0.3, bookingLabel: "driving_range", formShare: 0.5 },
  seedKey: 19900721,
  catalogue: [
    // ค่ากรีนฟีตามที่ประกาศ: วันธรรมดา 2,250 · วันหยุดเช้า 3,500 · วันหยุดบ่าย 2,550
    { id: "b-green-wd", name: "Green fee — weekday", category: "green_fee", group_role: "anchor", list_price: 2250 },
    { id: "b-green-we-am", name: "Green fee — weekend morning", category: "green_fee", group_role: "anchor", list_price: 3500 },
    { id: "b-green-we-pm", name: "Green fee — weekend after 11:22", category: "green_fee", group_role: "anchor", list_price: 2550 },
    { id: "b-member-annual", name: "Annual membership", category: "membership", group_role: "anchor", list_price: 48000, is_new_arrival: true },
    { id: "b-caddie", name: "Caddie fee", category: "service", group_role: "attachment", list_price: 400 },
    { id: "b-cart", name: "Golf cart fee", category: "service", group_role: "attachment", list_price: 800 },
    { id: "b-locker", name: "Locker fee", category: "service", group_role: "attachment", list_price: 100 },
    { id: "b-terrace", name: "Bang Pakong Terrace restaurant", category: "food", group_role: "consumable", list_price: 650 },
    { id: "b-range", name: "Range balls, one basket", category: "range", group_role: "consumable", list_price: 180 },
    { id: "b-proshop-polo", name: "House-brand polo shirt", category: "pro_shop", group_role: "attachment", list_price: 1290 },
    { id: "b-proshop-cap", name: "Course cap", category: "pro_shop", group_role: "consumable", list_price: 590, is_dead_stock: true },
    { id: "b-pool", name: "Pool and fitness", category: "facility", group_role: "consumable", list_price: 250, is_dead_stock: true },
  ],
};

/* ══════════════════════════════════════════════════════════════
   4 · พรรคประชาธิปัตย์ — งานทะเบียนสมาชิกพรรค

   ขอบเขตที่ตั้งใจจำกัด: บัญชีนี้เป็นงาน "ธุรการสมาชิก" เท่านั้น —
   ต่ออายุค่าบำรุง · สมาชิกที่ขาดต่อ · ชวนมาร่วมกิจกรรม · ดูแลผู้บริจาค
   ไม่ใช่เครื่องมือหาเสียงหรือโน้มน้าวผู้ออกเสียง และไม่มี play ใด
   ที่แบ่งกลุ่มคนตามความคิดเห็นทางการเมือง

   รูปทรงวงจร: expiry (หมดอายุ) — Annual duesตามพระราชบัญญัติ
   ประกอบรัฐธรรมนูญว่าด้วยPolitical party คือวงจรหมดอายุแท้ ๆ
   ══════════════════════════════════════════════════════════════ */

const DEMOCRAT: TenantProfile = {
  id: "democrat",
  name: "Democrat Party",
  industry: "Political party membership administration",
  source: "Synthetic profile, not a real membership register — dues follow the statutory rates",
  cycleShape: "expiry",
  tier: "chain",
  createdDaysAgo: 1100,
  vocab: {
    person: "member",
    people: "members",
    purchase: "payment",
    spend: "amount paid",
    item: "payment type",
    base: "membership register",
    topGroup: "supporters",
    cycleExample: "a member renewing on time every year is nothing like one returning after several years away",
    orgKind: "party",
    purchaseVerb: "pay",
  },
  /* เพดานเข้มกว่าทุกบัญชี: ข้อความจากPolitical partyที่ส่งถี่เกินไป
     ไม่ได้เสียแค่คนคนนั้น แต่กลายเป็นข่าวได้ และห้ามใช้ส่วนลดโดยสิ้นเชิง
     เพราะการให้ประโยชน์แลกกับสมาชิกภาพเป็นเรื่องที่มีข้อกฎหมายกำกับ */
  limits: { weeklyCap: 1, quietStart: 20, quietEnd: 9, maxDiscountPct: 0, credits: 60000 },
  scale: {
    /* ขนาดทะเบียนสมาชิกที่จ่ายค่าบำรุงของพรรคใหญ่อยู่ระดับหลายหมื่น
       ไม่ใช่หลายพัน ตัวเลขที่เล็กเกินจริงทำให้กลุ่ม "ใกล้หมดอายุ" เหลือ
       ไม่ถึงร้อยคน ซึ่งวัดผลไม่ได้และไม่ตรงกับงานจริงของฝ่ายทะเบียน */
    people: 26000,
    everTransacted: 20800,
    repeat: 11600,
    recent30: 1980,
    silent90: 14300,
    whaleShare: 0.015,
    whaleTxns: [8, 16],
    repeatTxns: [2, 5],
    whaleCycle: [70, 130],
    normalCycle: [300, 420], // Annual dues จังหวะจึงห่างเป็นปี
  },
  lineShare: 0.62,
  // ความยินยอมเข้มที่สุด เพราะความคิดเห็นทางการเมืองเป็นข้อมูลอ่อนไหว
  noConsentShare: 0.26,
  revokedShare: 0.11,
  membership: { kind: "party_member", share: 0.82, termDays: 365 },
  discountSeekerShare: 0,
  whaleDiscountShare: 0,
  anchorProb: { whale: 0.5, normal: 0.06 },
  channels: ["branch_office", "online_transfer"],
  events: { visitMax: 7, bookingShare: 0.24, bookingLabel: "volunteer_shift", formShare: 0.7 },
  measurementCaveat:
    "A member cycle runs a year, but the longest measurement window is 90 days, " +
    "so a per-campaign difference sits close to the data\u2019s own noise and will swing " +
    "hard both ways. Read the multi-cycle average, never a single campaign — " +
    "a genuine limit of measuring an annual-cycle organisation, not a defect.",
  compliance:
    "Political opinion is sensitive personal data under PDPA section 26 and " +
    "requires explicit consent, separate from general consent. This account caps " +
    "sending at one message a week, forbids discounts entirely, and runs no play " +
    "that segments on political position — this is membership administration, not campaigning.",
  seedKey: 24890406,
  catalogue: [
    // อัตราค่าบำรุงตามกฎหมาย: รายปี 100 บาท · ตลอดชีพ 2,000 บาท
    { id: "d-lifetime", name: "Life membership", category: "membership", group_role: "anchor", list_price: 2000 },
    { id: "d-donate-major", name: "Major donation", category: "donation", group_role: "anchor", list_price: 5000 },
    { id: "d-donate-branch", name: "Provincial branch donation", category: "donation", group_role: "anchor", list_price: 1000, is_new_arrival: true },
    { id: "d-annual", name: "Annual dues", category: "membership", group_role: "consumable", list_price: 100 },
    { id: "d-event-seminar", name: "Seminar registration", category: "event", group_role: "attachment", list_price: 300 },
    { id: "d-event-training", name: "Branch officer training", category: "event", group_role: "attachment", list_price: 500 },
    { id: "d-merch-shirt", name: "Party event shirt", category: "merch", group_role: "attachment", list_price: 250 },
    { id: "d-merch-book", name: "Party history book", category: "merch", group_role: "attachment", list_price: 350, is_dead_stock: true },
  ],
};

export const TENANT_PROFILES: TenantProfile[] = [
  MST_GOLF,
  HONG_MOVE,
  BRC_GOLF,
  DEMOCRAT,
];

/** บัญชีตั้งต้นเมื่อยังไม่ได้เลือก */
export const DEFAULT_TENANT_ID = MST_GOLF.id;

export function profileFor(tenantId: string): TenantProfile {
  return TENANT_PROFILES.find((t) => t.id === tenantId) ?? MST_GOLF;
}

export function isKnownTenant(tenantId: string): boolean {
  return TENANT_PROFILES.some((t) => t.id === tenantId);
}
