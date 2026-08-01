const { usingPostgres, get } = await import("./lib/engine/sql.ts");
console.log("  ตัวขับ:", usingPostgres() ? "Postgres ✓" : "sqlite");
const t0 = Date.now();
const b = await import("./lib/engine/bootstrap.ts"); await b.ensureReady();
console.log("  ensureReady:", ((Date.now()-t0)/1000).toFixed(1)+"s");
for (const t of ["tenants","customers","transactions","line_items","products","customer_features","campaigns","messages","attributions"]) {
  const r = await get(`SELECT COUNT(*) AS n FROM ${t}`);
  console.log(`  ${t.padEnd(20)} ${Number(r.n).toLocaleString()}`);
}
