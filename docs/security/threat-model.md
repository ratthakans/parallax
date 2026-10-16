# Threat model · PARALLAX (B7)

ฉบับ 2026-10-16 · ทบทวนทุกครั้งที่เพิ่มทางเข้าข้อมูลใหม่ (connector · API · ผู้ให้บริการช่วง) และก่อน pentest
วิธี: STRIDE ต่อขอบเขตความเชื่อใจ · ทุกข้อชี้ไปที่โค้ดหรือชุดตรวจที่พิสูจน์ได้ ข้อที่ยังไม่มีอยู่ใน "ช่องว่าง" ท้ายเอกสาร

## 1 · สิ่งที่ต้องปกป้อง

| ทรัพย์สิน | อยู่ที่ | ถ้ารั่ว/เสีย |
|---|---|---|
| ข้อมูลติดต่อของบุคคล (อีเมล · เบอร์) | `contact_points.value_enc` (AES-256-GCM · `PII_KEY`) + `value_hmac` (`PII_HMAC_KEY`) | ละเมิด PDPA · ต้องแจ้งเหตุ |
| แถวดิบจากไฟล์ลูกค้า | `import_rows.payload_enc` (เปิดได้เฉพาะ `lib/engine/vault/`) | เท่ากับไฟล์ต้นฉบับรั่ว |
| ความยินยอม/คัดค้าน (หลักฐาน) | `preferences` · `evidence` (เพิ่มอย่างเดียว) | ติดต่อคนที่คัดค้าน · หลักฐานทางกฎหมายหาย |
| ทะเบียนการลบ | `deletion_registry` (เพิ่มอย่างเดียว) | คนที่ลบแล้วกลับมาหลัง restore |
| บันทึกตรวจสอบ | `audit_log` (hash ต่อเนื่อง) | สืบเหตุไม่ได้ |
| กุญแจ | Vercel env: `PII_KEY` · `PII_HMAC_KEY` · `DATABASE_URL` · `ANTHROPIC_API_KEY` | ถอดรหัสข้อมูลทั้งฐาน |

## 2 · ขอบเขตความเชื่อใจ

```
เบราว์เซอร์ ──(1)── Vercel: proxy.ts → Server Action / Route ──(2)── Postgres (RLS ในนามผู้ใช้)
                                  │                          └─(3)── Supabase Auth
                                  ├──(4)── Anthropic API (AI brief · จับคู่คอลัมน์)
                                  └──(5)── ไฟล์ที่ผู้ใช้อัปโหลด → สแกน → แยกวิเคราะห์
ทีม PARALLAX ──(6)── Supabase dashboard / Vercel / GitHub
```

## 3 · STRIDE

| # | ภัย | ตัวอย่าง | การควบคุม | พิสูจน์ด้วย |
|---|---|---|---|---|
| S1 | ปลอมตัว | รหัสผ่านรั่ว | Supabase Auth · `getUser()` ตรวจ token กับเซิร์ฟเวอร์ (`lib/shared/session.ts`) · MFA TOTP · การกระทำเสี่ยงต้อง aal2 (`gate()` ใน `lib/shared/roles.ts`) | `verify:roles` |
| S2 | ปลอมบัญชี | ส่ง `tenantId` ของคนอื่นในฟอร์ม | บัญชีมาจาก session ฝั่งเซิร์ฟเวอร์ (`activeTenantId` · `viewer()`) ไม่เชื่อค่าจากฟอร์ม · RLS `app.user_tenants()` | `verify:isolate` · `verify:pg` |
| T1 | แก้ข้อมูล | ลบคำคัดค้านเพื่อติดต่อต่อ | `preferences`/`evidence`/`deletion_registry`/`dsar_requests`/`export_requests` ถอนสิทธิ์ DELETE · ลบประวัติได้เฉพาะคนที่ถูกลบแล้ว (`app.erase_person_history`) | `verify:pg` ข้อ 2 · 10 · 11 · 12 |
| T2 | แก้บันทึกตรวจสอบ | ลบร่องรอยหลังส่งออก | `audit_log` hash ต่อเนื่อง + advisory lock + unique `(tenant_id, prev_hash)` · `verifyAuditChain()` | `verify:vault` · `verify:pg` ข้อ 3 |
| T3 | ไฟล์อันตราย | CSV formula injection · ไฟล์มัลแวร์ | `csvCell` ใส่ `'` นำหน้า `= + - @` · สแกนก่อนแยกวิเคราะห์ (`lib/engine/vault/scan.ts`) · ไม่มี `CLAMAV_URL` บน production = ปฏิเสธ (fail closed) | `verify:customers` · `verify:intake` |
| R1 | ปฏิเสธการกระทำ | "ฉันไม่ได้ส่งออก" | ทุกขั้นของส่งออก/คำขอสิทธิ/ลบลง `activity_log` → `audit_log` พร้อมผู้กระทำ · ไม่บันทึกค่าเต็ม | `verify:export` · `verify:dsar` |
| I1 | รั่วข้ามบัญชี | query ลืม `tenant_id` | ทุก query มี `tenant_id = ?` + RLS ชั้นที่สอง · cache key มี tenant | `verify:isolate` · `verify:pg` |
| I2 | รั่วเกินสิทธิ์ในบัญชี | BD เห็นแฟ้มจำกัดสูง | ระดับความลับ + ชื่อปิดบัง (`MASKED_PERSON`) · คิว/รายการไม่เผยจำนวน | `verify:demo` · `verify:ai-brief` |
| I3 | ข้อมูลออกนอกระบบจำนวนมาก | บัญชีถูกยึดแล้วส่งออก | ส่งออกต้องขอ+อนุมัติ · คนเดียวรอ 1 ชม. · ดาวน์โหลดครั้งเดียว 24 ชม. · ต้อง MFA | `verify:export` · `verify:roles` |
| I4 | รั่วทาง AI | prompt injection ในบันทึกให้เผยข้อมูล | ส่งเฉพาะหลักฐานที่ผ่านสิทธิ์ · ไม่ส่งช่องทางติดต่อ · จำกัดสูงไม่ส่ง · หลักฐานอยู่ในแท็ก · ทุกประโยคต้องอ้างหลักฐาน · AI ไม่มีเครื่องมือ/การกระทำภายนอก | `verify:ai-brief` · `verify:steward` |
| I5 | รั่วทาง log/URL | อีเมลใน URL หรือ log | redirect ไม่มีชื่อ/ค่า · `revealContactPoint` บันทึกชนิดไม่บันทึกค่า · ชื่อไฟล์ส่งออกไม่มีคำค้น | ทบทวนโค้ด |
| D1 | ทำให้ใช้ไม่ได้ | ไฟล์ใหญ่ · แถวมาก | เพดาน 5MB · 50,000 แถว · 200 คอลัมน์ ตัดที่การอ่าน · ฟอร์มติดต่อจำกัดอัตรา | `verify:intake` |
| D2 | query โตไม่จำกัด | ข้อมูลเกิน pilot | ทดสอบโหลด p95 ≤ 2 วิ ทุก PR | `verify:load` |
| E1 | ยกระดับสิทธิ์ | viewer ยิง Server Action ตรง | ทุก action ผ่าน `denied()` · RLS `app.can_write` | `verify:roles` (สแกนทุก action) · `verify:pg` ข้อ 13 |
| E2 | ข้าม RLS | ใช้ service role ในแอป | แอปใช้ publishable key + `withIdentity` (role authenticated) · service role ใช้ในงานระบบที่ระบุเท่านั้น (`asSystem`) | `boundaries` |

## 4 · ผู้ให้บริการช่วง (ขอบเขต 3–6)

| | ความเสี่ยง | ควบคุม |
|---|---|---|
| Supabase | ผู้ดูแล dashboard เห็นข้อมูลเข้ารหัส + DDL | ค่าติดต่อเข้ารหัสด้วยกุญแจที่อยู่ Vercel ไม่ใช่ Supabase · DDL production ทำโดยเจ้าของผ่าน dashboard เท่านั้น |
| Vercel | env เก็บกุญแจทั้งหมด | ทีมเดียว · ควรเปิด 2FA ทุกบัญชี (ข้อ G4) |
| Anthropic | prompt มีข้อมูลบริษัท/ตำแหน่ง | ส่งเท่าที่จำเป็น · ไม่มีช่องทางติดต่อ · AI ปิดได้ต่อบัญชี (`AI_DISABLED` · `tenant_billing`) |
| GitHub | โค้ด + CI secret `DATABASE_URL` | secret scan · CodeQL · PR จากคนนอกอ่าน secret ไม่ได้ |

## 5 · ช่องว่างที่รู้แล้ว (ต้องปิดหรือยอมรับก่อนรับข้อมูลจริง)

| # | ช่องว่าง | ผลกระทบ | ทางปิด |
|---|---|---|---|
| G1 | ยังไม่มีตัวสแกนมัลแวร์ (`CLAMAV_URL`) | production ปฏิเสธการนำเข้าทุกไฟล์ (fail closed) — นำเข้าจริงไม่ได้ | ตั้ง ClamAV (T4 · O6) |
| G2 | Supabase Free: backup รายวัน ไม่มี PITR | RPO จริง ≈ 24 ชม. ไม่ใช่ ≤ 1 ชม. ตามที่เสนอ | แผน Pro + PITR (O6) หรือแก้ตัวเลขที่เสนอ |
| G3 | grant เขียนตรงของ `authenticated` ผ่าน Data API (0010) | ผู้ใช้ที่ล็อกอินเขียนผ่าน REST ได้ภายใต้ RLS (ไม่ข้ามบัญชี แต่ข้ามด่านบทบาทของ Server Action) | ปิด Data API ใน Supabase (O11) |
| G4 | 2FA ของบัญชีผู้ดูแลระบบภายนอก (Supabase · Vercel · GitHub) ยังไม่ยืนยัน | บัญชีผู้ดูแลถูกยึด = ทุกอย่าง | เปิด 2FA ทุกบัญชี · บันทึกในรายการตรวจ |
| G5 | ยังไม่มี CSP เต็ม | XSS ที่หลุดมาไม่มีชั้นกัน | งานแยก (วัด inline style ของ Next ก่อน) |
| G6 | break-glass และเพิกถอน session ตอนเปลี่ยนบทบาท | บทบาทอ่านใหม่ทุกคำขอแล้ว (มีผลทันที) แต่ session ไม่ถูกตัด | `break_glass_grants` · revoke ผ่าน Supabase Admin |
| G7 | SSO (OIDC/SAML) | ลูกค้า corporate อาจกำหนด | ตั้ง OAuth client (OIDC) · SAML ต้องแผน Pro |
| G8 | pentest อิสระ | ยังไม่มีการทดสอบจากภายนอก | จองช่วง ม.ค. (O5) |
