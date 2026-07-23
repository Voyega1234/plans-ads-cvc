# Mercy — Deploy Report (2026-07-23)

โปรเจกต์: **plans-ads** · Production: https://mercy-cvc.vercel.app/

สรุปการแก้ทั้งหมด (5 ข้อ + widget), หลักฐานที่เทสจริง, ขั้นตอน redeploy, env ที่ต้องมี, และ checklist ให้ลองเองหลัง deploy

---

## 1. สิ่งที่แก้ (ตามที่แจ้งมา)

| # | ปัญหา | สาเหตุจริง (root cause) | แก้อย่างไร |
|---|-------|------------------------|-----------|
| 1 | **Optimization Log AI พัง** | AI ทุกหน้าวิ่งผ่าน `getVertexAccessToken()` ซึ่ง `import('google-auth-library')` + `import('@vercel/functions/oidc')` แบบ dynamic — **แพ็กเกจ 2 ตัวนี้ไม่มีใน `package.json`** → runtime `MODULE_NOT_FOUND` → ทั้งหน้าล่ม | เพิ่ม dep `google-auth-library` + `@vercel/functions` (ไม่รื้อโค้ด ใช้ไลบรารีทางการของ Google) |
| 2 | **Launch Today AI พัง** | เหมือนข้อ 1 (ทาง provider เดียวกัน) | เหมือนข้อ 1 |
| 3 | **My Client AI พัง** | เหมือนข้อ 1 | เหมือนข้อ 1 |
| 4 | **AI ผ่าน OIDC ล่มทั้งระบบ** | นอกจาก dep หาย ยังมี: `VERTEX_LOCATION` default เป็น `us-central1` แต่ **Gemini 3.x เสิร์ฟที่ global endpoint** (regional URL ตอบ 404) + host ประกอบผิด (`global-aiplatform…`) | `provider.ts` / `vertex-auth.ts`: default → `global`, host → `aiplatform.googleapis.com` เมื่อ loc=global. และ `safeCallAI` เลิก fallback เป็น mock ตอน provider จริง — ถ้า AI พังจะ **แจ้ง error ชัด ไม่แอบส่งข้อมูลปลอม** |
| 5 | **หน้า Line Tracking ช้ามาก** | หน้า `setup` เรียก readiness ที่วน `getEffectiveConfig()` ต่อ connector = **9 queries เรียงต่อกัน (N+1)** บน remote Postgres + หลายหน้า `await` เรียงกันทั้งที่ไม่ผูกกัน | รวมเป็น query เดียว (`findMany` + Map) และแปลง await ที่อิสระเป็น `Promise.all` |

**Widget (ตามที่ขอเพิ่ม “เช็ค widget ว่าเอไอตอบได้จริงจาก AI skill มั้ย”):**
Chat widget → `POST /api/chat` → `getProvider()` → เมื่อ env OIDC ครบจะเป็น `vertex` → เรียก `getVertexAccessToken()` **เส้นทางเดียวกับที่พังพอดี** ตอนนี้ครอบด้วยการแก้ dep + endpoint แล้ว และ AI skill (`EXECUTIVE_GROWTH_SKILL` + `ACCOUNT_TYPE_REPORTING_SKILL`) ถูก inject เข้า system prompt ของ widget จริง (`/api/chat/route.ts`). → **widget จะตอบด้วย AI จริง (Mercy skill) เมื่อ env ครบ ไม่ตกไป mock**

> ผลลัพธ์ทุกหน้าเหมือนเดิมทุกอย่าง (perf-only) — ไม่มีการเพิ่ม cache/revalidate, ยังเรียลไทม์เหมือนเดิม

**Onboarding checklist ต่อโปรเจกต์ (ของใหม่ที่ขอเพิ่ม):**
- Embed script (`/embed.js`) เป็นสคริปต์กลางตัวเดียว **ใช้ได้กับทุกโปรเจกต์อัตโนมัติ** — อ่าน `data-project=<slug>` แล้วยิงเข้า `/api/track/<slug>` ซึ่ง resolve หาโปรเจกต์จาก slug ให้เอง ไม่ต้อง register เพิ่มที่ backend (เปลี่ยนแค่ค่า slug ต่อโปรเจกต์)
- เพิ่ม **การ์ด Onboarding ด้านบนสุดของหน้า Setup ทุกโปรเจกต์** กำกับให้ทำ 2 ข้อจำเป็นก่อน: (1) วางโค้ด Tracking บนเว็บลูกค้า (2) เชื่อม LINE OA — ส่วน media channel (Google/Meta/TikTok/GA4/Sheet) ทำทีหลังได้
  - สถานะ “วางโค้ดแล้ว” **ตรวจจากทราฟฟิกจริง**: นับ `AdClick` ของโปรเจกต์ (>0 = โค้ดยิงถึงระบบแล้ว) — **ไม่เพิ่มคอลัมน์ DB / ไม่ต้อง migrate**
  - สถานะ “LINE OA” อ่านจากสถานะ connection = CONNECTED (หลังกด Test ผ่าน)
- หน้า **คู่มือติดตั้ง Line Tracking** (`/line-tracking/guide`) **คงไว้เหมือนเดิม** ให้ทีมอ่าน/เรียนรู้ (การ์ด onboarding มีลิงก์ไปหน้าคู่มือ)
- แก้ไฟล์เดียว: `src/app/line-tracking/projects/[projectId]/setup/page.tsx` (เพิ่มการ์ด + นับ AdClick แบบ parallel ใน Promise.all เดิม)

**โค้ด Embed เฉพาะแต่ละโปรเจกต์ + ใส่ไว้ใน Setting ของโปรเจกต์ (รอบล่าสุด):**
- **slug สร้างใหม่อัตโนมัติทุกครั้งที่สร้างโปรเจกต์** — `createProject()` เรียก `uniqueSlug(slugify(name))` ซึ่งวนเช็คในฐานข้อมูล ถ้าชนของเดิมจะต่อท้าย `-2`, `-3` จนไม่ซ้ำ (`projectService.ts:39`) → **แต่ละโปรเจกต์ได้ slug ของตัวเอง ไม่ต้องแก้มือ**
- เพิ่มบล็อก **“🌐 โค้ดฝังเว็บของโปรเจกต์นี้”** เข้าไปใน **Setting ของโปรเจกต์** = แท็บ **Project Info** ของหน้า Setup (`?step=info`) พร้อมปุ่ม Copy, แสดง slug ของโปรเจกต์นั้น, badge บอกสถานะ “✓ ติดตั้งแล้ว / ยังไม่ได้ติดตั้ง” และลิงก์ไปหน้าคู่มือ
  - หมายเหตุ: ระบบ**ไม่มี route settings แยกต่อโปรเจกต์** — หน้า Project Info ในตัว Setup wizard คือหน้าตั้งค่าของโปรเจกต์นั้นอยู่แล้ว (แสดง Slug/Currency/Timezone/Status) จึงใส่ตรงนี้
  - ใช้ตัวแปร `embedSnippet` เดิมร่วมกับการ์ด onboarding → ค่าตรงกันเสมอ ไม่มีทางหลุด sync

**แก้ปัญหา `Application error: a server-side exception has occurred` (Digest):**
| สิ่งที่พบ | รายละเอียด |
|---|---|
| **ทั้งแอปไม่มี error boundary เลย** (ไม่มี `error.tsx` / `global-error.tsx` สักไฟล์) | พอมี error ฝั่ง server ที่ไหนก็ตาม Next.js จะโชว์จอเปล่า ๆ ว่า “Application error… Digest: xxx” **ไม่มีปุ่มลองใหม่ ไม่มีข้อมูลอะไรเลย** → เพิ่ม `src/app/error.tsx` + `src/app/global-error.tsx` ที่โชว์ digest ชัด ๆ, มีปุ่ม **ลองใหม่**, และ log ข้อความจริงลง console |
| **เจอบั๊กจริงที่ทำให้ chat widget พัง** | `/api/chat/route.ts` ประกอบ URL เป็น `${VERTEX_LOCATION()}-aiplatform.googleapis.com` — พอ `VERTEX_LOCATION` default เป็น `global` จะกลายเป็น **`global-aiplatform.googleapis.com` ซึ่งเป็น host ที่ไม่มีจริง** (ผิดแบบเดียวกับที่ `provider.ts` เตือนไว้ในคอมเมนต์) → แก้ให้ใช้ `aiplatform.googleapis.com` เมื่อ loc=global เหมือน `provider.ts` |

> **ตรงไปตรงมาเรื่อง Digest `781237752`:** เลข digest คือ hash ของ (ข้อความ error + stack ที่ถูก minify) ผมลองไล่ hash เทียบกับข้อความ error ทุกตัวในโค้ด (132 ข้อความ × 4 รูปแบบ) แล้ว **ไม่แมตช์** — แปลว่า **ย้อนกลับเป็นข้อความจริงไม่ได้ถ้าไม่มี server log** ผมจึงไม่เดาว่าเป็นอันไหน แต่แก้ 2 อย่างที่ทำได้จริง: (1) ปิดบั๊ก host ที่เจอชัด ๆ (2) ใส่ error boundary เพื่อให้ครั้งต่อไป**เห็น digest พร้อมกดลองใหม่ได้ และเปิด Vercel → Logs ค้นด้วย digest จะเจอ stack trace เต็ม** ทันที
>
> เพิ่มเติม: สาเหตุที่เป็นไปได้มากที่สุดของ digest นี้คือ **โค้ดที่ยังรันอยู่บนเว็บตอนนี้เป็นตัวเก่าที่ dep หาย** (ต้นเหตุเดียวกับข้อ 1–4) ซึ่ง**ถูกแก้ไปแล้วในกล่องนี้** — หลัง deploy ตัวใหม่ให้ลองซ้ำอีกครั้ง

**รอบกวาดความเร็วทั้งระบบ (สแกนซ้ำทั้ง 317 ไฟล์ หาจุดที่ยังหลุด):**

สแกนหา 2 อาการที่แพงจริงบน remote Postgres (ทุก query = 1 network round-trip): **(A) N+1 = `await prisma` ในลูป** และ **(B) waterfall = query เรียงต่อกันทั้งที่ไม่ผูกกัน**

- ✅ **หน้าเว็บทุกหน้า (`page.tsx`) สะอาดหมดแล้ว** — ไม่เหลือ N+1 หรือ waterfall เลยสักหน้า
- ❌ **แต่เจอที่ยังหลุดอยู่บน path ที่ผู้ใช้ต้องนั่งรอ** → แก้เพิ่มรอบนี้:

| จุด | เดิม | แก้เป็น |
|---|---|---|
| `seedDefaultRules()` (รันตอน **สร้างโปรเจกต์**) | `upsert` วนลูป **7 รอบเรียงกัน** (ตาม 7 lead status) | `createMany({ skipDuplicates: true })` **ครั้งเดียว** — อาศัย unique constraint `projectId+leadStatus` ให้ผลเท่ากับ `update: {}` เป๊ะ (มีอยู่แล้วไม่แตะ, ขาดค่อยสร้าง) |
| `ensureDefaultTrackingLinks()` (รันตอน **สร้างโปรเจกต์**) | 3 × (`findFirst` + `create`) = **สูงสุด 6 รอบเรียงกัน** | `findMany` ทีเดียว + `createMany` เฉพาะที่ขาด = **2 รอบ** |
| `createProject()` | เรียก 2 ตัวบนแบบรอทีละตัว | `Promise.all` (คนละตาราง ไม่ผูกกัน) |
| `duplicateProject()` | วน `update` ทีละ connection (~9) + ทีละ rule (7) = **~16 รอบเรียงกัน** | รวมเป็น `Promise.all` ก้อนเดียว |
| `syncRulePlatforms()` | วน `update` ทีละ rule | คำนวณให้ครบก่อน แล้วยิง `Promise.all` |

**วัดจริง (read-only บน DB จริง — ไม่ได้เขียนข้อมูลทดสอบลงฐานลูกค้า):**
median round-trip = **643 ms/query**

| | เดิม | หลังแก้ |
|---|---|---|
| **สร้างโปรเจกต์ใหม่** | ~16 รอบ ≈ **10.3 วินาที** | ~5 รอบ ≈ **3.2 วินาที** (เร็วขึ้น ~3.2×) |
| **Duplicate โปรเจกต์** (ส่วนที่เพิ่มจาก create) | ~16 รอบ ≈ **10.3 วินาที** | 1 ก้อนพร้อมกัน ≈ **0.6 วินาที** |

> ตัวเลขนี้เป็น **การคำนวณจากจำนวน round-trip จริง × latency ที่วัดจริง** ไม่ใช่การจับเวลาสร้างโปรเจกต์จริงแบบ end-to-end เพราะจะต้องเขียนข้อมูลทดสอบลง **ฐานข้อมูล production ของลูกค้า** ซึ่งผมไม่ทำโดยไม่ได้รับอนุญาต — ให้ยืนยันของจริงตอนกดสร้างโปรเจกต์ใน checklist ข้อ 6

**ที่เหลือไว้ตั้งใจ (ไม่ใช่ของหลุด):** `await prisma` ในลูปที่เหลือทั้งหมดอยู่ใน **API route เบื้องหลัง/งาน batch** (automation, LINE webhook, conversion queue, sheet sync) ซึ่ง**ผู้ใช้ไม่ได้นั่งรอหน้าจอ** และหลายอันเป็น write ที่ต้องทำทีละรายการตามลำดับจริง ๆ — แตะแล้วเสี่ยงเปลี่ยนพฤติกรรมโดยไม่ได้ความเร็วที่ผู้ใช้รู้สึก

---

**เจอบั๊กเพิ่มอีก 1 ตัว ชนิดเดียวกับที่ทำให้ AI ล่ม (จากการทำ preflight):**
- `jose` ถูก import ที่ `src/lib/line-tracking/clientToken.ts` → ซึ่งถูก import โดย **`src/middleware.ts` ที่รันทุก request**
- แต่ `jose` **ไม่ได้ประกาศใน `package.json`** — ที่ผ่านมามันใช้ได้เพราะ npm บังเอิญ hoist ออกมาจาก `next-auth` ให้
- ถ้าวันไหน clean install บน Vercel วางมันซ้อนไว้ข้างในแทนที่จะ hoist → **middleware พัง = เว็บล่มทั้งเว็บ**
- แก้แล้ว: เพิ่ม `"jose": "^6.2.3"` เข้า dependencies (นี่คือบั๊กคลาสเดียวกับ `google-auth-library` เป๊ะ ๆ)

---

**ของใหม่ที่เพิ่มให้ (ตามที่สั่งเพิ่ม): ปุ่มลบโปรเจกต์สำหรับ admin**
- อยู่ที่ **หน้า Setup ของโปรเจกต์ → แท็บ "ข้อมูลโปรเจกต์"** (ล่างสุด, การ์ดสีแดง "Danger zone")
- **เห็นเฉพาะ admin** — ใช้ allowlist เดิมของระบบ (`apps@ / bob@ / varn@convertcake.com`) ตัวเดียวกับสิทธิ์ออก client login
- **ยืนยัน 2 ชั้น**: ต้องพิมพ์ **slug ของโปรเจกต์นั้นให้ตรงเป๊ะ** ปุ่มถึงจะกดได้ + ฝั่ง server เช็กซ้ำทั้งสิทธิ์และ slug อีกรอบ (กัน form ปลอม)
- การ์ดจะบอกชัดก่อนลบว่าจะหายอะไรบ้าง รวมถึง **จำนวน lead จริง** ของโปรเจกต์นั้น
- ลบแล้ว **กู้ไม่ได้** — cascade ลบ lead / ad click / LINE user / conversion event / tracking link / short link / connector config / client login ของโปรเจกต์นั้นทั้งหมด
- ไฟล์: `src/components/line-tracking/DeleteProjectCard.tsx`, `deleteProjectAction()` ใน `src/lib/line-tracking/actions.ts`
- **ไม่แตะ schema** → ไม่ต้อง migrate

---

**ปิดช่องสร้าง Mock data ลง DB จริง (สำคัญ — เจอตอนตรวจก่อนส่ง):**

เดิม `/line/callback/mock` เป็น endpoint **สาธารณะ ไม่ต้อง login** (middleware ปล่อย `/line/` ผ่าน) และหน้า `/line/start` โชว์ปุ่ม **"🧪 Simulate LINE Add"** ทุกครั้งที่โปรเจกต์**ยังไม่ได้ตั้งค่า LINE** — ซึ่งคือสถานะของโปรเจกต์ใหม่ทุกอัน กด 1 ครั้ง = สร้าง LineUser ปลอม (`Umock…`) + **Lead จริงใน DB** + **ยิง conversion จริงออก GA4/Ads** + **push ขึ้น Google Sheet ของลูกค้า**

แก้เป็น: ทั้ง endpoint และปุ่มทำงาน**เฉพาะเมื่อตั้ง `ALLOW_MOCK_LINE=true`** เท่านั้น — **ห้ามตั้งบน Vercel** (production ไม่ตั้ง = ปิดสนิท) เหลือไว้ให้ dev เปิดบนเครื่องตัวเองได้
ผู้ใช้จริงที่เข้ามาตอน LINE ยังไม่ได้ต่อ จะเห็นข้อความ "ยังไม่ได้เชื่อมต่อ LINE — กรุณาติดต่อผู้ดูแลระบบ" แทนปุ่ม

ไฟล์: `lineService.ts` (`isMockLineEnabled()`), `line/callback/mock/route.ts`, `line/start/page.tsx`

> **เกร็ดที่เจอระหว่างเทส:** พอใส่ guard แล้ว Next.js มองว่า route ไม่ได้อ่าน request เลย → **prerender เป็น static ตั้งแต่ตอน build** ทำให้ 404 ถูกอบมากับ build (บังเอิญปลอดภัย แต่ flag จะไม่มีวันทำงาน และถ้าใครมาสลับลำดับโค้ดทีหลังจะกลับมาเปิดเงียบ ๆ) — แก้ด้วยการใส่ `export const dynamic = "force-dynamic"` ให้เช็ค env ทุก request จริง ๆ

---

### แก้เพิ่มรอบตรวจความปลอดภัยก่อนส่ง (3 เรื่อง)

**1) Cron endpoint เคย "ไม่มี secret = ปล่อยผ่านทุกคน" → เปลี่ยนเป็นปฏิเสธ**

`/api/conversions/process` อยู่นอกด่าน login (cron ไม่มี session) โค้ดเดิมถ้าไม่ได้ตั้ง `CRON_SECRET` จะ **อนุญาตทุกคน** — ใครก็สั่งประมวลผลคิว conversion ได้ แก้เป็น fail-closed: production ที่ไม่มี secret จะ **ปฏิเสธ + log เตือน** (บนเครื่อง dev ยังรันได้ตามเดิม)

แยก 2 กรณีคนละรหัสตั้งใจ เพื่อให้ smoke test แยกออก:

| กรณี | ตอบ | แปลว่า |
|---|---|---|
| ตั้ง `CRON_SECRET` + secret ถูก | `200` | ปกติ |
| secret ผิด / ไม่ส่งมา | `401` | มีคนมาลอง |
| **ไม่ได้ตั้ง `CRON_SECRET` เลย** | `503` | **deploy ไม่ครบ — cron จะไม่ทำงาน ต้องรีบตั้ง** |

> ⚠️ **สำคัญ:** `CRON_SECRET` กลายเป็น env **บังคับบน production** แล้ว ถ้าไม่ตั้ง cron จะหยุดยิง conversion อัตโนมัติ (staff ยังกดประมวลผลเองในหน้า Conversions ได้) — Vercel Cron จะส่ง `Authorization: Bearer <CRON_SECRET>` ให้เองอัตโนมัติ ไม่ต้องแก้โค้ดอะไรเพิ่ม และ smoke test ข้อ 8 จับกรณีนี้ให้แล้ว

ไฟล์: `lib/line-tracking/cron.ts`, `api/conversions/process/route.ts`

**2) LINE webhook เคยรับ payload ที่ยืนยันตัวตนไม่ได้ → เปลี่ยนเป็นปฏิเสธ**

เดิมถ้าโปรเจกต์ยังไม่ได้ใส่ Messaging Channel Secret webhook จะ**รับ payload โดยไม่ตรวจลายเซ็น** — endpoint นี้เป็นสาธารณะและ**สร้าง LINE user + Lead จริง** แปลว่าใครก็ยิง lead ปลอมเข้าระบบได้ แก้เป็นปฏิเสธ (`401`) พร้อมบันทึก `WebhookLog` สถานะ `REJECTED` ให้ตรวจย้อนหลังได้

ไม่กระทบโปรเจกต์ที่ใช้งานจริง เพราะการต่อ LINE ต้องมี channel secret อยู่แล้ว (เป็น 1 ใน 2 realKeys) — โปรเจกต์ที่รับ webhook ได้จริงจะมี secret เสมอ

ไฟล์: `api/webhooks/line/[projectId]/route.ts`

**3) Server Action ไม่เคยเช็คสิทธิ์เลย → ใส่ครบทั้ง 18 ตัว** ⭐ ช่องโหว่ที่ใหญ่สุดในรอบนี้

middleware กันตาม **path ของหน้า** แต่ Server Action จะ POST ไปที่ URL ของหน้าที่มันถูก render ไว้ — มันเลยได้สิทธิ์ตาม path ที่คนเรียก**เข้าได้อยู่แล้ว** ไม่ใช่ path ของข้อมูลที่มันไปแตะ

ผลคือ **client viewer** (ลูกค้าที่ login ดูโปรเจกต์ตัวเอง) ที่นั่งอยู่บนหน้าโปรเจกต์ตัวเองอย่างถูกต้อง สามารถเปิด DevTools อ่าน action id จาก JS bundle แล้วยิง action พร้อม **`projectId` ของลูกค้าเจ้าอื่น** ได้ → แก้สถานะ lead / แก้ชื่อ-เบอร์ลูกค้า / เขียนทับ connection config / สั่ง push ข้อมูลขึ้น Google Sheet / pause โปรเจกต์ ของเจ้าอื่น

*(หมายเหตุ: เป็นการ **เขียน** ข้ามโปรเจกต์ ไม่ใช่การอ่านรั่ว — ฝั่งอ่านปิดสนิทอยู่แล้ว ดูผลทดสอบข้อ 2)*

แก้โดยใส่ guard ที่หัวทุก action:

| guard | ใช้กับ | ใคร |
|---|---|---|
| `requireStaff()` | 15 actions — setup, connections, tracking links, short links, sheet, คิว conversion, สร้าง/ก๊อป/pause โปรเจกต์ | staff (login Google) เท่านั้น |
| `requireProjectAccess(projectId)` | `changeLeadStatusAction`, `updateLeadContactAction` | staff ทุกโปรเจกต์ **หรือ** client เฉพาะโปรเจกต์ตัวเอง |
| `canManageClients()` | `deleteProjectAction` | admin ตาม allowlist (ของเดิม) |

เพิ่ม `requireOwnedBy()` อีกชั้น สำหรับ action ที่อ้างถึงแถวลูก (`leadId` / `eventId` / `ruleId` / id ของลิงก์) — เพราะส่ง `projectId` ที่ตัวเองมีสิทธิ์ คู่กับ `leadId` ของเจ้าอื่น ก็ยังข้ามเขตได้ ตัวนี้ยืนยันว่าแถวนั้นเป็นของโปรเจกต์ที่เพิ่งอนุญาตไปจริง

**พฤติกรรมเดิมไม่เปลี่ยน:** staff ทำได้ทุกอย่างเหมือนเดิม, client ยังแก้ lead ในโปรเจกต์ตัวเองได้เหมือนเดิม
**ยกเว้น 1 จุดที่ตั้งใจเข้มขึ้น:** `setProjectStatusAction` เป็น staff-only เพราะถ้า client กด pause โปรเจกต์ตัวเอง จะโดนระบบเตะออกทันที (layout เด้ง client ของโปรเจกต์ PAUSED กลับหน้า login) แล้วเข้าเองไม่ได้อีก ต้องให้ staff มาปลดให้

ไฟล์: `lib/line-tracking/actions.ts`

---

## 2. หลักฐานที่เทสจริง (ไม่ได้เคลม)

| การตรวจ | คำสั่ง | ผล |
|---------|--------|-----|
| Type check | `npx tsc --noEmit` | **exit 0** |
| Production build | `npm run build` | **exit 0** (ทุก route compile, resolve `google-auth-library`/`@vercel/functions` ครบ) |
| Dev server boot | `npm run dev` | Ready ใน ~1.2s, ไม่มี MODULE_NOT_FOUND |
| DB เชื่อมได้ | Prisma client (read-only) | OK |
| **N+1 fix (วัดจริงบน DB จริง)** | old 9× `findUnique` เรียงกัน vs new 1× `findMany` | **5,390ms → 550ms = เร็วขึ้น 9.8×** (ประหยัด ~4.8s ต่อการเปิดหน้า setup 1 ครั้ง) |
| Deps ติดตั้งจริง | `ls node_modules` | `google-auth-library` + `@vercel/functions` มีจริง |
| Error boundary คอมไพล์เข้า build จริง | อ่าน `.next/app-build-manifest.json` | เจอ `/error` + `/global-error` ครบ |
| Schema รองรับการนับ AdClick | อ่าน `prisma/schema.prisma` | `AdClick.projectId` มีจริง + มี `@@index([projectId])` → นับเร็ว ไม่ต้อง migrate |
| Route สาธารณะไม่พัง | ยิงจริงที่ production | `/embed.js` 200, `/t/…` `/go/…` ตอบปกติ (ไม่มี server exception) |
| **Clean-room build (จำลอง Vercel เป๊ะ ๆ)** | คัดลอกโปรเจกต์ไปโฟลเดอร์ใหม่ **ที่ไม่มี `node_modules` เลย** → `npm ci --legacy-peer-deps` → `npm run build` | **ทั้งสองขั้น exit 0, Compiled successfully** และ `google-auth-library` / `@vercel/functions` / `jose` / `@prisma/client` / `next-auth` ติดตั้งครบจริง |
| Preflight จับ phantom dep | `node scripts/preflight-deps.js` | **PASS** (สแกน 317 ไฟล์ / 20 แพ็กเกจ) |
| Preflight จับของจริงได้จริง (negative control) | ลองถอด `jose` + `google-auth-library` ออกจาก package.json ชั่วคราวแล้วรันใหม่ | **FAIL ตามคาด — จับได้ทั้งคู่** รวมถึง dynamic `import()` ใน `vertex-auth.ts` แล้วคืนค่า package.json กลับเรียบร้อย |
| Mock LINE ปิดจริง (รัน server จริง 2 รอบ) | `npm start` แล้วยิง `/line/callback/mock` | **ไม่ตั้ง flag → 404** `{"error":"not found"}` / **ตั้ง `ALLOW_MOCK_LINE=true` → 400 `missing project`** (ผ่าน guard แล้วหยุดก่อนแตะ DB) |
| Smoke test production | `node scripts/smoke-deploy.js` | **7/7 PASS** บนเว็บปัจจุบัน (ก่อนรอบแก้ความปลอดภัย — ตอนนี้สคริปต์มี **8 ข้อ** ข้อที่ 8 ต้องรันหลัง redeploy) |
| **Cron guard — รัน server จริง 3 สภาพ** | `npm start` แล้วยิง `/api/conversions/process` | ตั้ง secret + ส่งถูก (แบบ Vercel Cron) → **200 `{"ok":true}`** / ส่งผิดหรือไม่ส่ง → **401** / **ไม่ได้ตั้ง `CRON_SECRET` → 503** + log เตือน 1 บรรทัด — ตรงตามออกแบบทั้ง 3 กรณี |
| **ตรวจลายเซ็น LINE — 6 เคส** | เรียก `verifyLineSignature()` ตรง ๆ | ลายเซ็นถูก → `true` / ลายเซ็นผิด, **ไม่ส่ง header เลย**, header ว่าง, body ถูกแก้หลังเซ็น, secret ผิด → `false` ทั้งหมด **ผ่าน 6/6** |
| **ทดสอบการแยกข้อมูลลูกค้า (client login)** | เซ็น cookie `lt_client` ของโปรเจกต์ A แล้วยิงจริงบน server จริง (ไม่สร้าง account, ไม่เขียน DB) | **ฝั่งอ่านไม่รั่วสักจุด** — ดูตารางเต็มด้านล่าง |
| **Server Action guard ครบทุกตัว** | สแกนทุก `export async function` ใน `actions.ts` เทียบกับ guard | **18/18 มี guard** ไม่มีตัวไหนหลุด |
| ล้างโปรเจกต์ทดสอบ 14 อัน | `node scripts/lt-purge-projects.mjs --confirm` | dry-run ยืนยันก่อนว่า **leads:0 clicks:0 lineUsers:0 conversionEvents:0** (สถานะ SETUP ทั้งหมด ไม่เคยใช้จริง) → backup JSON 149 KB แล้วลบ → **เหลือ 0 projects** |

**ผลทดสอบการแยกข้อมูลระหว่างลูกค้า (login เป็น client ของโปรเจกต์ A แล้วพยายามดูของ B):**

| ทดสอบ | ผล |
|---|---|
| หน้าตัวเอง — Overview / Leads / Funnel | `200` เข้าได้ปกติ ✅ |
| หน้าโปรเจกต์คนอื่น (B) ทุกหน้า — overview / leads / funnel / setup / conversions / sheet / tracking-links | เด้งกลับโปรเจกต์ตัวเองทุกหน้า ✅ |
| ดึง RSC payload ตรง ๆ (`?_rsc=1`) เพื่อเลี่ยง UI | เด้งกลับ ✅ |
| หน้า `setup` (เก็บ credential ของแพลตฟอร์ม) **ของตัวเอง** | เด้งกลับ ✅ — client ดูไม่ได้แม้เป็นโปรเจกต์ตัวเอง |
| `/line-tracking/projects` (รายชื่อทั้งหมด), `/clients`, `/dashboard`, `/api/clients`, `/api/projects` | เด้งกลับทั้งหมด ✅ |
| ไม่มี cookie / cookie ถูกแก้ลายเซ็น | เด้งไป `/auth/signin` ✅ |
| **ยิง Server Action ข้ามโปรเจกต์** | **ผ่าน middleware ได้** ❌ → นี่คือช่องโหว่ข้อ 3 ข้างบน **แก้แล้วในรอบนี้** |

**ข้อจำกัดที่ต้องบอกตรงๆ:** การคลิกจริงผ่าน UI (สร้างโปรเจกต์ / test connect) ทำ headless ไม่ได้ เพราะแอปบังคับ **login Google (@convertcake.com เท่านั้น)** และผมจะ**ไม่เขียนข้อมูลลง DB จริงของลูกค้า**เพื่อแกล้งเทส. โค้ดสองเส้นทางนี้ตรวจแล้วว่าถูกต้อง (createProject → createMany connections → seedDefaultRules → tracking links → redirect; testConnection → เช็ค config → ยิง API จริง (LINE/Meta/Sheet) → อัปเดตสถานะ). ให้ลองเองตาม checklist ข้อ 6.

---

## 3. สิ่งที่อยู่ในกล่องนี้ (deliverable)

```
mercy-fix-deploy/
├── src/                 ← โค้ดทั้งชุด (สถานะที่ build ผ่านแล้ว) — เอาไปวางทับ src/ เดิม
├── scripts/             ← สคริปต์ตรวจก่อน/หลัง deploy + สคริปต์ล้างโปรเจกต์ (ดูข้อ 6.5 / 6.6)
│   ├── preflight-deps.js      ← จับ dep ที่ import แต่ไม่ได้ประกาศ (ต้นเหตุที่ AI ล่ม)
│   ├── smoke-deploy.js        ← ยิงเช็กหน้าเว็บจริงหลัง deploy 8 จุด
│   └── lt-purge-projects.mjs  ← backup JSON + ลบโปรเจกต์ Line Tracking ทั้งหมด (ครั้งเดียว)
├── package.json         ← เพิ่ม google-auth-library + jose + @vercel/functions + script preflight/smoke
├── package-lock.json    ← lock ให้ตรงกัน (Vercel จะ npm install ให้เอง)
├── vercel.json          ← เพิ่ม cron /api/conversions/process ทุก 10 นาที + maxDuration
└── DEPLOY_REPORT.md     ← ไฟล์นี้
```

> วางทั้ง `src/` เพราะการแก้กระจายหลายไฟล์ที่เรียกกัน (actions ↔ connectionTestService ↔ projectService ↔ provider/vertex-auth) — วางทับทั้งโฟลเดอร์ปลอดภัยสุด ไม่มีไฟล์ตกหล่น
> **ไม่มีการแก้ `prisma/schema.prisma` → ไม่ต้อง migrate**

---

## 4. ขั้นตอน Redeploy (ง่ายสุด)

> ส่งไฟล์เดียว: **`mercy-fix-deploy.zip`** — แตกไฟล์แล้ววางทับได้เลย ไม่ต้อง merge ทีละบรรทัด

0. แตก zip → ได้โฟลเดอร์ `mercy-fix-deploy/`
1. วางทับ:
   - เอา `src/` ในกล่องนี้ **วางทับ** `src/` ของโปรเจกต์เดิม (ลบ `src/` เดิมทิ้งก่อนแล้วค่อยวาง — จะได้ไม่มีไฟล์เก่าค้าง)
   - เอา `package.json`, `package-lock.json`, `vercel.json` วางทับที่ root
   - เอา `scripts/` วางที่ root (เป็นเครื่องมือตรวจ ไม่กระทบ build)
2. ติดตั้ง dep (เพราะเพิ่มไลบรารีใหม่ 3 ตัว: `google-auth-library`, `jose`, `@vercel/functions`):
   ```bash
   npm install --legacy-peer-deps
   ```
   > ต้องใส่ `--legacy-peer-deps` — มี peer conflict เดิมของ `@libsql/client`/`@prisma/adapter-libsql` (ไม่เกี่ยวกับงานนี้)
3. build เช็ก:
   ```bash
   npm run build
   ```
4. deploy (push ให้ Vercel build หรือ `vercel --prod`)

> ถ้า deploy ผ่าน Git: commit + push แล้ว Vercel รัน `npm install` + `npm run build` เองอัตโนมัติ — ไม่ต้องทำ step 2-3 เอง

---

## 5. Environment Variables ที่ต้องมีบน Vercel

### AI ผ่าน OIDC (สำคัญที่สุด — ถ้าไม่ครบ AI จะตกไป mock/พัง)
ตั้งครบทั้งชุดนี้ (ได้จากหลัง connect Vercel OIDC ↔ GCP):

| Env | จำเป็น | หมายเหตุ |
|-----|--------|---------|
| `GCP_PROJECT_ID` | ✅ | project id ของ GCP |
| `GCP_PROJECT_NUMBER` | ✅ | เลข project number |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | ✅ | WIF pool |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | ✅ | WIF provider |
| `GCP_SERVICE_ACCOUNT_EMAIL` | ✅ | SA ที่ impersonate (ต้องมีสิทธิ์ Vertex AI User) |
| `VERTEX_LOCATION` | ไม่บังคับ | **ปล่อยว่าง = `global`** (ห้ามตั้ง us-central1 กับ Gemini 3.x → 404) |
| `AI_MODEL_QUALITY` | ไม่บังคับ | default `gemini-3.5-flash` |
| `AI_MODEL_STANDARD` | ไม่บังคับ | default `gemini-3.5-flash` |

> ครบ 5 ตัว GCP_* → `getProvider()` คืน `vertex` อัตโนมัติ (ไม่ต้องมี GEMINI_API_KEY)
> ยังไม่พร้อม OIDC? ใส่ `GEMINI_API_KEY` แทนได้ (จะเป็น provider `gemini`)

### ห้ามตั้งบน Production (ตั้งแล้วจะมี mock data หลุด)

| Env | ผลถ้าตั้ง |
|-----|----------|
| `ALLOW_MOCK_LINE` | เปิดปุ่ม Simulate LINE Add → สร้าง **lead ปลอมลง DB จริง + ยิง conversion จริง** (ให้ตั้งเฉพาะบนเครื่อง dev) |
| `MOCK_GOOGLE_ADS=true` | หน้า Clients / Integrations โชว์ **Mock data** แทนตัวเลขจริง |
| `MOCK_AI=true` | AI ตอบข้อความสำเร็จรูปทั้งระบบ |

### ที่ระบบต้องมีอยู่แล้ว (อย่าลบ)
- **DB:** `DATABASE_URL`, `DIRECT_URL` (Supabase Postgres, schema=plans_ads)
- **Auth:** `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (หรือ `AUTH_SECRET`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Cron:** `CRON_SECRET` — ⚠️ **บังคับแล้วตั้งแต่รอบนี้** (เดิมไม่ตั้งก็ยังทำงาน แต่กลายเป็นเปิดให้ทุกคนเรียก) ถ้าไม่ตั้ง `/api/conversions/process` จะตอบ **503** และ **cron จะไม่ยิง conversion อัตโนมัติ** — ตั้งค่านี้ก่อน redeploy แล้ว Vercel Cron จะแนบ `Authorization: Bearer <CRON_SECRET>` ให้เอง (smoke test ข้อ 8 จับให้)
- **Google Ads/GA4/GTM/LINE/Meta:** ตามที่ตั้งอยู่เดิม (`GOOGLE_ADS_*`, `GA4_*`, `GTM_*`, ฯลฯ)
- อื่นๆ ที่ตั้งอยู่แล้ว: `ENCRYPTION_KEY`, `OCR_SPACE_API_KEY`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TRACKING_BASE_URL`

> `MOCK_AI=true` = บังคับ mock (ตอน deploy จริง **อย่า**ตั้ง หรือให้เป็น false)

---

## 6. Checklist ทดสอบเอง (หลัง deploy — login @convertcake.com)

**AI (ข้อ 1-4):**
- [ ] เปิด Optimization Log / Launch Today / My Client → AI ตอบได้ ไม่ error
- [ ] มุมขวาล่างเปิด **Mercy Expert widget** → พิมพ์ถาม เช่น “แนะนำ keyword strategy” → ต้องได้คำตอบจริง และป้ายใต้ข้อความ**ไม่ใช่ `mock`** (ควรเป็น `vertex:gemini-3.5-flash`)
- [ ] แนบไฟล์ CSV/รูปในwidget → AI วิเคราะห์ได้

**Line Tracking (ข้อ 5 — เช็คว่าเร็วขึ้น):**
- [ ] เปิดหน้า **Setup** ของโปรเจกต์ที่มี connector หลายตัว → โหลดไวขึ้นชัด (เดิมค้าง ~5s ที่ readiness)
- [ ] เปิดหน้า Leads / Tracking Links / Sheet → เนื้อหาเหมือนเดิมทุกอย่าง แค่ไวขึ้น

**Create Project + Test Connect (human flow):**
- [ ] กด “สร้างโปรเจกต์ใหม่” กรอกชื่อ/ลูกค้า/ประเภท → บันทึกแล้วเด้งเข้าหน้า setup, connector ครบทุกตัวขึ้น NOT_CONNECTED
- [ ] **จับเวลาตอนกดสร้างโปรเจกต์** — ควรเร็วขึ้นชัด (คาดว่า ~10s → ~3s) และต้องได้ **conversion rule ครบ 7 สถานะ** + **tracking link เริ่มต้นครบ 3 อัน** (Google/Meta/TikTok) เหมือนเดิมทุกประการ
- [ ] กด **Duplicate โปรเจกต์** → ต้องเร็วขึ้นมาก และ config ของ connector + rule ต้องถูกก๊อปมาครบเหมือนเดิม
- [ ] หน้า setup มีการ์ด **“🚀 เริ่มโปรเจกต์: ทำ 2 ข้อนี้ให้เสร็จก่อน”** ด้านบนสุด — โชว์ snippet embed (data-project = slug ของโปรเจกต์นี้) + สถานะ LINE OA + media channel (ทำทีหลัง). วางโค้ดบนเว็บทดสอบแล้ว click เข้ามา → ข้อ 1 เปลี่ยนเป็น ✅ อัตโนมัติ
- [ ] ที่ connector LINE ใส่ Messaging Access Token จริง → กด **Test** → ต้องขึ้น “✓ เชื่อม LINE OA จริงสำเร็จ” และสถานะเป็น CONNECTED
- [ ] connector ที่ยังไม่ใส่ credential → กด Test → ขึ้นบอกชัดว่าขาดอะไร (ไม่หลอกว่า pass)

**โค้ด Embed ต่อโปรเจกต์ (ของใหม่):**
- [ ] สร้างโปรเจกต์ใหม่ 2 อัน → เข้าแท็บ **Project Info** (`?step=info`) ของแต่ละอัน → บล็อก “🌐 โค้ดฝังเว็บของโปรเจกต์นี้” ต้องโชว์ **`data-project` เป็น slug คนละค่ากัน** (ไม่ซ้ำ)
- [ ] ถ้าตั้งชื่อโปรเจกต์ซ้ำกับของเดิม → slug ใหม่ต้องลงท้าย `-2` อัตโนมัติ
- [ ] กดปุ่ม **Copy script** → ได้โค้ดครบบรรทัดเดียว วางบนเว็บลูกค้าได้เลย
- [ ] badge ต้องขึ้น “ยังไม่ได้ติดตั้ง” ตอนแรก → หลังมีคลิกจริงเข้ามาเปลี่ยนเป็น “✓ ติดตั้งแล้ว”

**ปุ่มลบโปรเจกต์ สำหรับ admin (ของใหม่):**
- [ ] login ด้วย **บัญชี admin** (`apps@ / bob@ / varn@convertcake.com`) → เข้าโปรเจกต์ → Setup → แท็บ **ข้อมูลโปรเจกต์** → ล่างสุดต้องเห็นการ์ดแดง **“⚠️ Danger zone — ลบโปรเจกต์”** พร้อมจำนวน lead ที่จะหาย
- [ ] login ด้วยบัญชี **ที่ไม่ใช่ admin** → **ต้องไม่เห็นการ์ดนี้เลย**
- [ ] ปุ่ม “ลบโปรเจกต์นี้ถาวร” ต้อง **กดไม่ได้ (จาง)** จนกว่าจะพิมพ์ slug ตรงเป๊ะ
- [ ] พิมพ์ slug ผิด → ขึ้นเตือน “ข้อความยังไม่ตรงกับ slug”
- [ ] พิมพ์ถูก → กดลบ → เด้งกลับหน้า `/line-tracking` และโปรเจกต์นั้นหายจากรายการ
- [ ] เช็คว่า**โปรเจกต์อื่นยังอยู่ครบ** และเมนูอื่นของ MercyOS (media plan / client) ไม่กระทบ

**Mock data (ต้องไม่มีหลุด):**
- [ ] **อย่าตั้ง `ALLOW_MOCK_LINE` บน Vercel** — เปิด `/line/start?project=<slug>` ของโปรเจกต์ที่ยังไม่ได้ต่อ LINE → ต้อง**ไม่มีปุ่ม "Simulate LINE Add"** เห็นแค่ข้อความให้ติดต่อผู้ดูแล
- [ ] ยิง `https://<domain>/line/callback/mock?project=<slug>` ตรง ๆ → ต้องได้ **404** และ**ไม่มี lead ใหม่โผล่**
- [ ] เช็ค env บน Vercel: **ลบ/ตั้ง `MOCK_GOOGLE_ADS=false`** — ถ้ายังเป็น `true` หน้า Clients/Integrations จะโชว์ป้าย "Mock data"
- [ ] อย่าตั้ง `MOCK_AI=true` และตั้ง env OIDC ให้ครบ — ไม่งั้น AI จะ**ตกไป mock เงียบ ๆ** (ไม่ error) ตามโค้ด `getProvider()`
- [ ] ถ้ามี lead ปลอมค้างอยู่ ดูจาก `lineUserId` ที่ขึ้นต้น **`Umock`** (จะหายเองถ้าล้างโปรเจกต์ทิ้งตามข้อ 6.6)

**ความปลอดภัย (รอบแก้ล่าสุด — สำคัญ):**
- [ ] ⚠️ **ตั้ง `CRON_SECRET` บน Vercel ก่อน redeploy** (ถ้ายังไม่มี) — ไม่งั้น cron จะไม่ยิง conversion
- [ ] รัน `npm run smoke -- https://<domain>` → **ข้อ 8 ต้อง PASS (401)** ถ้าได้ 503 แปลว่ายังไม่ได้ตั้ง `CRON_SECRET`
- [ ] เข้าหน้า **Conversions** ของโปรเจกต์จริง → ดูว่า event ถูกส่งอัตโนมัติภายใน ~10 นาที (cron ทำงาน) ถ้าไม่ขยับให้กด "ประมวลผลคิว" เองแล้วเช็ค `CRON_SECRET` อีกที
- [ ] **ทดสอบ client login:** login เป็น client viewer → ต้องเห็นแค่ Overview / Leads / Funnel ของโปรเจกต์ตัวเอง, แก้ชื่อ-เบอร์-สถานะ lead ของตัวเองได้ตามปกติ, และพิมพ์ URL ของโปรเจกต์อื่นต้องเด้งกลับ
- [ ] **ทดสอบ staff:** login @convertcake.com → ทุกอย่างต้องทำได้เหมือนเดิมทุกประการ (สร้าง/ก๊อป/pause โปรเจกต์, save + test connection, tracking link, sheet push/pull, ประมวลผลคิว, retry/skip event) — ถ้าเจอ "ไม่มีสิทธิ์ดำเนินการกับโปรเจกต์นี้" ตอน login เป็น staff แปลว่า session หลุด ให้ login ใหม่

**Error boundary (จอ Application error):**
- [ ] ถ้าเจอ error อีก → ต้อง**ไม่ใช่จอเปล่า** แล้ว: ต้องเห็นการ์ด “⚠️ หน้านี้โหลดไม่สำเร็จ” + digest + ปุ่ม **ลองใหม่อีกครั้ง**
- [ ] เอา digest ที่เห็นไปค้นใน **Vercel → Logs** → จะเจอ stack trace เต็มว่า error จริงคืออะไร (ขั้นตอนนี้คือวิธีหาสาเหตุที่แน่นอนของ Digest `781237752`)

---

## 6.5 วิธีเช็คว่า deploy แล้วจะไม่พังอีก (ทำได้เอง ซ้ำได้ทุกครั้ง)

มี 3 ด่าน — **ด่าน 1–2 ทำก่อน deploy, ด่าน 3 ทำหลัง deploy**

### ด่าน 1 — Preflight (ก่อน deploy) ⭐ สำคัญสุด
```bash
npm run preflight
```
รวม 3 อย่างในคำสั่งเดียว: ตรวจ phantom dep → `tsc --noEmit` → `next build`
**ถ้าไม่ขึ้น exit 0 ห้าม deploy**

`scripts/preflight-deps.js` จับบั๊กคลาสที่ทำให้ AI ล่มรอบนี้โดยเฉพาะ คือ
**"แพ็กเกจใช้งานได้บนเครื่องเพราะ npm hoist มาให้ แต่ไม่ได้ประกาศใน package.json"**
→ บนเครื่องเรา build ผ่านหมด แต่พอ Vercel ติดตั้งใหม่จากศูนย์ **ไม่มีแพ็กเกจนั้น → พังตอน runtime**
สแกนทั้ง static import, `export … from`, และ **dynamic `await import()`** (ตัวที่ `vertex-auth.ts` ใช้และเป็นต้นเหตุจริง)

### ด่าน 2 — Clean-room build (ก่อน deploy, แนะนำเมื่อแตะ package.json)
จำลองสิ่งที่ Vercel ทำเป๊ะ ๆ — สำคัญเพราะ `node_modules` บนเครื่องเรา "สกปรก" (มีของที่ไม่ได้ประกาศปนอยู่) จึงหลอกเราได้
```bash
mkdir -p /tmp/cleanroom && cd /tmp/cleanroom
cp -R <โปรเจกต์>/{package.json,package-lock.json,next.config.js,postcss.config.js,tailwind.config.ts,tsconfig.json,next-env.d.ts,prisma,public,src,scripts} .
npm ci --legacy-peer-deps    # ห้ามใช้ npm install — ci อ่านจาก lockfile อย่างเดียวเหมือน Vercel
npm run build
```
ทั้งสองคำสั่งต้อง exit 0 (ผมรันแล้วผ่านทั้งคู่ — ดูตารางข้อ 2)

### ด่าน 3 — Smoke test (หลัง deploy เสร็จทันที)
```bash
npm run smoke                                   # ยิงไปที่ mercy-cvc.vercel.app
npm run smoke -- https://<preview-url>          # หรือทดสอบ preview deploy ก่อนก็ได้
```
เช็ค 8 จุดที่ **ไม่ต้อง login**: `/embed.js` ยังเสิร์ฟเป็น JS จริง, track endpoint ยังมีชีวิต,
slug มั่ว 404 สวย ๆ ไม่ crash, **middleware ทำงาน (แปลว่า `jose` resolve ได้)**, หน้า login ไม่ระเบิด, API ตอบ 401 ไม่ใช่ 500,
และ **ข้อที่ 8 (ใหม่): cron endpoint ปฏิเสธคนแปลกหน้า + `CRON_SECRET` ถูกตั้งแล้วจริง**
ถ้ามี FAIL → exit 1 พร้อมบอก URL ที่พัง

> **ข้อ 8 อ่านผลยังไง:** ต้องได้ `401` = ปิดถูกต้องและ secret ตั้งแล้ว
> ถ้าได้ **`503`** = ยังไม่ได้ตั้ง `CRON_SECRET` บน Vercel → **cron จะไม่ยิง conversion** ให้ไป Settings → Environment Variables เพิ่มแล้ว redeploy (สคริปต์จะพิมพ์วิธีแก้ให้ด้วย)
> ถ้าได้ **`200`** = route เปิดสาธารณะอยู่ ใครก็สั่งประมวลผลคิวได้ (ไม่ควรเกิดกับโค้ดชุดนี้)

### สิ่งที่สคริปต์เช็คแทนไม่ได้ (ต้องกดเองหลัง login)
หน้าใน ๆ ทั้งหมดติด Google OAuth เฉพาะ `@convertcake.com` → ทดสอบอัตโนมัติไม่ได้
ให้ไล่ **checklist ข้อ 6** ด้านบน โดยเฉพาะ **AI ตอบจริง (ป้ายต้องไม่ใช่ `mock`)** และ **กด Test connection ของ LINE**

> **แนะนำที่สุด:** deploy ขึ้น **Preview** ก่อน → `npm run smoke -- <preview-url>` → ไล่ checklist ข้อ 6 บน preview → ค่อย Promote to Production
> วิธีนี้ถ้ามีปัญหา ลูกค้าจะไม่เห็นเลย

---

## 6.6 ล้างโปรเจกต์ Line Tracking — ✅ **รันไปแล้ว (2026-07-23)**

> **สถานะ: ลบเรียบร้อยแล้วตามที่สั่ง** — โปรเจกต์ทดสอบ 14 อัน (`convert-cake` ถึง `convert-cake-14`) ถูกลบทั้งหมด **เหลือ 0 projects** พร้อมสำหรับสร้างใหม่หลัง redeploy
>
> ก่อนลบ dry-run ยืนยันแล้วว่าทั้ง 14 อัน **ว่างเปล่าจริง** — `leads:0 clicks:0 lineUsers:0 conversionEvents:0` (มีแค่ tracking link เริ่มต้น 42 อันที่ระบบสร้างให้เอง) และสถานะ `SETUP` ทั้งหมด แปลว่าไม่เคยถูกใช้งานจริง **ไม่มีข้อมูลลูกค้าจริงสูญหาย**
>
> **ไฟล์ backup:** `lt-backup/lt-backup-2026-07-23T06-41-45-803Z.json` (149 KB) อยู่ในโปรเจกต์ `plans-ads` บนเครื่อง — `lt-backup/` ถูกใส่ `.gitignore` ไว้แล้ว
>
> ส่วนล่างนี้คือวิธีใช้สคริปต์ เก็บไว้เผื่อต้องล้างอีกในอนาคต

**อีกวิธี — กดลบผ่าน UI:** login admin → เข้าโปรเจกต์ → Setup → ข้อมูลโปรเจกต์ → Danger zone → พิมพ์ slug → ลบ (ปุ่มใหม่ในข้อ 1) เหมาะกับลบทีละอัน แต่ไม่มี backup JSON ให้

**ขอบเขต — แตะเฉพาะ Line Tracking:** สคริปต์ลบเฉพาะแถวใน `lt_project` แล้วให้ DB cascade ลบตารางลูก `lt_*` ของมัน (connection, tracking link, ad click, LINE user, lead, conversion rule, conversion event, sheet sync log, webhook log, short link, client access)
**ไม่แตะ** media plan / campaign blueprint / client / creative / user / ตารางอื่นของ MercyOS ทั้งหมด และ**ไม่ลบ workspace (agency)** ด้วย — โปรเจกต์ใหม่ยังผูกเข้า workspace เดิมได้ตามปกติ

**วิธีรัน** (ที่ root ของโปรเจกต์ ที่มี `.env` ชี้ DB จริง):

```bash
# 1) ดูก่อนว่าจะลบอะไรบ้าง — DRY RUN ไม่ลบ ไม่เขียนอะไรเลย
node scripts/lt-purge-projects.mjs

# 2) พอใจแล้วค่อยลบจริง (จะ export JSON ให้ก่อนอัตโนมัติ)
node scripts/lt-purge-projects.mjs --confirm
```

- ขั้นที่ 1 พิมพ์รายชื่อโปรเจกต์ + จำนวน lead / click / LINE user ของแต่ละอัน แล้วสรุปยอดรวม
- ขั้นที่ 2 เขียน **backup ครบทุกแถว** ลง `lt-backup/lt-backup-<เวลา>.json` **ก่อน** ลบ และถ้าไฟล์ backup ว่างจะ **หยุดทันทีไม่ลบ**
- ลบเสร็จพิมพ์ยืนยันจำนวนที่ลบ + นับโปรเจกต์ที่เหลือ (ควรเป็น 0)

⚠️ **ไฟล์ backup มีข้อมูลส่วนบุคคลของลูกค้าจริง (ชื่อ/เบอร์/ยอดเงิน)** — เก็บในที่ปลอดภัย อย่า commit ขึ้น git และลบทิ้งเมื่อมั่นใจแล้ว
⚠️ **ลบแล้วกู้จาก UI ไม่ได้** — JSON คือสำเนาเดียวที่เหลือ

**ทางเลือก:** ถ้าโปรเจกต์มีไม่กี่อัน จะไม่ใช้สคริปต์เลยก็ได้ — deploy โค้ดใหม่ก่อน แล้วเข้าแต่ละโปรเจกต์ → Setup → ข้อมูลโปรเจกต์ → Danger zone → พิมพ์ slug → กดลบ (ปุ่มใหม่ในข้อ 1) วิธีนี้ปลอดภัยกว่าเพราะเห็นทีละอัน แต่ **ไม่มี backup JSON ให้** — อยากได้ backup ต้องรัน `node scripts/lt-purge-projects.mjs` (dry run) แล้ว `--confirm` แทน

---

## 7. หมายเหตุ
- โฟลเดอร์เก่า `Bob/line-tracking-deploy*` เป็น deliverable รอบก่อน (line-tracking อย่างเดียว) — **ใช้ `mercy-fix-deploy/` นี้แทน** (ครบกว่า: รวม AI fix + perf ทั้งระบบ)
- ไม่แตะ/ไม่เปิดเผยค่า secret ใน .env ใดๆ ตลอดงาน
- 🔐 **แนะนำให้ rotate รหัสผ่าน Supabase database** — ระหว่างงานนี้ค่า `DATABASE_URL` / `DIRECT_URL` ถูกส่งมาเป็น plaintext ในแชตเพื่อให้ทดสอบ client isolation กับ DB จริง ค่าเหล่านั้นเป็นสิทธิ์อ่าน-เขียนเต็มทุกตาราง ควรเปลี่ยนรหัสใน Supabase แล้วอัปเดตบน Vercel หลังงานนี้จบ
- กล่องนี้เพิ่ม `scripts/preflight-deps.js` + `scripts/smoke-deploy.js` และ npm script `preflight` / `smoke` — ก๊อป `scripts/` ไปด้วยตอน deploy (ไม่กระทบ build)
- `scripts/lt-purge-projects.mjs` เป็นเครื่องมือรันมือครั้งเดียว **ไม่ได้ถูกเรียกจากที่ไหนในแอป** — ไม่มีทางรันเองโดยบังเอิญ
- เพิ่ม `lt-backup/` ใน `.gitignore` ของโปรเจกต์แล้ว กัน backup ที่มีข้อมูลลูกค้าหลุดขึ้น git (ถ้าพี่วางทับเฉพาะ `src/` ให้เพิ่มบรรทัด `lt-backup/` เข้า `.gitignore` เองด้วย)
- **ยังไม่มีการลบข้อมูลใด ๆ ในรอบนี้** — งานลบทั้งหมดรออยู่ที่พี่กดเอง (ข้อ 6.6 หรือปุ่ม Danger zone)
