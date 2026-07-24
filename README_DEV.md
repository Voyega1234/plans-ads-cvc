# ส่งงาน dev — LINE Tracking: Webhook timeout + ปุ่ม Test + แก้หน้าช้า + Client login เห็นเมนู staff

## ⚡ อ่านแค่นี้ก็ทำได้ (3 ขั้น)

**ขั้นที่ 1 — วางไฟล์ทับ**
ก๊อป `src/` กับ `vercel.json` ในโฟลเดอร์นี้ ทับลงใน repo (ทับได้เลย ตรงโครงสร้างอยู่แล้ว) แล้ว:
```bash
npm install --legacy-peer-deps
npm run build
```
ไม่ต้อง migrate DB · ไม่ต้องเพิ่ม env ใหม่

**ขั้นที่ 2 — แก้ env 1 ตัวบน Vercel (สำคัญที่สุด)**
ใน `DATABASE_URL` แก้ 2 จุด ที่เหลือคงเดิมทุกตัวอักษร:
- `connection_limit=1` → `connection_limit=5`
- เติม `&pool_timeout=20` ต่อท้าย

> นี่คือสาเหตุหลักที่หน้า LINE Tracking ช้ามาก — ค่า `1` บังคับให้ query ทุกอันต่อคิววิ่งทีละอัน

**ขั้นที่ 3 — เทส**
1. LINE Developers → Verify → ต้อง Success (ผ่านอยู่แล้วก่อน deploy — Verify ส่ง payload ว่าง ไม่ได้พิสูจน์อะไร ดูส่วนที่ 6)
2. **แอดเพื่อน LINE OA จริง 1 ครั้ง → ต้องมี Lead เข้าระบบ** ← ข้อนี้คือข้อที่พังอยู่ และเป็นข้อชี้ขาดว่า deploy สำเร็จ
3. หน้า Setup ข้อ 1 → กด 🔍 Test → ต้องขึ้นผลลัพธ์
4. หน้า Overview → **ตัวเลขทุกช่องต้องตรงกับก่อน deploy** และโหลดเร็วขึ้นชัดเจน
5. เบราว์เซอร์ที่ login เป็น staff อยู่ → login เป็น client viewer ทับ → ต้องเห็นแค่ ClientShell (หัวข้อโปรเจกต์ + ปุ่มออกจากระบบ) **ห้ามเห็นเมนู MercyOS ซ้ายมือ**

---

รวมงานที่ยังไม่ได้ deploy ไว้ในชุดเดียว — ทั้งหมด **14 ไฟล์** (8 หัวข้อ ดูด้านล่าง)

> รอบแก้ keyword/AI (ย้ายไป Vertex OIDC) **deploy ไปแล้ว** ไม่รวมอยู่ในชุดนี้

---

# ส่วนที่ 1 — Environment Variable (ต้องแก้เอง โค้ดแก้ให้ไม่ได้)

## A) `connection_limit=1` → นี่คือสาเหตุหลักที่หน้า LINE Tracking ช้ามาก

`DATABASE_URL` ปัจจุบันลงท้ายด้วย `connection_limit=1`

ค่านี้บังคับให้ Prisma ใช้ connection เดียว → **ทุก query ต่อคิววิ่งทีละอัน**
`Promise.all` ที่ตั้งใจให้ยิงขนานเลยไม่มีผลเลย หน้า Overview ที่ยิง 29 query กลายเป็น 29 รอบเรียงกัน

**แก้เป็น:**

```
postgresql://postgres.<ref>:<PASSWORD_เดิม>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5&pool_timeout=20&schema=plans_ads
```

เปลี่ยนแค่ 2 จุด — ที่เหลือคงเดิมทุกตัวอักษร:
- `connection_limit=1` → `connection_limit=5`
- เพิ่ม `&pool_timeout=20`

> เลข `1` ไม่ได้ตั้งมั่ว — เป็นค่าที่คู่มือ Prisma แนะนำสำหรับ serverless เพื่อกัน connection ล้น
> แต่โปรเจกต์นี้มีโปรเจกต์เดียว ทราฟฟิกน้อย และใช้ pgbouncer transaction mode อยู่แล้ว ใช้ 5 ปลอดภัย
> ถ้าเจอ error `too many connections` ค่อยลดเป็น 3

`DIRECT_URL` (พอร์ต 5432) **ไม่ต้องแก้** — ใช้ตอน migrate เท่านั้น ถูกอยู่แล้ว

---

# ส่วนที่ 2 — LINE Webhook timeout (ยังไม่เคย deploy)

### อาการ
กด **Verify** ใน LINE Developers → `A timeout occurred when sending a webhook event object`

### Root cause
LINE ตัดการเชื่อมต่อถ้าไม่ตอบภายใน **~1 วินาที** แต่โค้ดเดิมทำงานหนักทั้งหมดก่อน return 200:

| ลำดับเดิม | งาน |
|---|---|
| 1 | `project.findUnique` |
| 2 | `getConnectionConfig` (ทำต่อกัน ไม่ขนาน) |
| 3 | loop events → `fetchLineProfile`, `upsertLineUser`, `upsertLeadFromClick`, OCR สลิป |
| 4 | `processQueue()` → ยิง Google/Meta/TikTok/GA4 |
| 5 | `webhookLog.create` |
| 6 | ค่อย return 200 ← **สายเกินไป** |

> ไม่ได้กระทบแค่ปุ่ม Verify — **ตอนลูกค้าทักจริงก็หลุด** เพราะ LINE ถือว่า timeout แล้วทิ้ง event

### สิ่งที่แก้
ทำตามที่ LINE แนะนำ: **ตอบ 200 ทันที แล้วประมวลผลเบื้องหลัง**

- ใช้ `waitUntil()` จาก `@vercel/functions` (มีใน package.json อยู่แล้ว) ยืดอายุ function ให้งานเบื้องหลังทำจนจบหลังส่ง response
- ย้ายทุกอย่างหลังเช็ค signature ไปอยู่ใน `handleEvents()` ที่รันผ่าน `waitUntil`
- 2 query แรกเปลี่ยนเป็นขนาน (`Promise.all`)
- path ที่ reject ก็ไม่รอเขียน log แล้ว
- `vercel.json`: `maxDuration: 60` ให้ route นี้

**ยังเหมือนเดิม:** signature verification ยังตรวจก่อนเสมอ (ไม่ได้ลดความปลอดภัย), `processQueue` ยังถูกเรียกทุกครั้ง และมี cron ทุก 10 นาทีเป็น safety net

**ผลลัพธ์:** ตอบ LINE ใน ~100–200ms

---

# ส่วนที่ 3 — ปุ่ม Test ข้อ 1 (โค้ด Tracking)

### ปัญหาเดิม
ข้อ 1 ในหน้า Setup ขึ้นเขียวเฉพาะเมื่อ **มีทราฟฟิกจริงเข้ามาแล้ว** (`AdClick > 0`)
วางโค้ดเสร็จแล้วกดอะไรไม่ได้ ไม่รู้ว่าวางถูกไหม

### สิ่งที่เพิ่ม
ปุ่ม **🔍 Test** (ใช้งานเหมือนปุ่ม Test Connection ของ LINE) — server จะ fetch เว็บลูกค้าจริง แล้วอ่าน HTML หา `embed.js` + `data-project` ของโปรเจกต์นี้

| ผล | ความหมาย |
|---|---|
| ✅ `ok` | เจอโค้ด + slug ตรง |
| ⚠️ `wrongslug` | เจอโค้ด แต่ `data-project` ไม่ตรงโปรเจกต์นี้ |
| ❌ `missing` | เปิดเว็บได้ แต่ไม่มีโค้ด |
| ⚠️ `unreachable` | เข้าเว็บไม่ได้ |
| ⚠️ `nourl` | ยังไม่ได้ใส่ Website URL |

**ไม่ต้อง migrate DB** — ผลส่งกลับผ่าน query string `?embedTest=…`

---

# ส่วนที่ 4 — แก้หน้า LINE Tracking ช้า

### Root cause
ไม่ใช่ข้อมูลเยอะ (มีโปรเจกต์เดียว) และไม่ใช่ bundle ฝั่ง browser (97.8 kB ปกติ)
แต่เป็น **จำนวนครั้งที่วิ่งไป-กลับ DB** คูณกับ 2 ปัจจัยที่ทำให้แต่ละครั้งแพงมาก:

1. `connection_limit=1` → query ขนานกลายเป็นวิ่งทีละอัน (ส่วนที่ 1 ข้อ A)
2. Supabase อยู่ `ap-south-1` (มุมไบ) แต่ Vercel function รันที่ default `iad1` (เวอร์จิเนีย) → ~250ms ต่อรอบ

Index ตรวจแล้วครบ (`projectId`, `[projectId, status]`) ไม่ใช่ปัญหา

### สิ่งที่แก้ (โค้ด)

**1. ยุบ query ที่ถามตารางเดิมซ้ำๆ ให้เหลือครั้งเดียวด้วย `groupBy`** — `projectService.ts`

| ฟังก์ชัน | เดิม | ใหม่ |
|---|---|---|
| `getFunnel` | 9 | 3 |
| `getChannelFunnel` | 7 | 2 |
| `getProjectStats` | 6 | 2 |
| `getPeriodComparison` | 6 | 2 |
| `getAgencyDashboardStats` | 7 | 3 |
| `getLineLifecycle` | 3 | 1 |
| `getChannelBreakdown` | ดึง lead **ทุกแถว** มานับใน JS | ให้ Postgres นับให้ |

**2. รวม DB เป็นรอบเดียว** — ทุกหน้าเคย `await project.findUnique` ก่อน แล้วค่อยเริ่ม `Promise.all`
ทั้งที่ทุก query ใช้แค่ `projectId` จาก URL อยู่แล้ว (`project.id` คือค่าเดียวกันเป๊ะ) → รวมเข้า `Promise.all` เดียว

**3. `vercel.json`: `"regions": ["bom1"]`** — ย้าย function ไปรันมุมไบข้าง DB

> มีผลกับทั้งแอป ไม่ใช่แค่ line-tracking แต่เป็นผลบวกล้วน:
> หน้า static ยังเสิร์ฟจาก CDN edge เหมือนเดิม ส่วนหน้าที่ต่อ DB เร็วขึ้นหมด
> ถ้าไม่ต้องการ ลบบรรทัดเดียวก็กลับเหมือนเดิม

### ผลรวม

| หน้า | queries | รอบที่ต้องรอ |
|---|---|---|
| ตั้งค่า / เชื่อมต่อ (setup) | 5 → 5 | **2 → 1** |
| Project overview | 29 → 14 | 2 → 1 |
| Marketing Funnel | 18 → 7 | 2 → 1 |
| Conversions | 8 → 4 | 2 → 1 |
| Google Sheet | 3 → 3 | 2 → 1 |
| Dashboard รวม | 11 → 7 | 1 → 1 |

Tracking Links / Leads ตรวจแล้วเขียนดีอยู่แล้ว ไม่ได้แก้

**ตัวเลขบนหน้าจอเหมือนเดิมทุกช่อง** — logic การนับสะสมของ funnel (คนที่ WON ต้องถูกนับใน contacted/qualified/quoted ด้วย) คงไว้ครบ มี comment กำกับในโค้ด

### จุดที่ตั้งใจ "ไม่แก้"
`getProjectReadiness` ยังดึง lead ย้อนหลัง 90 วันมานับ click id ใน JS
เปลี่ยนเป็น `_count` ฝั่ง DB ได้ แต่ความหมายจะเพี้ยน (ของเดิมไม่นับค่าว่าง `""` ของใหม่จะนับ) และมันอยู่ในรอบเดียวกันอยู่แล้ว = ไม่ช่วยเรื่องความเร็ว จึงไม่เสี่ยง

---

# ส่วนที่ 5 — Client login เห็นเมนู staff ทั้งหมด

### อาการ
สร้าง client viewer จากหน้า Setup → login ด้วย user นั้น → **เห็น AppShell ของ MercyOS เต็มๆ** (My Clients, Media Plans, Automation, Push Log, ปุ่ม Pause/Setup ของโปรเจกต์) แทนที่จะเห็นแค่ ClientShell แบบ read-only

### Root cause
`/api/line-tracking/client-login` ตั้งใจล้าง session ของ staff ทิ้งตอน login เป็น client แต่เรียกแค่:

```ts
cookieStore.delete(name)   // ← ไม่มี Secure
```

การ "ลบ" คุกกี้ ที่จริงคือการส่ง `Set-Cookie` ที่หมดอายุ และเบราว์เซอร์ใช้กฎเดียวกับการ set ปกติ — คุกกี้ที่ขึ้นต้นด้วย **`__Secure-`** จะถูกยอมรับก็ต่อเมื่อมี attribute `Secure` ติดมาด้วย

บน production next-auth ใช้ชื่อ `__Secure-authjs.session-token` → `Set-Cookie` ที่ไม่มี `Secure` **ถูกเบราว์เซอร์ปฏิเสธเงียบๆ** → คุกกี้ staff ไม่ถูกลบ → `auth()` ยังคืน session → `line-tracking/layout.tsx` เข้าทาง `<AppShell>`

ยืนยันได้จากบรรทัดเหนือขึ้นไปในไฟล์เดียวกัน: การ `set` คุกกี้ `lt_client` ใส่ `secure: true` ไว้ จึงทำงานปกติ (client เข้าหน้าโปรเจกต์ได้) — มีแต่ `delete` เท่านั้นที่ถูกปฏิเสธ

### สิ่งที่แก้
เปลี่ยนจาก `delete()` เป็นการเขียนคุกกี้หมดอายุที่ระบุ attribute ครบ:

```ts
const STAFF_SESSION_COOKIE = /^(__Secure-)?(authjs|next-auth)\.session-token(\.\d+)?$/
for (const { name } of cookieStore.getAll()) {
  if (!STAFF_SESSION_COOKIE.test(name)) continue
  cookieStore.set(name, '', {
    path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax',
    secure: name.startsWith('__Secure-'),
  })
}
```

- `secure` ใส่เฉพาะชื่อที่ขึ้นต้น `__Secure-` → ชื่อแบบ plain (ที่ใช้ตอน dev บน HTTP) ยังลบได้ตามปกติ
- ไล่จากคุกกี้ที่มีอยู่จริงแทน list ตายตัว → ครอบคลุมกรณี next-auth หั่นคุกกี้ยาวเป็น `…session-token.0`, `.1`

### ขอบเขตผลกระทบ
แตะเฉพาะ route `client-login` ของ LINE Tracking — **ไม่กระทบ login ของ staff** (Google/next-auth) เลย โค้ดนี้ทำงานเฉพาะตอนมีคน login เป็น client viewer สำเร็จเท่านั้น

### หมายเหตุความรุนแรง
เคสนี้เกิดเฉพาะเมื่อ login เป็น client **ในเบราว์เซอร์ที่มี session staff ค้างอยู่** (คือเคสที่เราเทสกันเอง) เบราว์เซอร์ของลูกค้าจริงไม่เคยมี session staff จึงไม่เคยเห็นเมนูนี้ — แต่ยังควรแก้ เพราะเป็นด่านกันชั้นเดียวที่ fail เงียบ

---

# ส่วนที่ 6 — Webhook URL ในหน้า Setup ไม่มีโดเมน (LINE เรียกไม่ถึง)

### อาการ
แอดเพื่อน LINE OA แล้ว **ไม่มี event เข้าระบบเลย** ไม่มี Lead ไม่มี LINE user

### Root cause
`ConnectionCard.tsx` อ่าน env ตรงๆ:
```ts
const baseUrl = process.env.TRACKING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
```
บน production ไม่ได้ตั้งทั้งสองตัว → `baseUrl = ""` → ช่อง "Webhook URL (ก็อปไปวางใน LINE)" โชว์แค่

```
/api/webhooks/line/cmrxakkek00018w2mlhycpv0h
```

**ไม่มีโดเมน** — เอาไปวางใน LINE Developers ก็เรียกไม่ถึงเซิร์ฟเวอร์ ไม่มี event ไหนมาถึงเลย

น่าสังเกตว่าลิงก์ tracking ในหน้าอื่นแสดงถูก เพราะใช้ helper คนละตัว (`getTrackingBaseUrl()` ซึ่ง fallback ไป `VERCEL_PROJECT_PRODUCTION_URL` ให้อัตโนมัติ) — มีแต่การ์ดนี้ที่ไม่ได้ใช้

### สิ่งที่แก้
ให้การ์ดใช้ `getTrackingBaseUrl()` ตัวเดียวกับที่ระบบใช้อยู่แล้ว → ได้โดเมนถูกต้องทันทีโดยไม่ต้องตั้ง env และถ้าตั้ง `TRACKING_BASE_URL` (เช่นใช้โดเมนตัวเอง) ก็ยัง override ได้เหมือนเดิม

คำเตือนใต้ช่องเปลี่ยนจาก "ยังไม่ได้ตั้ง TRACKING_BASE_URL" → เตือนเฉพาะตอนที่ URL เป็น `localhost` (ซึ่ง LINE เรียกไม่ถึงจริงๆ)

### เพิ่มเติม — กัน password manager ทับ secret
ช่อง secret ในการ์ดตั้งใจให้ว่างเสมอ (ระบบไม่ส่ง secret กลับมาที่เบราว์เซอร์) และ "ว่าง = ไม่เปลี่ยน" — `saveConnectionConfig` ข้ามค่าว่างอยู่แล้ว

แต่หน้านี้มี input `type="password"` หลายช่องและไม่เคยมี `autoComplete` → password manager ยิงค่าที่จำไว้ใส่ได้ ค่าที่ถูกยิงใส่**ไม่ว่าง** จึงรอดด่านนั้นแล้วทับ Channel Secret ตัวจริงตอนกด Save (แล้ว LINE จะ verify signature ไม่ผ่าน = event ถูกปฏิเสธเงียบๆ)

ใส่ `autoComplete="new-password"` + `data-1p-ignore` / `data-lpignore` / `data-bwignore` ปิดช่องนี้

> นี่เป็นการอุดความเสี่ยง ไม่ได้ยืนยันว่าเคยเกิดขึ้นจริงกับโปรเจกต์นี้

### Webhook URL ที่ใช้จริง (ตั้งใน LINE Developers แล้ว — Verify ผ่านแล้ว)

```
https://mercy-cvc.vercel.app/api/webhooks/line/cmrxakkek00018w2mlhycpv0h
```

### ⚠️ Verify ผ่าน ≠ event จริงเข้า — และนี่คือเหตุผลที่ส่วนที่ 2 ต้อง deploy

ปุ่ม **Verify** ของ LINE ส่ง payload ที่มี `events: []` (ว่างเปล่า) → handler ข้าม loop ทั้งหมด ตอบ 200 ทัน = **ผ่าน**

แต่ event จริง (แอดเพื่อน / ทักแชท) มี 1 event ใน payload → โค้ดที่ยัง deploy อยู่ตอนนี้จะทำงานทั้งชุด **ก่อน** ตอบ 200:
`fetchLineProfile` → `upsertLineUser` → `upsertLeadFromClick` → `processQueue()` (ยิง GA4/Meta/TikTok) → `webhookLog.create`

รวมแล้วเกิน ~1 วินาทีที่ LINE ยอมรอ → LINE ตัดการเชื่อมต่อและ **ทิ้ง event นั้นทิ้งไปเงียบๆ**

> อาการที่เจอจริง: Verify ขึ้น Success แต่กดแอดเพื่อนแล้วไม่มี Lead เข้าระบบ — ตรงกับที่อธิบายไว้ในส่วนที่ 2 เป๊ะ
> **ต้อง deploy ส่วนที่ 2 (`waitUntil`) ก่อน ถึงจะรับ event จริงได้**

### ยังต้องเช็คฝั่ง LINE เพิ่ม (โค้ดช่วยไม่ได้)
1. LINE Developers → Messaging API → **Use webhook** = เปิด
2. LINE Official Account Manager → การตอบกลับ → **Webhook** เปิด และปิด **ตอบกลับอัตโนมัติ** (ไม่งั้น LINE จะไม่ส่ง event ต่อ)

สองข้อนี้ถูกใส่ไว้ในคู่มือในระบบแล้ว (`connector-guide.ts` + `line-tracking/guide/page.tsx`) จะได้ไม่ต้องมาบอกกันทุกโปรเจกต์

---

## 7) embed.js ไม่ทำงานเลยเมื่อฝังผ่าน GTM — ตัวเลข "ผู้เข้าเว็บ" ค้างที่ 1

### อาการ
convertcake.com มีคนเข้าหลายคนหลายรอบ แต่ stage แรกของ funnel ค้างที่ **1** ตลอด

### Root cause (ยืนยันจาก Console ของเว็บจริงแล้ว)
เว็บไม่ได้ฝัง `<script src=".../embed.js">` ตรงๆ แต่ฝังผ่าน **GTM** (container `GTM-P7PCL3P`, Custom HTML tag, trigger = Initialization – All Pages)

GTM แทรกสคริปต์แบบ async ทำให้ `document.currentScript` เป็น `null` โค้ดเดิมจึง fallback ไปหยิบ *"`<script>` ตัวสุดท้ายในหน้า"* ซึ่งเป็นสคริปต์ของ Elementor/Chaty/Calendly ไม่ใช่ของเรา → `data-project` ได้ `null` → warn แล้ว `return` ทิ้ง

**ไม่เคยยิง `POST /api/track/convert-cake` เลยแม้แต่ครั้งเดียว** — Console ของเว็บจริงขึ้น `[LINEHub] missing data-project`

ฝั่งเซิร์ฟเวอร์ตรวจแล้วปกติทุกอย่าง: slug `convert-cake` ถูก, endpoint ตอบ 200 ใน ~0.25 วิ, CORS ผ่าน, GTM tag published จริง, WP Rocket ไม่ได้หน่วง JS

### สิ่งที่แก้
หาแท็กของตัวเองจาก `script[data-project]` ใน DOM แทนการพึ่ง `currentScript` อย่างเดียว และรับค่าจาก `window.LINEHubProject` / `window.LINEHubHost` ได้ด้วย เผื่อ tag manager ตัวอื่นไม่ส่ง `data-*` ผ่านมา · hub origin ก็ fallback ไปหาแท็กที่โหลด `/embed.js` แทน

### ทดสอบแล้ว
รันสคริปต์ที่เสิร์ฟจริงผ่าน harness จำลอง DOM 5 เคส เทียบโค้ดเก่า/ใหม่:

| เคส | เก่า | ใหม่ |
|---|---|---|
| ฝังปกติ (`currentScript` ใช้ได้) | ✅ ยิง | ✅ ยิง |
| GTM: `currentScript` = null | ❌ warn ไม่ยิง | ✅ ยิง |
| GTM: `currentScript` = สคริปต์อื่น | ❌ warn ไม่ยิง | ✅ ยิง |
| `data-*` หาย ตั้ง `window.LINEHubProject` แทน | ❌ warn ไม่ยิง | ✅ ยิง |
| ไม่มีอะไรเลย | ❌ warn | ❌ warn (ถูกต้อง) |

`node --check` ผ่าน, `tsc --noEmit` 0 error, `npm run build` ผ่าน

### แก้เรื่องปุ่ม lineutm.com ในไฟล์เดียวกันด้วย
ปุ่ม LINE บนเว็บมาจากปลั๊กอิน Chaty ชี้ไป `https://lineutm.com/scan_qr?...` ซึ่งไม่ match `isLineLink()` เดิม (`lin.ee|line.me|liff.line|line://`) และทั้งหน้าไม่มี `data-line-add` เลย → `lineClickedAt` ไม่เคยถูกเซ็ต ทำให้ stage "กดปุ่ม Add LINE" = 0 ตลอด และการ attribute lead ตกไปใช้หน้าต่าง fallback 30 นาที แทนที่จะเป็น 3 ชม.

**แก้แล้ว:** เพิ่ม `lineutm.com` เข้า `isLineLink()` → คลิกปุ่ม LINE เดิมถูกนับทันที (ทดสอบ regex แล้ว: match `lineutm.com` + `lin.ee` + `line.me`, ไม่ match `google.com`)

---

## 8) แผงดู Webhook ล่าสุดจาก LINE ในหน้า Setup (ให้ลูกค้าเช็คเองได้)

### ปัญหาเดิม
ระบบเขียน `webhookLog` ทุกครั้งที่ LINE ยิงเข้ามา (มีอยู่แล้วใน DB) แต่**ไม่มีหน้าไหนโชว์เลย** →
เวลาสงสัยว่า "LINE ต่อถึงระบบไหม" ต้องให้ dev เปิด Vercel logs หรือ query DB เองทุกครั้ง

### สิ่งที่เพิ่ม
แผง **"📡 Webhook ล่าสุดจาก LINE (10 รายการ)"** ในหน้า Setup → step **Connect LINE OA** (ใต้การ์ด LINE)

- ดึง `webhookLog` 10 แถวล่าสุดของโปรเจกต์ (รวมเข้า `Promise.all` เดิม — ไม่เพิ่มรอบ DB)
- แต่ละแถวโชว์: สถานะ (✅ รับแล้ว / 🚫 ปฏิเสธ / ⚠️ ผิดพลาด), เวลา, สรุป event (เช่น `1 event: follow`), และ error ถ้ามี
- ปุ่ม Verify (payload ว่าง) โชว์เป็น "ทดสอบการเชื่อมต่อ (Verify) — ไม่มี event จริง"
- ถ้าว่างเปล่า → ขึ้นข้อความว่า LINE ยังไม่เคยยิงมาที่ระบบ พร้อมบอกให้เช็ค Webhook URL + Use webhook

> **ไม่โชว์ raw payload** — สรุปเป็นข้อความสั้นๆ เท่านั้น กัน PII (เช่น LINE userId) หลุดออกหน้าจอ
> ไม่ต้อง migrate DB · ตาราง `lt_webhook_log` มีอยู่แล้ว

**ประโยชน์:** หลัง deploy ส่วนที่ 2 (`waitUntil`) แล้ว ลูกค้าแอดเพื่อน 1 ครั้ง → เปิดหน้านี้เห็น `follow` event เข้ามาทันที = ยืนยันว่า LINE ต่อถึงระบบจริง โดยไม่ต้องพึ่ง dev

---

# ไฟล์ในชุดนี้ (14 ไฟล์)

```
vercel.json                                                  ← maxDuration webhook + regions bom1
src/app/api/webhooks/line/[projectId]/route.ts               ← ตอบ 200 ทันที + waitUntil
src/app/api/line-tracking/client-login/route.ts              ← ลบคุกกี้ staff ให้ได้จริง
src/components/line-tracking/ConnectionCard.tsx              ← Webhook URL มีโดเมน + กัน autofill
src/lib/line-tracking/actions.ts                             ← + testEmbedAction()
src/lib/line-tracking/services/projectService.ts             ← ยุบ query ด้วย groupBy
src/app/line-tracking/projects/[projectId]/page.tsx          ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/setup/page.tsx    ← + ปุ่ม Test + แผง Webhook ล่าสุด + รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/funnel/page.tsx   ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/conversions/page.tsx ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/sheet/page.tsx    ← รวมเป็นรอบเดียว
src/lib/line-tracking/connector-guide.ts                     ← ขั้นตอนตั้ง LINE: + Use webhook + OA Manager
src/app/line-tracking/guide/page.tsx                         ← คู่มือในระบบ: + OA Manager + คำเตือนเรื่อง Verify
src/app/embed.js/route.ts                                    ← หาแท็กตัวเองให้เจอเมื่อฝังผ่าน GTM
```

ทุกไฟล์อยู่ใน **LINE Tracking + webhook เท่านั้น** ยกเว้น `vercel.json` (ระดับโปรเจกต์)
ไม่มีการแก้หน้าอื่น ไม่มี migration ไม่แตะข้อมูลใน DB

---

# Deploy

```bash
npm install --legacy-peer-deps
npm run build
```

ไม่ต้อง migrate DB · ไม่ต้องเพิ่ม env ใหม่ (นอกจากที่ระบุในส่วนที่ 1)

---

# เทสหลัง deploy

1. LINE Developers → Messaging API → **Verify** → ต้องขึ้น Success
2. ทักหา LINE OA จริง 1 ครั้ง → ต้องมี Lead เข้าระบบ
3. หน้า Setup ข้อ 1 → กด **🔍 Test** → ต้องขึ้นผลลัพธ์ (ไม่ใช่ error)
4. หน้า Project Overview → **เช็คว่าตัวเลขทุกช่องตรงกับก่อน deploy** (KPI, donut, ตารางแยกช่องทาง, funnel)
5. จับเวลาโหลดหน้า Overview / Setup → ต้องเร็วขึ้นชัดเจน

> จุดเดียวที่อาจต่างแบบไม่มีผล: ตารางแยกช่องทาง ถ้ามี 2 ช่องทางที่ lead **เท่ากันเป๊ะ** ลำดับบน-ล่างอาจสลับกัน (ของเดิมก็ไม่ได้กำหนดลำดับ tie ไว้)

---

# ยืนยันแล้วฝั่งเรา

- `npx tsc --noEmit` → 0 error
- `npm run build` → `✓ Compiled successfully` ครบทุก route
- `vercel.json` → valid JSON

**ยังไม่ได้ทดสอบกับ DB จริง** — ความถูกต้องของตัวเลขตรวจจากตรรกะ ไม่ใช่จากการรันกับ production
ตัวเลข "เร็วขึ้นเท่าไหร่" เป็นการประมาณจากระยะทางเครือข่าย ยังไม่ได้วัดของจริง
