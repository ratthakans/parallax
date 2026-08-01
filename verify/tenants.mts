import { get } from "@/lib/engine/sql";
import "./isolate.mts";

import { ensureReady } from "@/lib/engine/bootstrap";
import { loadFeatures } from "@/lib/engine/derive";
import { runMatch, topThree } from "@/lib/engine/match";
import { roiSummary } from "@/lib/engine/proof";
import { TENANT_PROFILES } from "@/lib/shared/tenants";
import { CYCLE_LABEL } from "@/lib/shared/types";
import { ALL_PLAYS } from "@/lib/shared/plays";
const ALLP = ALL_PLAYS.length;

await ensureReady();
const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

for (const p of TENANT_PROFILES) {
  const f = await loadFeatures(p.id);
  const ever = f.filter(x => x.frequency_total > 0);
  const repeat = f.filter(x => x.frequency_total >= 2);
  const r30 = ever.filter(x => x.recency_days <= 30);
  const s90 = ever.filter(x => x.recency_days > 90);
  const rev = f.reduce((s,x)=>s+x.monetary_ltv,0);
  const sorted = [...f].sort((a,b)=>b.monetary_ltv-a.monetary_ltv);
  const top2 = sorted.slice(0, Math.round(f.length*0.02));
  const top2Share = rev ? (top2.reduce((s,x)=>s+x.monetary_ltv,0)/rev)*100 : 0;
  const { candidates } = await runMatch(p.id);
  const three = topThree(candidates);
  const roi = await roiSummary(p.id);
  const reach = f.reduce<Record<string,number>>((a,x)=>{a[x.reachable_by]=(a[x.reachable_by]??0)+1;return a;},{});

  out.push(`\n═══ ${p.name} · ${CYCLE_LABEL[p.cycleShape]} (${p.cycleShape}) ═══`);
  out.push(`  ฐาน ${f.length} · เคยจ่าย ${ever.length} · ซ้ำ ${repeat.length} · 30วัน ${r30.length} · เงียบ90 ${s90.length} · บน2% ${top2Share.toFixed(0)}%`);
  out.push(`  play ที่เข้าวงจร ${candidates.length}/${ALLP} · เสนอวันนี้ ${three.length} · ถูกกัน ${candidates.filter(c=>c.blocked).length}`);
  out.push(`  เสนอ: ${three.map(c=>`${c.play.id}(${c.audience.length}คน)`).join(", ") || "—"}`);
  out.push(`  ทักถึง: ${Object.entries(reach).map(([k,n])=>`${k}=${n}`).join(" ")}`);
  out.push(`  Proof: campaigns=${roi.campaigns} measured=${roi.measured} lift=${roi.avgLiftPct ?? "—"}% verdict=${JSON.stringify(roi.verdictMix)}`);

  ok(f.length === p.scale.people, `${p.name}: ฐานตรงเป้า ${f.length}/${p.scale.people}`);
  ok(ever.length === p.scale.everTransacted, `${p.name}: เคยจ่ายตรงเป้า ${ever.length}/${p.scale.everTransacted}`);
  ok(repeat.length === p.scale.repeat, `${p.name}: จ่ายซ้ำตรงเป้า ${repeat.length}/${p.scale.repeat}`);
  ok(r30.length === p.scale.recent30, `${p.name}: 30 วันตรงเป้า ${r30.length}/${p.scale.recent30}`);
  ok(s90.length === p.scale.silent90, `${p.name}: เงียบ 90 ตรงเป้า ${s90.length}/${p.scale.silent90}`);
  ok(candidates.length > 0, `${p.name}: มี play ที่เข้ากับวงจร`);
  ok(candidates.every(c => c.play.cycle_shape.includes(p.cycleShape)), `${p.name}: ไม่มี play ที่ผิดวงจรหลุดเข้ามา`);
  // ไม่มีใครที่ไม่ยินยอมอยู่ในกลุ่มใดเลย
  const bad = candidates.flatMap(c => c.audience).filter(cid => {
    const ft = f.find(x => x.customer_id === cid);
    return ft && !ft.consent_marketing;
  });
  ok(bad.length === 0, `${p.name}: ไม่มีคนที่ไม่ยินยอมในกลุ่มใด (พบ ${bad.length})`);
  if (p.limits.maxDiscountPct === 0) {
    const seekers = ever.filter(x => x.discount_affinity === "discount_seeker");
    ok(seekers.length === 0, `${p.name}: เพดานส่วนลด 0 จึงไม่มีใครเป็น discount_seeker (พบ ${seekers.length})`);
  }
}

/* ฐานต้องแยกกันสนิท — ตรวจว่าไม่มีลูกค้าคนไหนอยู่หลายบัญชี
   และไม่มีแคมเปญที่ดึงคนจากบัญชีอื่นเข้ากลุ่ม
   (ห้ามตรวจจากรูปแบบชื่อ id ของธุรกรรม เพราะธุรกรรมที่ demo แทรกเข้ามา
    ใช้ randomUUID ไม่ได้ตั้งชื่อตามบัญชี — เคยทำให้ test ฟ้องผิด) */
const dupCust = (await get<{n:number}>("SELECT COUNT(*) n FROM (SELECT id FROM customers GROUP BY id HAVING COUNT(DISTINCT tenant_id) > 1)"))!;
ok(dupCust.n === 0, `ไม่มีลูกค้าที่อยู่หลายบัญชี (พบ ${dupCust.n})`);
const audLeak = (await get<{n:number}>(`SELECT COUNT(*) n FROM campaign_audience a
  JOIN campaigns k ON k.id = a.campaign_id
  JOIN customers c ON c.id = a.customer_id
  WHERE c.tenant_id != k.tenant_id`))!;
ok(audLeak.n === 0, `ไม่มีคนจากบัญชีอื่นในกลุ่มของแคมเปญ (พบ ${audLeak.n})`);
const txnLeak = (await get<{n:number}>(`SELECT COUNT(*) n FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id WHERE c.id IS NULL`))!;
ok(txnLeak.n === 0, `ไม่มีธุรกรรมที่หาเจ้าของไม่ได้ (พบ ${txnLeak.n})`);
const prodCross = (await get<{n:number}>(`SELECT COUNT(*) n FROM line_items l
  JOIN transactions t ON t.id = l.txn_id
  JOIN customers c ON c.id = t.customer_id
  WHERE l.product_id NOT LIKE c.tenant_id || ':%'`))!;
ok(prodCross.n === 0, `ไม่มีสินค้าข้ามบัญชี (พบ ${prodCross.n})`);

console.log(out.join("\n"));
console.log("\n" + (out.some(l=>l.startsWith("FAIL")) ? "=== มี FAIL ===" : "=== ผ่านทั้งหมด ==="));
