# Generates the DDL for migration 0009 (Account Workspace) and its ensureSchema() block.
# Usage: python3 scripts/gen-schema-0009.py sqlite | sqlite_alters | pg
# Same conventions as gen-schema-0007.py: one spec feeds both sides; then run npm run verify:schema.
import importlib.util, sys
spec = importlib.util.spec_from_file_location("g7", __file__.replace("0009", "0007"))
g7 = importlib.util.module_from_spec(spec)
argv, sys.argv = sys.argv, ["x", "none"]
try:
    spec.loader.exec_module(g7)
except KeyError:
    pass  # 0007's CLI dispatch rejects "none" after its functions are defined
sys.argv = argv
c, T, I, R = g7.c, g7.T, g7.I, g7.R

g7.TABLES[:] = [
  dict(name="account_briefs", note="สรุปแฟ้มบริษัท — ผูกกับระดับสิทธิ์และ hash ของหลักฐาน · ทุกประโยคมีรหัสหลักฐาน · ลบตามเมื่อหลักฐานถูกลบ", pk="id", mode="rw",
       cols=[c("id",T,True), c("tenant_id",T,True), c("org_id",T,True), c("clearance",T,True), c("evidence_hash",T,True),
             c("source",T,True), c("model"), c("sentences",T,True,"'[]'"), c("unknowns",T,True,"'[]'"), c("evidence",T,True,"'[]'"),
             c("dropped",I,True,"0"), c("created_by",T,True), c("created_at",T,True)],
       idx=[("ux_brief_scope","tenant_id, org_id, clearance", True)]),
]
g7.ALTERS.clear()
g7.ALTERS["orgs"] = [("account_owner_id",T,False,None)]
g7.ALTERS["affiliations"] = [("last_seen_at",T,False,None)]
which = sys.argv[1]
print({"sqlite": g7.sqlite, "sqlite_alters": g7.sqlite_alters, "pg": g7.pg}[which]())
