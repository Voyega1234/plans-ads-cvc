import Link from "next/link";
import { createProjectAction } from "@/lib/line-tracking/actions";

const BUSINESS_TYPES = [
  "คลินิก / ความงาม",
  "อสังหาริมทรัพย์",
  "การศึกษา / ติวเตอร์",
  "วีซ่า / ท่องเที่ยว",
  "ประกัน / การเงิน",
  "อีคอมเมิร์ซ",
  "บริการทั่วไป",
];

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-500">
          Create Project · Step 1 of 8
        </div>
        <h1 className="text-xl font-bold text-slate-900">สร้างโปรเจกต์ลูกค้าใหม่</h1>
        <p className="text-sm text-slate-500">กรอกข้อมูลพื้นฐาน แล้วระบบจะพาไป Setup Wizard ต่อ</p>
      </div>

      <form action={createProjectAction} className="card space-y-4">
        <div>
          <label className="label">Project name *</label>
          <input name="name" required className="input" placeholder="เช่น Project Q3" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Client name *</label>
            <input name="clientName" required className="input" placeholder="ชื่อลูกค้าใหม่" />
          </div>
          <div>
            <label className="label">Business type *</label>
            <select name="businessType" required className="input" defaultValue="">
              <option value="" disabled>เลือกประเภทธุรกิจ…</option>
              {BUSINESS_TYPES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Website URL <span className="text-slate-300">(optional)</span></label>
          <input name="websiteUrl" type="url" className="input" placeholder="https://example.com" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Currency</label>
            <select name="currency" className="input" defaultValue="THB">
              <option value="THB">THB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="label">Timezone</label>
            <input name="timezone" className="input" defaultValue="Asia/Bangkok" />
          </div>
          <div>
            <label className="label">Default conversion value</label>
            <input name="defaultConversionValue" type="number" min="0" step="1" className="input" defaultValue={0} />
          </div>
        </div>
        <div>
          <label className="label">Main sales channel / default LINE OA</label>
          <input name="mainSalesChannel" className="input" defaultValue="LINE" placeholder="LINE OA @abcclinic" />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/line-tracking/projects" className="btn-ghost">ยกเลิก</Link>
          <button type="submit" className="btn-primary">สร้างโปรเจกต์ &amp; ไปตั้งค่า →</button>
        </div>
      </form>
    </div>
  );
}
