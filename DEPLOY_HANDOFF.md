# 🚀 Plans Ads (Mercy) — Deploy Handoff สำหรับทีม Dev

> **เป้าหมาย**: เอาโค้ดชุดนี้ **replace** deployment เดิมบน Vercel project `plans-ads-cvc`
> (domain: `mercy-cvc.vercel.app` / `plans-ads-cvc.vercel.app`)
> อ่านจบ ทำตามลำดับ 1→7 ได้โดยไม่ต้องถามใคร · ใช้เวลา ~30-45 นาที

---

## ⚡ สิ่งที่ทำเสร็จแล้ว (ห้ามทำซ้ำ)

| รายการ | สถานะ |
|---|---|
| Prisma schema → **PostgreSQL (Supabase)** | ✅ อยู่ในโค้ดแล้ว |
| สร้างตารางบน Supabase (schema `plans_ads`, 24 ตาราง) | ✅ push แล้ว — **ห้ามรัน `prisma migrate reset` เด็ดขาด** |
| ย้ายข้อมูล dev เดิมขึ้น Supabase (briefs 58, plans, logs) | ✅ เสร็จแล้ว |
| รองรับ Vercel Blob สำหรับรูปโฆษณา | ✅ อยู่ในโค้ด (แค่ตั้ง token — ขั้นตอน 3) |
| Push แคมเปญแบบทีละตัว (กัน serverless timeout) | ✅ อยู่ในโค้ด |
| Production build ทดสอบผ่าน (116 หน้า) | ✅ |

**คำสั่งเดียวที่เกี่ยวกับ DB ที่อนุญาต**: `npx prisma db push` (ใช้เมื่อ schema เปลี่ยนในอนาคตเท่านั้น)

---

## ขั้นตอนที่ 1 — เตรียมโค้ด

```bash
unzip plans-ads-deploy-*.zip -d plans-ads && cd plans-ads
npm install --legacy-peer-deps        # ⚠ ต้องมี --legacy-peer-deps (adapter รุ่น pin ไว้)
```

ทดสอบ build ในเครื่องก่อน (ต้องมีไฟล์ `.env` — ดูขั้นตอน 2 ว่าใช้ค่าไหน):

```bash
npx prisma generate
npm run build                          # ต้องจบด้วย "✓ Generating static pages (121/121)"
```

> ถ้าจะ deploy ผ่าน GitHub: push โค้ดขึ้น repo ของทีม แล้วผูกกับ Vercel project เดิม (Settings → Git)
> ถ้าจะ deploy ตรง: `npm i -g vercel && vercel link` (เลือก project `plans-ads-cvc`) แล้วขั้นตอนที่ 6

---

## ขั้นตอนที่ 2 — Environment Variables บน Vercel

เปิด **Vercel → project `plans-ads-cvc` → Settings → Environment Variables** (สโคป Production + Preview)

**หลักการ: ตัวแปรเดิมที่มีอยู่แล้วบน project “คงไว้ทั้งหมด” แล้วเพิ่ม/แก้ตามตารางนี้**

| ตัวแปร | ทำอะไร | เอาค่าจากไหน |
|---|---|---|
| `DATABASE_URL` | 🆕 เพิ่ม/แทนที่ | `postgresql://postgres:<PASSWORD>@db.hodljqrookmrnpmfobpy.supabase.co:5432/postgres?schema=plans_ads` (password = ตัวที่ทีมถืออยู่) |
| `DIRECT_URL` | 🆕 เพิ่ม | ค่าเดียวกับ `DATABASE_URL` |
| `BLOB_READ_WRITE_TOKEN` | 🆕 เพิ่ม | จากขั้นตอนที่ 3 |
| `NEXTAUTH_URL` | ✏️ เช็คให้ตรง | `https://mercy-cvc.vercel.app` |
| `AUTH_SECRET` | ✏️ ถ้ายังไม่มีให้สร้าง | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ มีจาก deploy เดิม | คงเดิม (OAuth login) |
| `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` / `GOOGLE_ADS_REFRESH_TOKEN` / `GOOGLE_ADS_DEVELOPER_TOKEN` | เช็คว่ามีครบ | ชุด env ที่ Bob ส่งให้ทาง secure channel |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | เช็ค | `6140243864` (MCC) |
| **AI ผ่าน OIDC (ไม่ใช้ key)** — `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_SERVICE_ACCOUNT_EMAIL`, (`VERTEX_LOCATION`), optional `GCP_AUDIENCE` | 🆕 ตั้งครบ = ระบบเรียก **Vertex AI ผ่าน Vercel OIDC** อัตโนมัติ | ดู "ขั้นตอน OIDC" ท้ายไฟล์ |
| `GEMINI_API_KEY` | ⛔ **ต้องไม่มีตัวแปรนี้** | ถ้ามี ให้ลบทิ้ง เพื่อไม่ใช้ Google AI Studio key |
| `ANTHROPIC_API_KEY` | optional fallback | คงไว้ได้เฉพาะถ้าต้องการ fallback ช่วงเปลี่ยนผ่าน |
| `MOCK_GOOGLE_ADS` / `MOCK_AI` | เช็ค | `false` ทั้งคู่ |
| `GTM_SERVICE_ACCOUNT_EMAIL` / `GTM_SERVICE_ACCOUNT_PRIVATE_KEY` | 🆕 ถ้าใช้ service mail | จากทีม (optional — GTM ใช้ session ของคนล็อกอินได้อยู่แล้ว) |
| `SKIP_AUTH` | ⛔ **ต้องไม่มีตัวแปรนี้** | ถ้ามี ให้ลบทิ้ง (เปิดแล้ว = ยิง API สร้างแคมเปญได้โดยไม่ล็อกอิน) |

หลัง deploy schema ล่าสุด ให้รัน `npx prisma db push` กับ Supabase เพื่อเพิ่มคอลัมน์ AI usage labels (`project`, `provider`, `feature`, `subfeature`, `label`) ใน `AiCostLog`.

> 🔑 **ไฟล์ env ชุดเต็ม (มี key จริง) Bob จะส่งให้ทางช่องทางปลอดภัยแยกต่างหาก — ไม่อยู่ใน zip นี้โดยตั้งใจ**

---

## ขั้นตอนที่ 3 — สร้าง Vercel Blob (ที่เก็บรูปโฆษณา)

1. Vercel Dashboard → แท็บ **Storage** (บนสุด) → **Create Database** → เลือก **Blob**
2. ตั้งชื่อ เช่น `plans-ads-images` → Create
3. หน้า Blob ที่สร้าง → **Connect Project** → เลือก `plans-ads-cvc` → Connect
   → Vercel จะเพิ่ม `BLOB_READ_WRITE_TOKEN` เข้า env ของ project ให้อัตโนมัติ

> ถ้าข้ามขั้นนี้: ระบบยังทำงาน แต่รูปจะเก็บแบบ base64 ชั่วคราว (ไม่ถาวร + หนัก) — **อย่าข้าม**

---

## ขั้นตอนที่ 4 — Google OAuth Redirect

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client (ตัวเดียวกับ `GOOGLE_CLIENT_ID`) → **Authorized redirect URIs** ต้องมี:

```
https://mercy-cvc.vercel.app/api/auth/callback/google
https://plans-ads-cvc.vercel.app/api/auth/callback/google
```

(อันไหนมีแล้วข้าม) · login จำกัดอีเมล `@convertcake.com` ในโค้ดอยู่แล้ว

---

## ขั้นตอนที่ 5 — เช็ค Vercel Plan (สำคัญ — จุดเดียวที่ deploy อาจ fail)

โค้ดตั้ง timeout ฟังก์ชัน (`maxDuration`) ไว้ 120–300 วินาทีสำหรับ route AI/push

- **Pro plan** → ผ่านเลย ไม่ต้องทำอะไร
- **Hobby plan** → build จะ fail พร้อมข้อความประมาณ `maxDuration must be less than or equal to 60`
  → แก้โดยรันคำสั่งนี้ที่ root โปรเจกต์ แล้ว deploy ใหม่:

```bash
grep -rl "export const maxDuration" src/app/api | xargs sed -i '' 's/export const maxDuration = [0-9]*/export const maxDuration = 60/'
```

(ระบบ push ยิงทีละแคมเปญอยู่แล้ว 60 วิ/แคมเปญเพียงพอในเคสปกติ)

---

## ขั้นตอนที่ 6 — Deploy

**ทาง A (GitHub):** push โค้ด → Vercel auto-build → รอ ✓ Ready

**ทาง B (CLI):**
```bash
vercel --prod
```

Build settings ใช้ default ของ Next.js ทั้งหมด (ไม่ต้องตั้ง Root Directory / Build Command เพิ่ม — `postinstall` รัน `prisma generate` ให้เอง)

---

## ขั้นตอนที่ 7 — ตรวจรับหลัง Deploy (ทำตามลำดับ)

| # | ทดสอบ | ผลที่ถูกต้อง |
|---|---|---|
| 1 | เปิด `https://mercy-cvc.vercel.app` | เด้งหน้า signin → login Google (@convertcake.com) ผ่าน |
| 2 | Sidebar → **All Plans** | เห็นแผน "Media Plan - Cojourney Visa" (ข้อมูลที่ migrate มา) |
| 3 | Sidebar → **Integrations** | กด **connect ใหม่ทุกตัว** (ของเดิมผูก user เก่า ไม่ได้ย้ายมา) |
| 4 | Sidebar → **Reports** → เลือก account → Export HTML | ไฟล์ดาวน์โหลดได้ กราฟครบ |
| 5 | **Launch Today** → เลือก account **Bob Test Automation (5482007847) เท่านั้น** → สร้าง 1 แคมเปญ Search → generate → upload รูป → Push | สำเร็จ · เข้า Google Ads เห็นแคมเปญ PAUSED · รูปที่อัปโหลดได้ URL ขึ้นต้น `https://...blob.vercel-storage.com` |
| 6 | ลบแคมเปญทดสอบใน Google Ads UI | — |

> ⛔ **กฎเหล็ก**: ทดสอบ push ได้เฉพาะ **Bob Test Automation (5482007847)** ห้ามยิงเข้า account ลูกค้า (Villa Market ฯลฯ) เด็ดขาด · ปุ่ม "Dry Run" ก็สร้างแคมเปญจริง (แบบ PAUSED)

---

## หลัง Go-live (ภายในวันเดียวกัน)

1. **Rotate password Supabase** (Dashboard → Settings → Database → Reset password) เพราะ connection string เคยถูกส่งผ่านแชท → อัปเดต `DATABASE_URL`/`DIRECT_URL` บน Vercel + แจ้ง Bob อัปเดตฝั่งเครื่อง dev
2. ลบ deployment preview เก่าที่ไม่ใช้ (housekeeping)

## Rollback (ถ้ามีปัญหา)

Vercel → project → **Deployments** → deployment เก่าตัวล่าสุดที่เคยใช้งาน → เมนู ⋯ → **Instant Rollback** (โค้ดเก่ายังใช้ SQLite ภายในตัวเอง ไม่ชนกับ Supabase)

## Troubleshooting

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| Build fail: `maxDuration ... 60` | Hobby plan → ทำขั้นตอนที่ 5 |
| `P1001: Can't reach database` | เช็ค `DATABASE_URL` + Supabase project ไม่ pause (free tier หยุดเองเมื่อ idle นาน — กด restore ใน dashboard) |
| Login แล้วเด้ง `redirect_uri_mismatch` | ขั้นตอนที่ 4 ยังไม่ครบ URI |
| รูปอัปโหลดแล้วหาย / URL เป็น `data:` ยาวๆ | ยังไม่ได้ต่อ Blob (ขั้นตอนที่ 3) |
| Push แล้ว "ขาดรูป Logo" | แคมเปญนั้นยังไม่ได้อัปโหลดรูปใน Ad Copy step — checklist ในหน้า QA/Push จะบอกว่าขาดอะไร (ระบบ crop ขนาดให้อัตโนมัติ ไม่ต้องกังวลสัดส่วน) |
| GTM error 401 ตอน push tracking | ให้ user logout → login ใหม่ แล้วติ๊กยอมรับสิทธิ์ Tag Manager ทุกข้อ |
| AI ตอบช้า/error 503 | Gemini ชั่วคราว — ระบบ fallback Anthropic เอง ลองใหม่ได้ |

---

## ขั้นตอน OIDC สำหรับ AI (Vertex AI — ไม่ต้องวาง GEMINI_API_KEY)

โค้ดใช้ `src/lib/ai/vertex-auth.ts` + provider `vertex` เป็น path หลัก — ตั้งครบ 5 env แล้วระบบเรียก Vertex ผ่าน OIDC โดยไม่ต้องมี `GEMINI_API_KEY`:

1. **GCP**: เปิด Vertex AI API ในโปรเจกต์ · สร้าง Service Account + ให้ role `roles/aiplatform.user`
2. **GCP → Workload Identity Federation**: สร้าง Pool + OIDC Provider โดย issuer = `https://oidc.vercel.com/<team-slug>` (ดู team slug ใน Vercel settings) · attribute mapping ตาม docs Vercel↔GCP · ผูก principal ของ Vercel project เข้ากับ SA (`roles/iam.workloadIdentityUser`)
3. **Vercel**: Project → Settings → **OIDC Federation** เปิดใช้ (issuer mode: Team)
4. ตั้ง env 5 ตัว (`GCP_PROJECT_ID/NUMBER`, `POOL_ID`, `PROVIDER_ID`, `SERVICE_ACCOUNT_EMAIL`) + `VERTEX_LOCATION` ถ้าไม่ใช่ us-central1 · ถ้าใช้ default/custom audience จาก GCP provider details ให้ใส่ `GCP_AUDIENCE`
5. **ลบ `GEMINI_API_KEY` ออกจาก Vercel Environment Variables**
6. แนะนำคง `ANTHROPIC_API_KEY` ไว้เป็น fallback ชั่วคราวช่วงเปลี่ยนผ่านได้ ถ้าทีมต้องการ
7. หมายเหตุ: OIDC ทำงานเฉพาะบน Vercel runtime — local dev ใช้ mock หรือ fallback provider อื่น

*จัดทำ 2026-07-06 (อัปเดต OIDC 2026-07-07) · โค้ดผ่านการทดสอบ end-to-end กับ Google Ads จริง (Bob Test), Supabase จริง, build 121 หน้า*
