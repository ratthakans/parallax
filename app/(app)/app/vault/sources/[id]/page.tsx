import Link from "next/link";
import { notFound } from "next/navigation";
import { activeTenantId } from "@/app/(app)/tenant";
import { getSource } from "@/lib/engine/vault/sources";
import { listBatches } from "@/lib/engine/vault/batches";
import { SOURCE_KIND_TH, VAULT_FIELD_TH } from "@/lib/shared/vault";
import { thaiDateTime } from "@/lib/shared/format";
import { Panel, num } from "@/components/console/ui";
import { VaultImporter } from "@/components/console/vault-importer";

export const metadata = { title: "แหล่งข้อมูล" };
export const dynamic = "force-dynamic";

/* ── หนึ่งแหล่งข้อมูล: ข้อตกลงของแหล่ง + อัปโหลด + ไฟล์ที่นำเข้าแล้ว ── */

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await activeTenantId();
  const [source, batches] = await Promise.all([getSource(tenantId, id), listBatches(tenantId, id)]);
  if (!source) notFound();

  return (
    <>
      <Link href="/app/vault" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← แหล่งข้อมูลทั้งหมด
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="c-h1 text-[var(--c-text)]">{source.name}</h1>
        <p className="c-thai mt-2 text-[0.88rem] text-[var(--c-text-3)]">
          {SOURCE_KIND_TH[source.kind]} · ลงทะเบียนโดย {source.registeredBy} · {thaiDateTime(source.registeredAt)}
        </p>
      </header>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ข้อตกลงของแหล่งนี้</h2>
          <dl className="c-thai mt-4 grid gap-3 text-[0.86rem]">
            <div>
              <dt className="text-[var(--c-text-4)]">วัตถุประสงค์</dt>
              <dd className="text-[var(--c-text-2)]">{source.purposeName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--c-text-4)]">ที่มาและการแจ้งเจ้าของข้อมูล</dt>
              <dd className="text-[var(--c-text-2)]">{source.acquisitionNote ?? "—"}</dd>
            </div>
            {source.scopeNote && (
              <div>
                <dt className="text-[var(--c-text-4)]">ขอบเขตสิทธิ์</dt>
                <dd className="text-[var(--c-text-2)]">{source.scopeNote}</dd>
              </div>
            )}
            <div>
              <dt className="text-[var(--c-text-4)]">ฟิลด์ที่เก็บ ({num(source.fields.length)})</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {source.fields.map((f) => (
                  <span key={f} className="rounded-full border border-[var(--c-line)] px-2.5 py-0.5 text-[0.78rem] text-[var(--c-text-2)]">
                    {VAULT_FIELD_TH[f]}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
          <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">คอลัมน์อื่นในไฟล์จะไม่ถูกเก็บ</p>
        </Panel>

        <VaultImporter sourceId={source.id} allowed={source.fields} />
      </div>

      {batches.length > 0 && (
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ไฟล์ที่นำเข้าจากแหล่งนี้</h2>
          <ul className="c-thai mt-4 flex flex-col gap-2 text-[0.86rem]">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--c-line)] pb-2">
                <Link href={`/app/vault/batches/${b.id}`} className="text-[var(--c-text)] hover:text-[var(--c-accent)]">{b.filename}</Link>
                <span className="text-[var(--c-text-4)]">{num(b.rowsTotal)} แถว · {thaiDateTime(b.uploadedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
