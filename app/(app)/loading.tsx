/* ── สิ่งที่เห็นระหว่างรอหน้าถูกสร้าง ────────────────────────────

   ตอนนี้ทุกหน้าคอนโซลตอบภายใน 100–400 มิลลิวินาที เพราะยังไม่มี
   ANTHROPIC_API_KEY ในเครื่อง ประโยคภาษาคนทั้งหมดจึงตกไปใช้เทมเพลตทันที

   วันที่ใส่คีย์จริง หน้าบรีฟจะต้องรอ summariseBrief กับ explainPlay อีกสามครั้ง
   ก่อนเรนเดอร์ได้ และเช้าแรกของทุกวันคือแคชเย็นเสมอ — ถ้าไม่มีไฟล์นี้
   ผู้ใช้จะเห็นจอค้างหน้าเดิมหลายวินาทีโดยไม่มีอะไรบอกว่ากำลังโหลด */

function Line({ w }: { w: string }) {
  return <div className="c-skel" style={{ width: w }} />;
}

export default function ConsoleLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <p className="c-label">loading</p>
      <div className="mt-4 flex flex-col gap-3">
        <Line w="min(22rem, 70%)" />
        <Line w="min(34rem, 90%)" />
      </div>

      <div className="c-panel-flat mt-8 p-5 md:p-6">
        <div className="flex flex-col gap-3">
          <Line w="90%" />
          <Line w="76%" />
          <Line w="42%" />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="c-panel p-5 md:p-6">
            <div className="flex flex-col gap-3">
              <Line w="8rem" />
              <Line w="min(26rem, 80%)" />
              <Line w="min(38rem, 95%)" />
            </div>
            <div className="mt-6 grid gap-4 border-y border-[var(--c-line)] py-5 sm:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex flex-col gap-2.5">
                  <Line w="6rem" />
                  <Line w="9rem" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
