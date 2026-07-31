import { aiConfigured } from "@/lib/ai";
import { PageHead, Panel } from "@/components/console/ui";
import { Importer } from "@/components/console/importer";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  const ai = aiConfigured();

  return (
    <>
      <PageHead
        label="Import"
        title="Drop a file, see where the revenue leaks"
        lead="Almost every POS exports CSV. That is an API already open that nobody can close — no vendor deal required."
      />

      {!ai && (
        <Panel flat className="mb-6 p-5">
          <p className="c-label text-[var(--c-warn)]">ai not connected</p>
          <p className="c-thai mt-2.5 text-[0.84rem] text-[var(--c-text-2)]">
            Column mapping falls back to pattern matching, which handles
            straightforwardly named headers but misreads unusual ones. Set{" "}
            <span className="c-mono">ANTHROPIC_API_KEY</span> and restart so the model
            can read sample rows as well.
          </p>
        </Panel>
      )}

      <Importer />
    </>
  );
}
