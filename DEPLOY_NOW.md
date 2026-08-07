# 📦 Deploy รอบ 5 ส.ค. 2026 — ชุดใหญ่ตาม feedback ทีม

เอา `src/` + `tailwind.config.ts` ของแพ็กเกจนี้ทับ repo แล้ว build ได้เลย

```bash
rsync -a --exclude='.DS_Store' <แพ็กเกจ>/src/  <repo>/src/
cp <แพ็กเกจ>/tailwind.config.ts <repo>/tailwind.config.ts
cd <repo> && npm install --legacy-peer-deps && npm run build
```

**ไม่มี migration · ไม่แตะ schema.prisma · ไม่แตะ env · ไม่ต้องรันสคริปต์อะไรทั้งนั้น**
(ตารางใหม่ตัวเดียวที่ใช้ — `KeywordFeedback` — โค้ดสร้างเองอัตโนมัติครั้งแรกที่ถูกเรียก)

**ยืนยันฝั่งเรา (ทับ repo เปล่าแล้วรันจริง):** `npx tsc --noEmit` → **0 error** ·
`npx next build` → **ผ่าน 147/147 หน้า**

---

## สิ่งที่เปลี่ยนรอบนี้ (ตามที่เจ้าของระบบสั่ง — ไม่มีเกินจากนี้)

### ก) Media Plan / Campaign Generator (feedback ทีม 6 ข้อ)

| # | เรื่อง | ที่แก้ |
|---|--------|--------|
| 1 | ช่อง Additional Notes ขยายไม่ได้ มองไม่เห็นข้อความ | `media-plans/plan/page.tsx` — textarea ทุกช่องลากขยายได้ (resize-y) + Notes เริ่มที่ 5 แถว |
| 2 | เพิ่ม campaign แล้วงบเกิน → ต้องนั่งเกลี่ยเอง | `build/page.tsx` — ปุ่ม **"เกลี่ยงบอัตโนมัติ"** ในแถบเตือนสีแดง ปรับทุกแคมเปญตามสัดส่วนเดิมให้รวมพอดีงบ (ปัดหลักร้อย ชดเชยเศษที่ก้อนใหญ่สุด) |
| 3 | Gen keyword ออกมาเป็น Service หมด เลือกกลุ่มไม่ได้ | เลือกกลุ่มก่อน gen (brand/product/service/generic/competitor) + server จัดกลุ่มซ้ำด้วยกติกาจริง (คำมีชื่อแบรนด์ = brand เสมอ) + คลิกป้ายกลุ่มในตารางเพื่อแก้รายคำได้ + ของที่โหลดกลับมาไม่ถูกตีเป็น service หมดอีก |
| 4 | ใส่ keyword เข้าแคมเปญแล้วลบไม่ได้ | chip ทุกตัวมีปุ่ม × ลบแล้ว sync เข้าแผนทันที + ปุ่ม "อัปเดต" กดใส่ซ้ำทับของเดิมได้ ไม่ล็อกอีกต่อไป |
| 5 | อยากบอก AI ก่อน gen headline ว่าเอา/ไม่เอาอะไร | ช่อง **"คำสั่งเพิ่มเติมสำหรับ AI"** ต่อแคมเปญ เหนือ Ad Copy Builder — ส่งเข้า `adcopy/generate` (schema รับ `suggestions` + `brandTone` แล้ว) |
| 6 | AI error บ้าง กดซ้ำแล้วหาย | `lib/ai/provider.ts` — `safeCallAI` **ยิงซ้ำเองสูงสุด 3 ครั้ง** ก่อนโยน error (4xx ที่ซ้ำก็ไม่หายจะไม่วนยิง) — ผู้ใช้แทบไม่เห็น "AI ตอบกลับไม่ถูกต้อง" อีก |

### ข) กลับไปหน้า 1 แล้วข้อมูลหาย + Campaign Generator History

- **ต้นเหตุข้อมูลหาย:** state เซฟลง localStorage ทุกครั้งก็จริง แต่ blueprint ที่มีรูป
  base64 ทำให้ JSON เกิน quota (~5MB) → setItem พังเงียบ = ไม่เคยเซฟเลย
  ออกจากหน้าแล้วกลับมาจึงว่าง — ตอนนี้เซฟแบบไล่ระดับ (เต็ม → ตัดรูป → อย่างน้อย step+items)
- **History:** push สำเร็จทุกครั้งถูกเก็บเป็น card ที่ **`/campaign-generator/history`**
  (ปุ่ม "History — ชุดที่ push แล้ว" บนหน้า Campaign Generator) — เปิดดู แก้ headlines/descriptions
  ทุกแคมเปญ แล้ว **Push ทั้งชุดเข้า Google Ads ซ้ำได้** (เลือกบัญชีได้ push ทีละแคมเปญกัน timeout)
- เบื้องหลัง: `push-blueprint` เปลี่ยนจาก "ลบ blueprint เก่า" เป็น **archive** (ประวัติสะสม
  ไม่มีตารางใหม่) และ `campaign-blueprints/generate` ถูกกันไม่ให้ลบแถว archived ด้วย

### ค) Keyword Research (3 ข้อ + คอลัมน์ GKP เต็ม)

- **Landing page** — ช่องใส่ URL + เลือก "ใช้หน้านี้เท่านั้น / ใช้ทั้งเว็บไซต์" เหมือน
  Google Keyword Planner: URL ถูกส่งเป็น seed จริงเข้า `generateKeywordIdeas`
  (urlSeed/siteSeed/keywordAndUrlSeed) + AI (grounding) อ่านหน้านั้นประกอบ —
  คำที่เว็บเกี่ยวจริงจาก Google โผล่เพิ่มสูงสุด 10 คำ (เพดานผลรวมขยับเป็น 30)
- **Do / Don't** — 2 ช่องไม่บังคับก่อน gen ("โฟกัส painpoint...", "ไม่เอา kw ซ้ำแคมเปญ...")
- **Feedback → system learning ใน DB** — กด "วิเคราะห์ใหม่" จะมีช่อง "ยังไม่ถูกใจตรงไหน?"
  ข้อความถูกเก็บลงตาราง `KeywordFeedback` (สร้างเองอัตโนมัติ ไม่ต้องรัน SQL)
  และถูกดึงกลับมาใส่ prompt **ทุกรอบถัดไปของธุรกิจเดิม** — ระบบจำข้ามรอบ/ข้ามเครื่อง
- **ตารางผลลัพธ์ครบแบบ GKP จริง:** sparkline volume 12 เดือน · Bid ต่ำ/สูง แยกคอลัมน์ ·
  Three-month change · YoY change · Competition (ข้อมูลอยู่ใน API ที่ Google ส่งมาอยู่แล้ว
  แต่ของเดิมทิ้ง) — ทั้งหน้า Keyword Planner เดี่ยว และตัว embed ใน Campaign Generator

### ง) เครื่องมือใหม่ — Text Ads Generator (หน้า Tools ใต้ Keyword Planner)

`/tools/text-ads-generator` ครบตาม spec 8 ข้อ:
เลือก ad account → เลือกแคมเปญ (ดึง keywords เดิม + เป็นเป้า push) หรือไม่ผูกก็ได้ ·
ใส่/Gen keyword ด้วย AI · objective + budget · ช่อง Do/Don't ·
**แนบครีเอทีฟสูงสุด 3 รูปให้ AI อ่านประกอบ** (multimodal ผ่าน `callAI` ตัวกลางเดิม —
**Vertex OIDC เส้นเดิม ไม่มีการวาง API key ใหม่**) · AI Generate 1-3 ชุด ·
แก้มือได้ทุกช่องพร้อมตัวนับ · **Preview หน้าตาเหมือนผลค้นหา Google สด ๆ** ·
ไม่ถูกใจแก้ Do/Don't แล้ว gen ใหม่ (AI รู้ของเดิม ไม่เขียนซ้ำแนว) ·
**Export HTML (มี preview ในไฟล์) + CSV** ส่งลูกค้าตรวจ · **Push เข้า ad group จริง**
(ค่าเริ่มต้นสร้างเป็น PAUSED ไว้ตรวจก่อน)

### จ) Campaign Adjustment (3 ข้อ)

1. **PMax สร้าง Asset Group ใหม่ได้แล้ว** — ฟอร์มใต้หัวข้อรูปภาพ: ชื่อ/URL/ชื่อธุรกิจ/
   พาดหัว≥3/long headline/คำอธิบาย≥2 (อันแรก ≤60)/รูป landscape+square+logo →
   ยิง `googleAds:mutate` ก้อนเดียว (ผิดข้อเดียว Google ปฏิเสธทั้งก้อน ไม่มี asset ขยะค้าง)
   สร้างเป็น **PAUSED** ให้ตรวจก่อนเปิด · API: `POST /api/campaign-edit/asset-groups`
2. **ฟอร์มสร้าง Text Ad มี preview แล้ว** — การ์ดหน้าตาเหมือนผลค้นหา Google อัปเดตสดตามที่พิมพ์
3. **ปุ่ม AI Gen ในฟอร์ม** (พิมพ์บอกแนวได้ → AI เติมทั้งชุด แก้ต่อได้) + **Export HTML/CSV**
   จากฟอร์มโดยตรง — ไม่ต้อง copy มือส่งทีมอีก

### ฉ) Line Tracking (3 ข้อ)

1. **Conversion Mapping + Client Login ย้ายเข้าเมนู Settings ในแถบข้าง** — ต่อท้ายเพื่อน
   4 อันเดิม (หน้า `settings/conversion-mapping` และ `settings/client-login` มีอยู่แล้ว
   ที่หายคือ "ลิงก์" — client viewer เข้าไม่ได้อยู่แล้วโดย layout เดิม)
2. **"ยังวัดแอดได้มั้ย?"** — เพิ่มกลุ่มเช็ค `attribution` ใน `GET /api/health/self-test?projectId=...`
   อ่านข้อมูลจริง 7 วัน: จำนวนคลิกเข้าระบบ / คลิกจากแอดจริง (มี gclid ฯลฯ) / lead ทั้งหมด /
   lead ที่มีที่มา — แล้ว **บอกเลยว่าโซ่ขาดตรงไหน**:
   - `FAIL: มี lead แต่ไม่มีคลิกเลย` = โฆษณาไม่ได้วิ่งผ่าน tracking link/embed → เช็ค Final URL ของแอด
   - `FAIL: มีคลิกแต่จับคู่ไม่ได้` = ปุ่ม Add LINE ไม่ผ่านลิงก์ tracking (เหลือหน้าต่างจับคู่ 30 นาที)
   - `PASS` = วัดได้ปกติ พร้อมตัวเลข
   ระบบจับคู่เดิมทำงานเมื่อ "มีคลิก" เท่านั้น — lead ที่ทัก OA ตรง ๆ จะเป็น "ทักแล้ว"/Direct เสมอ ถูกต้องแล้ว
3. **bob@convertcake.com + apps@convertcake.com เห็นทุกโปรเจกต์** — เพิ่ม `LT_SUPER_VIEWERS`
   + `canSeeAllProjects()` ใน `clientAdmins.ts` (โค้ดชุดนี้ staff เห็นทุกโปรเจกต์อยู่แล้ว —
   ถ้า repo ฝั่ง dev มีการกรองโปรเจกต์ตามผู้ใช้ที่ใหม่กว่านี้ ให้เอา
   `canSeeAllProjects(session.user.email)` ครอบเงื่อนไขกรองนั้น 1 บรรทัด)
   ⚠️ ในข้อความสั่งพิมพ์มาเป็น "Bob@convertcaake.com" — ตีความเป็น `bob@convertcake.com`
   (สะกดตามโดเมนจริง) ถ้าตั้งใจใช้อีเมลอื่นแจ้งได้

### ช) Font เดียวกันทั้งระบบ

ตัวแอปใช้ **Noto Sans Thai** อยู่แล้ว (globals.css) — รอบนี้เก็บที่เหลือ:
`tailwind.config.ts` ตั้ง `font-sans` เป็น Noto Sans Thai (กัน class tailwind สลับ font) +
เอกสาร **export ทุกตัว** (แผน/preview/ad copy/launch-today/text ads) เปลี่ยนจาก
Segoe UI/Google Sans เป็น Noto Sans Thai พร้อม `@import` font ในไฟล์ HTML ที่ export

---

## ⚠️ ไฟล์ใหญ่ที่ทับทั้งไฟล์ — diff ก่อนถ้าเคยแก้เองหลัง 3 ส.ค.

`media-plans/[id]/build/page.tsx` · `media-plans/plan/page.tsx` · `launch-today/page.tsx` ·
`media-plans/[id]/preview/page.tsx` · `campaign-editor/page.tsx` · `keyword-planner/page.tsx` ·
`components/keyword-planner/KeywordPlannerEmbed.tsx`
(ที่เหลือเป็น API route / ไฟล์ใหม่ ทับได้เลย)

## เช็คหลัง deploy (5 นาที)

1. `GET /api/health/self-test?customerId=<CID>&projectId=<PID>` → ต้องเห็นกลุ่ม `attribution` เพิ่ม และ PASS ครบ
2. Media plan → Brief: ลาก Additional Notes ขยายได้ · Structure: เพิ่มแคมเปญจนเกินงบ → ปุ่มเกลี่ยงบโผล่
3. Keyword Research: ใส่ landing page + เลือกกลุ่ม → gen → ตารางมี sparkline/Bid ต่ำ-สูง/3 เดือน/YoY · กดวิเคราะห์ใหม่ → มีช่อง feedback
4. Tools → เห็น card **Text Ads Generator** → gen → preview → export → push (PAUSED)
5. Campaign Adjustment (PMax) → "สร้าง Asset Group ใหม่" อยู่ท้ายแผง · (Search) ฟอร์ม Text Ad มี preview + AI Gen + Export
6. Campaign Generator → ปุ่ม History → หลัง push รอบถัดไปต้องมี card ใหม่
7. Line Tracking sidebar → Settings มี 6 รายการ (เพิ่ม Conversion Mapping + Client Login)

## Rollback

โค้ดล้วน ไม่มี migration — ย้อน deploy ได้ทันที ตาราง `KeywordFeedback` ที่สร้างอัตโนมัติ
ปล่อยไว้ได้ไม่กระทบอะไร (ไม่มีใน schema.prisma โดยตั้งใจ)
