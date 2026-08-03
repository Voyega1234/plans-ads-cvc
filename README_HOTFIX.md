# 🔧 Hotfix 3 ส.ค. 2026 — วางทับ 7 ไฟล์ แล้ว build ได้เลย

ไม่ต้องรันสคริปต์ ไม่ต้องแตะ schema ไม่ต้องแตะ migration ไม่ต้อง backfill
เอา `src/` ในโฟลเดอร์นี้ทับ repo แล้ว build ได้เลย

```bash
rsync -a --exclude='.DS_Store' <โฟลเดอร์นี้>/src/  <repo>/src/
cd <repo> && npm install --legacy-peer-deps && npm run build
```

---

## ไฟล์ที่ทับ และแต่ละไฟล์แก้อะไร

| # | ไฟล์ | แก้เรื่อง |
|---|------|-----------|
| 1 | `src/app/api/upload/image/route.ts` | 🔴 **ต้นเหตุ** ของ push แล้วขึ้น `Unexpected token 'R'` |
| 2 | `src/app/api/campaign-edit/extensions/route.ts` | แผง Extensions ตอบ 400 `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE` |
| 3 | `src/app/api/webhooks/line/[projectId]/route.ts` | ถอดการตีกลับ `Invalid X-Line-Signature` ออก |
| 4 | `src/app/api/campaign-edit/campaigns/route.ts` | จำเป็นต่อไฟล์ 7 (type `CampaignSummary.biddingStrategyType`) |
| 5 | `src/app/api/campaign-edit/ad-groups/route.ts` | สร้าง ad group ใหม่ (`op: 'create'`) |
| 6 | `src/app/api/campaign-edit/ads/route.ts` | สร้าง text ad (RSA) ใหม่ |
| 7 | `src/app/campaign-editor/page.tsx` | ปุ่ม/ฟอร์มของข้อ 5 + 6 |

> ⚠️ **ไฟล์ 7 เป็นไฟล์ UI ขนาดใหญ่ (169 KB) และเป็นการทับทั้งไฟล์** ถ้าใน repo
> มีการแก้หน้านี้หลัง 3 ส.ค. 2026 ให้ diff ก่อนทับ อย่าทับทับทันที ที่เหลืออีก 6 ไฟล์
> เป็น API route ที่ทับได้ปลอดภัย

---

## 1️⃣ ไฟล์ที่ 1 — ต้นเหตุจริงของ `Unexpected token 'R', "Request En"...`

**ไม่ใช่บั๊กของ Google Ads และไม่ใช่บั๊กของหน้า push** แต่เป็นลูกโซ่นี้

1. บน Vercel ระบบไฟล์เขียนไม่ได้ ถ้าไม่มีที่เก็บไฟล์ถาวร `/api/upload/image`
   จะคืนรูปกลับมาเป็น **base64 data URL ทั้งก้อน**
2. ค่านั้นถูกฝังลงในตัวแผน (blueprint) → เวลากด Push ส่งขึ้นไปเป็น JSON ก้อนเดียว
3. รูป 3 MB → base64 ~4 MB → เกินเพดาน request body **4.5 MB** ของ Vercel
4. Vercel ตีกลับ **413 เป็นข้อความธรรมดา** `Request Entity Too Large`
   ตั้งแต่ก่อนถึงโค้ดเรา (ฝั่ง server จึงไม่มี log อะไรเลย)
5. หน้าเว็บเรียก `res.json()` ตรง ๆ → `Unexpected token 'R'`

### ✅ ทางแก้ที่ถูกต้องที่สุด — 3 นาทีใน Vercel ไม่ต้องแก้โค้ด

**Vercel dashboard → Storage → Create Blob store → Connect to project → Redeploy**

`BLOB_READ_WRITE_TOKEN` จะถูกใส่ให้เองอัตโนมัติ **โค้ดรองรับอยู่แล้ว** (มีมาตั้งแต่เดิม)
พอมี token แล้ว:

- รูปถูกอัปโหลดเป็นไฟล์จริง คืนกลับมาเป็นลิงก์ `https://…` สั้น ๆ
- **ส่งไฟล์ต้นฉบับเต็มความละเอียด ไม่มีการบีบอัดใด ๆ ทั้งสิ้น**
- แผนไม่บวม → ไม่มีทางชนเพดาน 4.5 MB อีก
- **และรูปไม่หายเวลารีสตาร์ท** (ตอนนี้อยู่ในตัวแผนอย่างเดียว)

### สิ่งที่ไฟล์นี้เพิ่มเข้าไป (กันระบบพังเงียบ ถ้ายังไม่ได้ต่อ Blob)

- **บอกโหมดออกมาทุกครั้ง** — response มีฟิลด์ `storage: 'blob' | 'base64' | 'file'`,
  `persisted`, และ `warning` เป็นภาษาไทยบอกตรง ๆ ว่าต้องทำอะไร
- **probe ตรวจได้ใน 2 วินาที** — `GET /api/upload/image` ตอบว่าตอนนี้เก็บรูปแบบไหน

  ```bash
  curl https://<โดเมน>/api/upload/image
  # ต่อ Blob แล้ว  → {"storage":"blob","persisted":true,"ok":true,"warning":null}
  # ยังไม่ได้ต่อ   → {"storage":"base64","persisted":false,"ok":false,"warning":"..."}
  ```

- **ตัดเฉพาะความละเอียดส่วนเกิน เฉพาะในโหมด base64 เท่านั้น**
  - รูปเล็กกว่า **700 KB → ไม่แตะเลย ไบต์ต่อไบต์**
  - ใหญ่กว่านั้น → ย่อเหลือด้านยาวสุด **1600px** ซึ่ง **ยังใหญ่กว่าทุก spec ที่
    Google ใช้จริง** (ใหญ่สุด 1200×1200 และ builder ของเราย่อลง spec อยู่แล้ว
    ก่อนส่ง Google) → **ปลายทางได้ภาพเท่าเดิม**
  - รูปโปร่งใส (โลโก้) **คง PNG** ไม่แปลงเป็น JPEG (ไม่งั้นพื้นหลังกลายเป็นดำ)
  - **GIF ไม่แตะเลย** (ย่อแล้วภาพเคลื่อนไหวหาย)
  - ย่อแล้วไม่เล็กลง / ย่อไม่สำเร็จ → ใช้ไฟล์เดิม ไม่ทำให้อัปโหลดพัง

  **พอต่อ Blob store แล้ว โค้ดส่วนนี้จะไม่ถูกเรียกเลยสักครั้ง**

---

## 2️⃣ ไฟล์ที่ 2 — แผง Extensions ตอบ 400

GAQL เดิมกรองด้วย `campaign.resource_name` / `campaign_asset.status` ใน `WHERE`
แต่ไม่ได้ SELECT ฟิลด์นั้น (Google บังคับว่าอะไรที่อยู่ใน WHERE ต้องอยู่ใน SELECT ด้วย)

แก้เป็น 2 ชั้น: ชั้น 1 query เดิมแต่ SELECT ครบ · ชั้น 2 ถ้ายังโดน `queryError`
แยกอ่าน `campaign_asset` กับ `asset` คนละ query แล้ว join ในโค้ด
error ที่ไม่ใช่ `queryError` (token หมดอายุ / สิทธิ์ไม่พอ) ยัง throw ตามเดิม ไม่ถูกกลบ

---

## 3️⃣ ไฟล์ที่ 3 — LINE ไม่ตีกลับเพราะลายเซ็นแล้ว

ตามคำสั่งเจ้าของระบบ: **เอา `Invalid X-Line-Signature` ออก**

- ยัง **คำนวณ** ลายเซ็นเหมือนเดิม แต่ **ไม่ return 401 อีกแล้ว** ไม่ว่ากรณีใด
- event ถูกประมวลผลต่อทุกกรณี · log ยังบันทึกครบ แต่สถานะเป็น `SUCCESS`
  พร้อมหมายเหตุว่า "ยืนยันลายเซ็นไม่ได้" (ไม่ใช่ 🚫 ปฏิเสธ อีกต่อไป)
- relay token ยังอยู่ในโค้ดครบ ถ้าวันหลังอยากเปิดการตรวจกลับ ใช้ได้ทันที

> ℹ️ ผลที่ตามมา: endpoint นี้ยกเว้น login อยู่แล้ว ลายเซ็นคือด่านตรวจเดียวที่มี
> เมื่อถอดออก ใครที่รู้ `projectId` (อยู่ใน URL) ยิง lead ปลอมเข้าระบบได้
> — เจ้าของระบบรับทราบและตัดสินใจแล้ว บันทึกไว้ตรงนี้เพื่อความครบถ้วน

---

## 5️⃣6️⃣7️⃣ ไฟล์ที่ 5–7 — สร้าง ad group + text ad ใหม่ใน Campaign Adjustment

**ad group ใหม่** — `POST /api/campaign-edit/ad-groups` รับ `op: 'create'` เพิ่ม
(`set_bid` / `set_status` เดิมไม่แตะ) ชนิด ad group เลือกอัตโนมัติตามชนิดแคมเปญ
(Search→`SEARCH_STANDARD`, Display→`DISPLAY_STANDARD`, Video→`VIDEO_RESPONSIVE`,
Demand Gen→`DEMAND_GEN_AD_GROUP`) เพราะ type ไม่ตรงกับแคมเปญ = Google ปฏิเสธทั้งก้อน
ไม่กรอก CPC bid = **ไม่ส่งฟิลด์นั้นไปเลย** (แคมเปญ smart bidding ส่งไปแล้วโดนตีกลับ)
PMax/Shopping สร้างจากหน้านี้ไม่ได้ (ใช้ asset group / ต้องผูก product group) — UI ซ่อนปุ่มให้แล้ว

**text ad ใหม่** — `POST /api/campaign-edit/ads` **ไม่ใส่ `?adId=`** = สร้างใหม่
(ใส่ `adId` = แก้ของเดิม พฤติกรรมเดิมไม่เปลี่ยนเลย) ยิงผ่าน `adGroupAds:mutate`
รองรับ RSA อย่างเดียว (ชนิดอื่นต้องมี asset รูป — ตอบ 400 บอกให้ไปสร้างจาก Media plan)
ตรวจกติกา Google ครบทั้งฝั่งหน้าเว็บและ API: พาดหัว 3–15 อัน ≤30 ตัวอักษร,
คำอธิบาย 2–4 อัน ≤90 ตัวอักษร, URL ต้องขึ้นต้น `http(s)://`, path ≤15 ตัวอักษร
— ผิดตรงไหนบอกเป็นภาษาไทยตรงจุด ไม่ปล่อยให้ Google ตีกลับเป็น error code

**UI** — ปุ่ม "สร้าง Ad Group ใหม่" ในแผง Ad Groups + "สร้าง Text Ad ใหม่" เหนือรายการ
โฆษณา (เฉพาะแคมเปญ Search) dropdown เลือก ad group ดึงสดจาก API → กลุ่มที่เพิ่งสร้าง
โผล่ทันที · นับตัวอักษรสด · สร้างเสร็จโหลดรายการใหม่เองไม่ต้องกดรีเฟรช
· ทุกอย่างผ่าน modal ยืนยันตัวเดิมก่อนยิงจริง

---

## ✅ ยืนยันแล้วฝั่งเรา (รันจริง ไม่ได้อ้างผลรอบก่อน)

เอา 7 ไฟล์นี้ทับ repo **ที่ยังไม่ได้แก้อะไรเลย** แล้วรัน

- `npx tsc --noEmit --incremental false` → **exit 0, ไม่มี error**
  (ที่ target ES5 ซึ่งเป็นค่าจริงของ `tsconfig.json` เพราะไม่ได้ตั้ง `target` ไว้)
- `npx next build` → **exit 0**, compiled successfully, **138/138 static pages**

---

## เช็คหลัง deploy

```bash
# 1) ระบบเก็บรูปแบบไหน (ต้นเหตุข้อ 1)
curl https://<โดเมน>/api/upload/image
#    ต้องได้ "storage":"blob" หลังต่อ Blob store แล้ว
```

2. **Extensions** — เปิดหน้าแก้ campaign → แท็บ Extensions → รีเฟรช ต้องไม่มี 400
3. **LINE** — ทัก OA 1 ข้อความ → ต้องขึ้น ✅ รับแล้ว และ **ไม่มี 🚫 ปฏิเสธ โผล่อีก**
4. **Push** — Media plan → Build → Push ต้องไม่ขึ้น `Unexpected token 'R'`
5. **Campaign Adjustment** — แคมเปญ Search → สร้าง Ad Group ใหม่ → สร้าง Text Ad
   ใหม่ในกลุ่มนั้น → เช็คซ้ำใน Google Ads UI ว่าขึ้นจริง

## Rollback

ทุกไฟล์เป็น route/component ของตัวเอง ไม่ได้แตะ schema / migration / env
ย้อน deploy กลับได้ทันทีโดยไม่ต้องทำอะไรกับ DB

## สิ่งที่ **ไม่ต้อง** ทำ

- ❌ **ห้ามรัน `backfill.sql`** ของแพ็กเกจ 30 ก.ค. — ตัดสินใจแล้วว่าไม่เอาข้อมูลชุดเก่า
- ❌ ไม่ต้องให้ผู้ใช้ sign-out
- ❌ ไม่ต้องแตะ schema / migration
