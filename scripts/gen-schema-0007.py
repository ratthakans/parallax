# Generates the DDL for migration 0007 and ensureSchema() in lib/engine/db.ts from one spec.
# Usage: python3 scripts/gen-schema-0007.py sqlite | sqlite_alters | pg
# Edit the spec here, paste the output into both places, then run npm run verify:schema.
"""Emit the B1 data-model DDL for both SQLite (ensureSchema) and Postgres (0007) from one spec."""
import json, sys

T, I, R = "TEXT", "INTEGER", "REAL"
PG = {T: "text", I: "integer", R: "double precision"}

META = [
    ("classification", T, True, "'confidential'"),
    ("data_owner_id", T, False, None),
    ("source_id", T, False, None),
    ("lifecycle_state", T, True, "'received'"),
    ("state_owner_id", T, False, None),
    ("state_due_at", T, False, None),
    ("restriction_status", T, True, "'none'"),
    ("retention_rule_id", T, False, None),
    ("recorded_at", T, False, None),
    ("last_verified_at", T, False, None),
]

def c(name, typ=T, nn=False, default=None):
    return (name, typ, nn, default)

TABLES = [
  dict(name="orgs", note="องค์กร — นิติบุคคลหนึ่งแถว · บริษัทในเครือเชื่อมด้วย parent_id ไม่รวมเป็นแถวเดียว", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("name",T,True), c("name_en"), c("name_norm",T,True),
             c("tax_id"), c("branch_code"), c("legal_entity",I,True,"1"), c("parent_id"), c("primary_domain"),
             c("industry")] + [c(*m) for m in META] + [c("created_at",T,True)],
       idx=[("ix_orgs_name","tenant_id, name_norm"), ("ix_orgs_tax","tenant_id, tax_id")]),
  dict(name="org_domains", note="โดเมนอีเมลขององค์กร — ใช้เป็นสัญญาณให้ตรวจ ไม่ใช่เหตุผลรวมคน", pk="tenant_id, domain", mode="rw",
       cols=[c("tenant_id",T,True), c("org_id",T,True), c("domain",T,True)],
       idx=[("ix_org_domains_org","tenant_id, org_id")]),
  dict(name="affiliations", note="คนสังกัดองค์กรช่วงไหน · valid_from/valid_to = เวลาที่เป็นจริง · recorded_at = เวลาที่ระบบรับรู้", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("customer_id",T,True), c("org_id",T,True), c("title"),
             c("department"), c("valid_from"), c("valid_to"), c("source_id"), c("confirmed_by"), c("recorded_at",T,True)],
       idx=[("ix_aff_person","tenant_id, customer_id"), ("ix_aff_org","tenant_id, org_id")]),
  dict(name="relationship_assertions", note="ความสัมพันธ์ที่มีหลักฐาน: คน↔คน · คน↔องค์กร · องค์กร↔องค์กร", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("from_kind",T,True), c("from_id",T,True), c("to_kind",T,True),
             c("to_id",T,True), c("type",T,True), c("context"), c("evidence_id"), c("confirmed_by"), c("confirmed_at"),
             c("valid_from"), c("valid_to"), c("source_id"), c("lifecycle_state",T,True,"'pending_review'"), c("recorded_at",T,True)],
       idx=[("ix_rel_from","tenant_id, from_kind, from_id"), ("ix_rel_to","tenant_id, to_kind, to_id")]),
  dict(name="interactions", note="ปฏิสัมพันธ์: ประชุม · โทร · อีเมลนอกระบบ · กิจกรรม · โน้ต พร้อมผลและผู้รับผิดชอบ", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("kind",T,True), c("occurred_at",T,True), c("org_id"), c("customer_id"),
             c("opportunity_id"), c("summary"), c("outcome"), c("owner_id"), c("source_id"),
             c("classification",T,True,"'confidential'"), c("recorded_at",T,True)],
       idx=[("ix_inter_org","tenant_id, org_id, occurred_at"), ("ix_inter_person","tenant_id, customer_id")]),
  dict(name="participations", note="การร่วมงาน/กิจกรรมในบทบาทหนึ่ง เช่น ผู้ออกบูธงานปี 2024", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("customer_id",T,True), c("org_id"), c("program",T,True), c("edition"),
             c("role",T,True), c("occurred_at"), c("source_id"), c("recorded_at",T,True)],
       idx=[("ix_part_person","tenant_id, customer_id"), ("ix_part_program","tenant_id, program, edition")]),
  dict(name="opportunities", note="โอกาสแบบง่าย: ข้อเสนอ · บริษัท · ขั้น · เจ้าของ", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("org_id",T,True), c("name",T,True), c("offer"),
             c("stage",T,True,"'open'"), c("owner_id"), c("value",R), c("expected_close"), c("created_at",T,True), c("updated_at",T,True)],
       idx=[("ix_opp_org","tenant_id, org_id")]),
  dict(name="opportunity_people", note="ผู้เกี่ยวข้องของโอกาส", pk="opportunity_id, customer_id", mode="rw",
       cols=[c("tenant_id",T,True), c("opportunity_id",T,True), c("customer_id",T,True), c("role")],
       idx=[("ix_opp_people_person","tenant_id, customer_id")]),
  dict(name="tasks", note="งานถัดไปที่มีเจ้าของและกำหนด", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("title",T,True), c("status",T,True,"'open'"), c("due_at"), c("owner_id"),
             c("org_id"), c("customer_id"), c("opportunity_id"), c("outcome"), c("created_by",T,True), c("created_at",T,True), c("done_at")],
       idx=[("ix_tasks_owner","tenant_id, owner_id, status"), ("ix_tasks_org","tenant_id, org_id")]),
  dict(name="sources", note="แหล่งข้อมูลที่ลงทะเบียน: วัตถุประสงค์ · เจ้าของงาน · ขอบเขตสิทธิ · ฟิลด์ที่เลือก — ไม่มีแหล่ง = อัปโหลดไม่ได้", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("name",T,True), c("kind",T,True), c("purpose_id"), c("owner_id",T,True),
             c("scope_note"), c("fields",T,True,"'[]'"), c("acquisition_note"), c("status",T,True,"'active'"),
             c("registered_by",T,True), c("registered_at",T,True)],
       idx=[]),
  dict(name="import_batches", note="ไฟล์หนึ่งไฟล์ที่นำเข้า — เริ่มที่สถานะกัก (quarantined) จนผ่านการสแกน", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("source_id",T,True), c("filename",T,True), c("sha256",T,True),
             c("bytes",I,True), c("rows_total",I,True,"0"), c("status",T,True,"'quarantined'"), c("uploaded_by",T,True),
             c("uploaded_at",T,True), c("finished_at")],
       idx=[("ux_batches_sha","tenant_id, sha256", True)]),
  dict(name="import_rows", note="ผลรายแถว: accepted · rejected · pending_review · suspended · ค่าดั้งเดิมเข้ารหัสใน payload_enc", pk="batch_id, line", mode="rw",
       cols=[c("tenant_id",T,True), c("batch_id",T,True), c("line",I,True), c("status",T,True,"'pending_review'"), c("reason"),
             c("source_ref"), c("customer_id"), c("payload_enc"), c("recorded_at",T,True)],
       idx=[("ix_rows_person","tenant_id, customer_id")]),
  dict(name="purposes", note="วัตถุประสงค์การประมวลผลของบัญชี", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("code",T,True), c("name",T,True), c("description"), c("created_at",T,True)],
       idx=[("ux_purposes_code","tenant_id, code", True)]),
  dict(name="processing_records", note="ฐานการประมวลผลต่อวัตถุประสงค์ (เชื่อมทะเบียน ROPA) · เก็บเป็นรุ่น", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("purpose_id",T,True), c("lawful_basis",T,True), c("data_scope"),
             c("approved_by"), c("version",I,True,"1"), c("effective_from",T,True), c("effective_to"), c("lia_ref"), c("recorded_at",T,True)],
       idx=[("ix_proc_purpose","tenant_id, purpose_id")]),
  dict(name="preferences", note="ความยินยอม · ถอน · คัดค้าน · ข้อจำกัด ต่อวัตถุประสงค์และช่องทาง — เพิ่มอย่างเดียว", pk="id", mode="append",
       cols=[c("id",T,True), c("tenant_id",T,True), c("customer_id",T,True), c("purpose_id"), c("channel",T,True,"'any'"),
             c("kind",T,True), c("effective_at",T,True), c("evidence_id"), c("recorded_by",T,True), c("recorded_at",T,True)],
       idx=[("ix_pref_person","tenant_id, customer_id")]),
  dict(name="evidence", note="หลักฐานแนบ: แถวในไฟล์ · ฟอร์ม · เอกสาร · คำยืนยัน — เพิ่มอย่างเดียว", pk="id", mode="append",
       cols=[c("id",T,True), c("tenant_id",T,True), c("kind",T,True), c("ref"), c("note"), c("captured_by",T,True), c("captured_at",T,True)],
       idx=[]),
  dict(name="record_versions", note="ประวัติทุกการเปลี่ยนค่า (เวลาที่ระบบรับรู้) — ค่า PII เก็บแบบปิดบาง · เพิ่มอย่างเดียว", pk="id", mode="append", autoinc=True,
       cols=[c("id",I,True), c("tenant_id",T,True), c("record_kind",T,True), c("record_id",T,True), c("field",T,True),
             c("old_value"), c("new_value"), c("reason",T,True), c("changed_by",T,True), c("valid_from"), c("recorded_at",T,True)],
       idx=[("ix_versions_record","tenant_id, record_kind, record_id, recorded_at")]),
  dict(name="merge_log", note="การรวมตัวตน — ย้อนได้ · impact เก็บสิ่งที่ย้ายตอนรวม", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("survivor_id",T,True), c("merged_id",T,True), c("rule"), c("confidence",R),
             c("decided_by",T,True), c("decided_at",T,True), c("impact",T,True,"'{}'"), c("undone_at"), c("undone_by")],
       idx=[("ix_merge_survivor","tenant_id, survivor_id")]),
  dict(name="audit_log", note="บันทึกตรวจสอบ — hash ต่อเนื่องตรวจความครบได้ · ไม่มีค่า PII เต็ม · เพิ่มอย่างเดียว", pk="id", mode="append", autoinc=True,
       cols=[c("id",I,True), c("tenant_id",T,True), c("at",T,True), c("actor",T,True), c("action",T,True), c("target_kind"),
             c("target_id"), c("detail"), c("prev_hash"), c("hash",T,True)],
       idx=[("ix_audit_tenant","tenant_id, at")]),
  dict(name="retention_rules", note="กฎอายุข้อมูลต่อประเภท — ไม่มีค่า 'เก็บตลอดไป' เป็นค่าตั้งต้น", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("data_kind",T,True), c("trigger_event",T,True), c("period_days",I,True),
             c("review_owner_id"), c("legal_hold",I,True,"0"), c("note"), c("created_at",T,True)],
       idx=[]),
]

ALTERS = {
  "customers": [m for m in META],
  "contact_points": [("verify_status",T,True,"'unverified'"), ("valid_from",T,False,None), ("valid_to",T,False,None), ("last_verified_at",T,False,None)],
  "tenant_users": [("is_staff",I,True,"0")],
}

def lite_col(col):
    n, t, nn, d = col
    s = f"{n} {t}"
    if nn: s += " NOT NULL"
    if d is not None: s += f" DEFAULT {d}"
    return s

def pg_col(col):
    n, t, nn, d = col
    s = f"{n} {PG[t]}"
    if nn: s += " not null"
    if d is not None: s += f" default {d}"
    return s

def sqlite():
    out = []
    for t in TABLES:
        lines = []
        for col in t["cols"]:
            if t.get("autoinc") and col[0] == "id":
                lines.append("id INTEGER PRIMARY KEY AUTOINCREMENT")
            elif t["pk"] == col[0]:
                lines.append(lite_col(col) + " PRIMARY KEY")
            else:
                lines.append(lite_col(col))
        if "," in t["pk"]:
            lines.append(f"PRIMARY KEY ({t['pk']})")
        out.append(f"    -- {t['note']}\n    CREATE TABLE IF NOT EXISTS {t['name']} (\n      " + ",\n      ".join(lines) + "\n    );")
        for ix in t["idx"]:
            uniq = "UNIQUE " if len(ix) > 2 and ix[2] else ""
            out.append(f"    CREATE {uniq}INDEX IF NOT EXISTS {ix[0]} ON {t['name']} ({ix[1]});")
    return "\n".join(out)

def sqlite_alters():
    out = []
    for table, cols in ALTERS.items():
        out.append(f"  {{\n    const have = await columnsOf(\"{table}\");")
        for col in cols:
            out.append(f"    if (!have.has(\"{col[0]}\")) await exec(\"ALTER TABLE {table} ADD COLUMN {lite_col(col)}\");")
        out.append("  }")
    return "\n".join(out)

def pg():
    out = []
    for t in TABLES:
        lines = []
        for col in t["cols"]:
            if t.get("autoinc") and col[0] == "id":
                lines.append("id bigint generated always as identity primary key")
            elif col[0] == "tenant_id":
                lines.append(pg_col(col) + " references tenants (id) on delete cascade")
            elif t["pk"] == col[0]:
                lines.append(pg_col(col) + " primary key")
            else:
                lines.append(pg_col(col))
        if "," in t["pk"]:
            lines.append(f"primary key ({t['pk']})")
        out.append(f"-- {t['note']}\ncreate table if not exists {t['name']} (\n  " + ",\n  ".join(lines) + "\n);")
        for ix in t["idx"]:
            uniq = "unique " if len(ix) > 2 and ix[2] else ""
            out.append(f"create {uniq}index if not exists {ix[0]} on {t['name']} ({ix[1]});")
        out.append(f"alter table {t['name']} enable row level security;")
        out.append(f"create policy tenant_read on {t['name']} for select using (tenant_id in (select app.user_tenants()));")
        if t["mode"] == "rw":
            out.append(f"create policy tenant_write on {t['name']} for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));")
            out.append(f"grant select, insert, update, delete on {t['name']} to authenticated;")
        else:
            # audit_log: ทุกสมาชิกต้องถูกบันทึกได้ ไม่ใช่เฉพาะผู้มีสิทธิ์เขียน — ไม่งั้นการกระทำของผู้ดูอย่างเดียวจะพังเพราะบันทึกไม่ได้
            who = "tenant_id in (select app.user_tenants())" if t["name"] == "audit_log" else "app.can_write(tenant_id)"
            out.append(f"create policy tenant_append on {t['name']} for insert with check ({who});")
            out.append(f"grant select, insert on {t['name']} to authenticated;")
            out.append(f"revoke update, delete on {t['name']} from authenticated;")
        out.append("")
    for table, cols in ALTERS.items():
        for col in cols:
            out.append(f"alter table {table} add column if not exists {pg_col(col)};")
    return "\n".join(out)

which = sys.argv[1]
print({"sqlite": sqlite, "sqlite_alters": sqlite_alters, "pg": pg}[which]())
