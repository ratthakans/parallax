# -*- coding: utf-8 -*-
# Generates the DDL for migration 0010 (Campaign Workspace + policy) and its ensureSchema() block.
# Usage: python3 scripts/gen-schema-0010.py sqlite | sqlite_alters | pg
# Same conventions as gen-schema-0007.py: one spec feeds both sides; then run npm run verify:schema.
import importlib.util, sys
spec = importlib.util.spec_from_file_location("g7", __file__.replace("0010", "0007"))
g7 = importlib.util.module_from_spec(spec)
argv, sys.argv = sys.argv, ["x", "none"]
try:
    spec.loader.exec_module(g7)
except KeyError:
    pass  # 0007's CLI dispatch rejects "none" after its functions are defined
sys.argv = argv
c, T, I, R = g7.c, g7.T, g7.I, g7.R

g7.TABLES[:] = [
  dict(name="sales_campaigns", note="แคมเปญขาย B2B (เช่น ขายสปอนเซอร์) — วัตถุประสงค์ · ช่องทาง · ชนิดข้อความ · เกณฑ์เป้าหมายแบบอ่านได้", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("name",T,True), c("offer"), c("purpose_id",T,True), c("channel",T,True,"'email'"),
             c("message_kind",T,True,"'marketing'"), c("disclosure_purpose_id"), c("criteria",T,True,"'{}'"), c("status",T,True,"'draft'"),
             c("owner_id"), c("starts_at"), c("ends_at"), c("created_by",T,True), c("created_at",T,True), c("updated_at",T,True)],
       idx=[("ix_sales_campaigns_tenant","tenant_id, status")]),
  dict(name="campaign_targets", note="รายชื่อเป้าหมายของแคมเปญ — เหตุผลที่ถูกเลือก · ผลตัดสินนโยบายพร้อมรุ่น · ผู้รับผิดชอบ · ผล", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("campaign_id",T,True), c("org_id"), c("customer_id",T,True), c("reasons",T,True,"'[]'"),
             c("eligibility",T,True,"'review_required'"), c("eligibility_reasons",T,True,"'[]'"), c("policy_version",T,True), c("checked_at",T,True),
             c("assigned_to"), c("status",T,True,"'open'"), c("outcome"), c("created_at",T,True), c("updated_at",T,True)],
       idx=[("ux_target_person","tenant_id, campaign_id, customer_id", True), ("ix_target_person","tenant_id, customer_id"), ("ix_target_assignee","tenant_id, assigned_to, status")]),
  dict(name="work_log", note="กิจกรรมที่มีผล (มอบหมาย · บันทึกผล · ทบทวน) — วัดการใช้งานจริง แยกจาก login · ธง is_staff ไม่นับ · เพิ่มอย่างเดียว", pk="id", mode="append", autoinc=True,
       cols=[c("id",I,True), c("tenant_id",T,True), c("actor",T,True), c("is_staff",I,True,"0"), c("kind",T,True), c("campaign_id"), c("target_id"), c("at",T,True)],
       idx=[("ix_work_log_tenant","tenant_id, at")]),
]
g7.ALTERS.clear()
g7.ALTERS["tasks"] = [("campaign_id",T,False,None), ("target_id",T,False,None)]
g7.ALTERS["opportunities"] = [("campaign_id",T,False,None)]
which = sys.argv[1]
print({"sqlite": g7.sqlite, "sqlite_alters": g7.sqlite_alters, "pg": g7.pg}[which]())
