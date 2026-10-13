# Generates the DDL for migration 0008 (review queue) and its ensureSchema() block.
# Usage: python3 scripts/gen-schema-0008.py sqlite | pg
# Same conventions as gen-schema-0007.py: one spec feeds both sides; then run npm run verify:schema.
import importlib.util, sys
spec = importlib.util.spec_from_file_location("g7", __file__.replace("0008", "0007"))
g7 = importlib.util.module_from_spec(spec)
argv, sys.argv = sys.argv, ["x", "none"]
try:
    spec.loader.exec_module(g7)
except KeyError:
    pass  # 0007's CLI dispatch rejects "none" after its functions are defined
sys.argv = argv
c, T, I, R = g7.c, g7.T, g7.I, g7.R

g7.TABLES[:] = [
  dict(name="review_items", note="คิวให้คนตรวจ: คู่คนที่อาจเป็นคนเดียวกัน · กลุ่มชื่อองค์กรที่อาจเป็นนิติบุคคลเดียว — ระบบไม่รวมเองจากสัญญาณอ่อน", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("kind",T,True), c("subject_ids",T,True), c("signals",T,True,"'[]'"),
             c("confidence",R,True,"0"), c("status",T,True,"'open'"), c("assigned_to"), c("due_at"), c("created_at",T,True),
             c("decided_by"), c("decided_at"), c("decision_note")],
       idx=[("ix_review_open","tenant_id, status, kind"), ("ux_review_subject","tenant_id, kind, subject_ids", True)]),
  dict(name="resolution_overrides", note="สิ่งที่คนตัดสินแล้ว — ชนะกฎเสมอ และการตรวจตัวตนรอบถัดไปไม่เสนอซ้ำ", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("kind",T,True), c("verdict",T,True), c("a_id",T,True), c("b_id",T,True),
             c("decided_by",T,True), c("decided_at",T,True), c("note")],
       idx=[("ux_override_pair","tenant_id, kind, a_id, b_id", True)]),
  dict(name="sample_checks", note="ผลสุ่มตรวจการรวมโดย data steward — ใช้วัดความแม่นจริง ไม่ใช่ความมั่นใจของระบบ", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("customer_id",T,True), c("verdict",T,True), c("checked_by",T,True),
             c("checked_at",T,True), c("note")],
       idx=[("ix_sample_tenant","tenant_id, checked_at")]),
]
g7.ALTERS.clear()
which = sys.argv[1]
print({"sqlite": g7.sqlite, "pg": g7.pg}[which]())
