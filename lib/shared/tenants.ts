import type { PlanId } from "@/lib/shared/plans";
import type { CycleShape, GroupRole } from "@/lib/shared/types";

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

  /* ── คำชุดเดียวกันในภาษาไทย ─────────────────────────────────

     เว็บการตลาดขายของ คอนโซลทำงาน — คนละงานคนละภาษาได้

     คนที่เปิดคอนโซลทุกเช้าคือเจ้าของร้านไทย ไม่ใช่คนที่อ่านหน้าขาย
     วัดแล้วคอนโซลเป็นภาษาอังกฤษ 100% (อักษรไทย 24 ตัว เทียบกับละติน
     6,536 ตัว) ซึ่งเป็นเครื่องมือทำงานที่พูดภาษาที่คนทำงานไม่ได้ใช้

     ส่วนหน้าขาย · Playbook · เด็ค ยังเป็นอังกฤษ เพราะเป็นของที่ถูก
     แคปไปแชร์กับนักลงทุนและคนนอก */
  th: {
    person: string;
    people: string;
    purchase: string;
    spend: string;
    item: string;
    base: string;
    topGroup: string;
    orgKind: string;
    purchaseVerb: string;
  };
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
    th: {
      person: "ลูกค้า", people: "ลูกค้า", purchase: "การซื้อ",
      spend: "ยอดใช้จ่าย", item: "สินค้า", base: "ฐานลูกค้า",
      topGroup: "ลูกค้า", orgKind: "ร้าน", purchaseVerb: "ซื้อ",
    },
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
    th: {
      person: "ผู้โดยสาร", people: "ผู้โดยสาร", purchase: "การเดินทาง",
      spend: "ค่าโดยสาร", item: "บริการ", base: "ฐานผู้โดยสาร",
      topGroup: "ผู้โดยสาร", orgKind: "บริษัท", purchaseVerb: "เดินทาง",
    },
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
    th: {
      person: "นักกอล์ฟ", people: "นักกอล์ฟ", purchase: "การออกรอบ",
      spend: "ยอดใช้จ่าย", item: "บริการ", base: "ฐานนักกอล์ฟ",
      topGroup: "สมาชิก", orgKind: "สนาม", purchaseVerb: "ออกรอบ",
    },
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

export const TENANT_PROFILES: TenantProfile[] = [
  MST_GOLF,
  HONG_MOVE,
  BRC_GOLF,
];

/* บัญชีพรรคการเมืองถูกถอดออก 2026-10-13 (docs/plan.md B0) — PARALLAX เป็น CRM สำหรับ B2B
   และไม่รับงานการเมืองทุกรูปแบบ แถวเก่าในฐานข้อมูลไม่มีผู้ใช้ผูกอยู่ จึงไม่มีใครเปิดได้
   ร้านค้าปลีกสามบัญชีที่เหลือเป็นข้อมูลเดโมชั่วคราว จนตัวสร้างข้อมูล B2B (B1) มาแทน */

/* ══════════════════════════════════════════════════════════════
   บัญชีเดโม B2B — ผู้จัดงานที่ขายสปอนเซอร์ (แบบลูกค้า pilot)
   ข้อมูลมาจาก `npm run demo:seta` (ตัวสร้าง B2B · lib/shared/synthetic-b2b.ts) ไม่ใช่จาก seed ค้าปลีก
   จึงอยู่นอก TENANT_PROFILES: bootstrap/seed ค้าปลีกไม่แตะบัญชีนี้ (seed ล้างบัญชีที่ "ยังไม่มีลูกค้า"
   แล้วสร้างลูกค้าค้าปลีกใหม่ — ถ้าอยู่ในรายการเดียวกัน ข้อมูลเดโม B2B จะถูกล้างทุกครั้งที่ฐานว่าง)
   ค่าค้าปลีก (scale · catalogue · events) สืบจาก MST_GOLF เพื่อให้ชนิดครบ แต่ไม่มีอะไรอ่านมันสำหรับบัญชีนี้
   ══════════════════════════════════════════════════════════════ */

const SUNLINE_DEMO: TenantProfile = {
  ...MST_GOLF,
  id: "sunline-demo",
  name: "Sunline Expo (สมมุติ)",
  industry: "ผู้จัดงานแสดงสินค้าและสัมมนา B2B",
  source: "ข้อมูลสมมุติจากตัวสร้าง B2B — ไม่ใช่ข้อมูลของใคร",
  cycleShape: "considered",
  vocab: {
    person: "contact",
    people: "contacts",
    purchase: "sponsorship",
    spend: "contract value",
    item: "package",
    base: "contact base",
    topGroup: "sponsors",
    cycleExample: "a sponsor renewing every year is nothing like an exhibitor who books once every few editions",
    orgKind: "company",
    purchaseVerb: "sponsor",
    th: {
      person: "ผู้ติดต่อ", people: "ผู้ติดต่อ", purchase: "การซื้อแพ็กเกจ",
      spend: "มูลค่าสัญญา", item: "แพ็กเกจ", base: "ฐานผู้ติดต่อ",
      topGroup: "สปอนเซอร์", orgKind: "บริษัท", purchaseVerb: "ซื้อแพ็กเกจ",
    },
  },
  seedKey: 4242,
};

/** บัญชีเดโม B2B — เห็นและสลับได้ในคอนโซล แต่ไม่ถูก seed ค้าปลีก */
export const B2B_DEMO_PROFILES: TenantProfile[] = [SUNLINE_DEMO];
/** ทุกบัญชีที่คอนโซลรู้จัก (ตัวสลับบัญชี · ชื่อบนแถบข้าง · คำเรียก) */
export const CONSOLE_PROFILES: TenantProfile[] = [...TENANT_PROFILES, ...B2B_DEMO_PROFILES];

/** บัญชีตั้งต้นเมื่อยังไม่ได้เลือก */
export const DEFAULT_TENANT_ID = MST_GOLF.id;

/* ── บัญชีสมัครเอง (docs/solo-plan.md S9) ──────────────────────────────
   ไม่อยู่ในทะเบียนนิ่งข้างบน เพราะเกิดขึ้นตอนรันจากแถวในฐาน (app.create_signup_tenant · 0019)
   จำได้จากรูปแบบรหัส s-<hex 12> — รูปแบบไม่ใช่สิทธิ์: ใครแตะบัญชีไหนได้ยังมาจาก tenant_users เสมอ
   โปรไฟล์ใช้คำเรียกแบบ B2B ของบัญชีเดโม (ผู้ติดต่อ · แพ็กเกจ) · ชื่อจริงของบัญชีอ่านจากแถว tenants */
export const SIGNUP_TENANT_RE = /^s-[0-9a-f]{12}$/;
export const isSignupTenantId = (tenantId: string): boolean => SIGNUP_TENANT_RE.test(tenantId);

/** บัญชี B2B (เดโม B2B หรือสมัครเอง) — หน้ายุคค้าปลีกไม่เปิดให้บัญชีเหล่านี้ (docs/ux-plan.md D2) */
export const isB2BTenant = (tenantId: string): boolean =>
  isSignupTenantId(tenantId) || B2B_DEMO_PROFILES.some((p) => p.id === tenantId);

const SIGNUP_PROFILE: TenantProfile = {
  ...SUNLINE_DEMO,
  id: "signup",
  name: "บัญชีทดลอง",
  industry: "บัญชีสมัครเอง · ทดลองใช้",
  source: "ข้อมูลสมมุติจากตัวสร้าง B2B — บัญชีสมัครเองยังไม่รับข้อมูลจริงจนกว่าการทดสอบเจาะระบบจะผ่าน",
  tier: "growth",
  seedKey: 0,
};

/** บัญชีในทะเบียนนิ่ง (เดโมสังเคราะห์) — ไม่รวมบัญชีสมัครเอง */
export function isStaticTenant(tenantId: string): boolean {
  return CONSOLE_PROFILES.some((t) => t.id === tenantId);
}

export function profileFor(tenantId: string): TenantProfile {
  const fixed = CONSOLE_PROFILES.find((t) => t.id === tenantId);
  if (fixed) return fixed;
  if (isSignupTenantId(tenantId)) return { ...SIGNUP_PROFILE, id: tenantId };
  return MST_GOLF;
}

/** รหัสที่คอนโซลรู้จัก: ทะเบียนนิ่ง + รูปแบบบัญชีสมัครเอง */
export function isKnownTenant(tenantId: string): boolean {
  return isStaticTenant(tenantId) || isSignupTenantId(tenantId);
}
