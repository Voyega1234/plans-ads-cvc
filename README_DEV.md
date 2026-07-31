# ส่งงาน dev — LINE Tracking: Webhook timeout + ปุ่ม Test + แก้หน้าช้า + Client login เห็นเมนู staff

## 🚨 สำคัญที่สุดในชุดนี้: หัวข้อ 16 — middleware ที่ deploy อยู่บล็อก LINE webhook (Lead ไม่เข้า)
และ embed.js/ลิงก์ tracking ทั้งหมด **deploy ชุดนี้โดยเร็วที่สุด** แล้วเช็คตามหัวข้อ 16

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

รวมงานที่ยังไม่ได้ deploy ไว้ในชุดเดียว — ทั้งหมด **49 ไฟล์** (16 หัวข้อ ดูด้านล่าง)

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

## 9) embed.js — แก้ data-project หลุดจาก GTM แบบถาวร (ไม่ใช่แค่ patch เดิม)

### อาการ
Convert Cake เจอปัญหาเดียวกับส่วนที่ 7 ซ้ำอีกรอบ แม้ config ทุกอย่างถูกแล้ว (Console ไม่มี warning, "Use webhook" เปิด) เพราะ **GTM Custom HTML** ตอนแปลง string เป็น DOM element จริงเพื่อบังคับให้ browser รัน `<script>` (จำเป็น เพราะ script ที่แทรกผ่าน innerHTML เฉยๆ จะไม่รัน) ไม่รับประกันว่าจะ copy attribute แบบ `data-*` ไปด้วย — ยืนยันสดจาก Console จริงของ convertcake.com (`[LINEHub] missing data-project` ขึ้นบนหน้าเว็บจริง)

ทางแก้เฉพาะหน้าคือแก้ที่ตัว GTM tag เอง (ใส่ `window.LINEHubProject = "..."` ก่อนโหลด embed.js) — ใช้ได้ผลจริง (ตัวเลขผู้เข้าเว็บ Convert Cake นับได้ 3 → 51 หลังแก้) แต่เป็นแค่แก้ config ของโปรเจกต์เดียว ทุกโปรเจกต์ใหม่ที่ฝังผ่าน GTM จะเจอบั๊กเดิมซ้ำอีกถ้าไม่แก้ที่ระบบ

### สิ่งที่แก้ (ระดับโค้ด — กันทั้งระบบ)
เปลี่ยนวิธีระบุโปรเจกต์หลักจาก `data-project` (attribute, tag manager ทำหายได้) ไปเป็น **query string บน `src` เอง** (`?project=slug`) เพราะ `src` เป็นสิ่งที่ browser ต้องใช้โหลดสคริปต์ ไม่มี tag manager ตัวไหนตัดทิ้งได้

Snippet ใหม่ (แนะนำจากนี้ไป):
```html
<script src="https://<hub>/embed.js?project=slug"></script>
```
Snippet เก่า (`data-project="slug"`) **ยังใช้ได้เหมือนเดิม** — ลำดับการหา project คือ `?project=` บน src → `data-project` → `window.LINEHubProject` (fallback เดิมทั้งหมดยังอยู่ครบ ไม่ตัดของเก่าทิ้ง เว็บที่ติดตั้งไปแล้วไม่ต้องแก้อะไร)

ไฟล์ที่แก้:
- `src/app/embed.js/route.ts` — parse `?project=` จาก src ของตัวเอง เป็นลำดับแรก
- `src/app/line-tracking/projects/[projectId]/tracking-links/page.tsx` — snippet ที่ให้ copy เปลี่ยนเป็นฟอร์มใหม่
- `src/app/line-tracking/projects/[projectId]/setup/page.tsx` — เช่นเดียวกัน + ข้อความแจ้งเตือนตอน Test ไม่ตรง slug
- `src/lib/line-tracking/actions.ts` — `testEmbedAction` (ตัวเช็คว่าเว็บติดตั้งถูกไหม) รู้จักฟอร์มใหม่ด้วย เดิมมองหาแค่ `data-project="slug"`
- `src/app/line-tracking/guide/page.tsx` — ตัวอย่างในคู่มือเปลี่ยนเป็นฟอร์มใหม่ + อธิบายเหตุผลให้ลูกค้า/dev เข้าใจ

### ทดสอบแล้ว
จำลอง parse query string ทั้งฟอร์มใหม่/ฟอร์มเก่า (ไม่มี query)/มี param อื่นปนกัน — ได้ผลถูกทุกเคส, `tsc --noEmit` และ `npm run build` ผ่านสะอาด

---

## 10) สลิปไม่ถูกอ่านเลย (OCR) — เพิ่ม log + เพิ่ม Gemini เป็นตัวอ่านหลัก

### อาการ
ลูกค้าส่งสลิปเข้า LINE OA จริง → WebhookLog ขึ้น ✅ รับแล้ว (ไม่ crash) แต่ไม่มีบันทึก "อ่านสลิปอัตโนมัติ" ขึ้นในประวัติ lead เลย เหมือนระบบไม่เคยพยายามอ่าน

### Root cause ที่ยืนยันได้ตอนนี้
โค้ดเดิม (บล็อก image message ใน `route.ts`) ถ้า `ocrSlip()` คืนค่า `ok:false` (ไม่ว่าเพราะ Google Vision ยังไม่ตั้งค่า, `OCR_SPACE_API_KEY` ไม่มี, หรือเรียก API แล้ว error) **จะเงียบสนิท ไม่ log อะไรเลย** WebhookLog ที่ขึ้น SUCCESS บอกได้แค่ "webhook ไม่ crash" ไม่ได้บอกว่า OCR ทำงานสำเร็จหรือเปล่า — ยังหาสาเหตุจริงไม่ได้เพราะไม่มีช่องทางดู

(ทฤษฎีที่เป็นไปได้แต่ยังไม่ยืนยัน: Google Cloud Vision API ยังไม่ได้เปิดใช้บน GCP project หรือ `OCR_SPACE_API_KEY` ไม่ได้ตั้งใน Vercel — ต้องรอดู log หลัง deploy รอบนี้ถึงจะรู้ชัวร์)

### สิ่งที่เพิ่ม
เพิ่ม `console.error` 2 จุดใน `src/app/api/webhooks/line/[projectId]/route.ts`:
- โหลดรูปจาก LINE ไม่สำเร็จ → `[line-webhook] slip OCR: image download failed`
- OCR ล้มเหลว → `[line-webhook] slip OCR failed: <เหตุผลจริงจาก Vision/OCR.space>`

**หลัง deploy รอบนี้ ให้ส่งสลิปทดสอบอีกครั้ง แล้วเปิด Vercel Function log กรองคำว่า `slip OCR` จะเห็นสาเหตุจริงทันที** — ถ้าเป็นเรื่อง env var ก็ตั้งเพิ่ม ถ้า Vision API ยังไม่เปิดก็ไปเปิดใน GCP Console แก้ที่ต้นเหตุได้เลยโดยไม่ต้องเดา

ไฟล์ที่แก้: `src/app/api/webhooks/line/[projectId]/route.ts` (ไฟล์เดียวกับส่วนที่ 2 — ไม่กระทบ behavior เดิม เพิ่มแค่ log)

### เพิ่มเติม — ให้ Gemini อ่านสลิปแทน regex (เผื่อแก้ปัญหาตรงจุด)
เดิม flow คือ Google Vision อ่านตัวหนังสือดิบออกมาก่อน แล้วใช้ regex เดา "ยอดเงิน/เบอร์/ชื่อ" จากข้อความนั้น — regex เดาพลาดได้ง่ายเวลาสลิปแต่ละธนาคารจัดวางไม่เหมือนกัน

เปลี่ยนเป็น **ลอง Gemini ก่อน** (`src/lib/line-tracking/services/ocrService.ts`, ฟังก์ชัน `ocrGemini`) — ส่งรูปสลิปให้ Gemini ผ่าน Vertex AI ตัว OIDC เดิมที่ระบบใช้อยู่แล้ว (ไม่ต้องเพิ่ม API key ใหม่) แล้วให้ตอบ JSON ยอดเงิน/เบอร์/ชื่อ กลับมาเลยในคำตอบเดียว แม่นกว่า regex เพราะ Gemini เข้าใจบริบท (แยกยอดโอนจริงออกจากเลขบัญชี/เลขอ้างอิงได้) ถ้า Gemini ล้มเหลว จะ fallback ไป Google Vision ตัวเดิม แล้วค่อย fallback ไป OCR.space เป็นลำดับสุดท้าย (ลำดับเดิม)

ถ้าทั้ง Gemini และ Vision ล้มเหลวทั้งคู่ (และไม่มี `OCR_SPACE_API_KEY`) error message ที่ log จะโชว์เหตุผลของทั้งสองตัว (`Gemini: ... | Vision: ...`) ไม่ทิ้งเหตุผลของ Gemini ไป — เผื่อ debug ต่อได้ง่ายขึ้น

### เพิ่มเติม — แก้ให้ "เรียกแน่ๆ" ไม่ใช่แค่เพิ่ม log รอบนอก
เดิม guard เดียวเช็คครบทุกเงื่อนไขพร้อมกัน (`isMessage && type === "image" && message.id && messagingAccessToken`) — ถ้าเงื่อนไขไหนเงื่อนไขหนึ่งเป็น false (เช่น `messagingAccessToken` ไม่ได้ตั้งค่าไว้ในโปรเจกต์นั้น) ทั้งบล็อกจะถูกข้ามไปเงียบๆ **ไม่ log อะไรเลยแม้แต่บรรทัดเดียว** — นี่คือสาเหตุที่ search log คำว่า "OCR" แล้วไม่เจออะไรเลย (ทุก severity = 0): ไม่ใช่ว่า OCR รันแล้ว fail แบบเงียบ แต่เป็นไปได้ว่าโค้ดไม่เคยเข้าไปถึงจุดเรียก OCR เลย

แก้โดยแยกเช็คเป็น 2 ชั้น:
1. เช็คแค่ "นี่คือ message แบบรูปภาพหรือไม่" (`isMessage && event.message?.type === "image"`) — ถ้าใช่ **การันตีว่าจะมี log ออกมาอย่างน้อย 1 บรรทัดเสมอ**
2. ชั้นในค่อยเช็ครายละเอียด (มี message.id มั้ย, มี access token มั้ย, โหลดรูปสำเร็จมั้ย, OCR อ่านได้มั้ย, อ่านได้แต่ไม่มีข้อมูลที่ใช้ได้) — แต่ละกรณีที่ล้มเหลว log เหตุผลเฉพาะของมันเอง เช่น `no messagingAccessToken configured`, `image download failed`, `slip OCR failed: ...`, `slip OCR ok but extracted nothing usable`

**ผลคือ**: รอบทดสอบถัดไป ถ้าส่งรูปสลิปเข้า LINE OA จะต้องเห็น log อย่างน้อย 1 บรรทัดที่ขึ้นต้นด้วย `[line-webhook] slip OCR` เสมอ — ถ้ายังไม่เห็นอะไรเลย แปลว่าปัญหาไม่ได้อยู่ในบล็อกนี้แล้ว แต่อยู่ก่อนหน้านั้น (เช่น event ไม่ถึง handler, หรือ `isMessage`/`event.type` ไม่ตรงตามที่คิด) ซึ่งจะต้อง log เพิ่มที่จุดรับ event เข้ามาแทน

มนุษย์ยังต้องกดยืนยัน PAID เองเหมือนเดิม (OCR ไม่ใช่ตัวตรวจสอบความถูกต้องของสลิป แค่ช่วยกรอกให้)

### เพิ่มเติม — ให้ Gemini ช่วยสังเกตสลิปที่ดูตัดต่อ (สัญญาณเตือน ไม่ใช่การยืนยัน)
เพิ่มให้ Gemini ตอบมาด้วยว่า `suspicious` (true/false) และ `suspiciousReason` — สังเกตจากฟอนต์ตัวเลขยอดเงินไม่ตรงกับส่วนอื่นของสลิป, ตัวหนังสือเบี้ยว/ซ้อนทับผิดตำแหน่ง, พื้นหลังเบลอหรือมีรอยต่อเฉพาะจุด ฯลฯ

ถ้า `suspicious = true` จะขึ้น `⚠️ ต้องตรวจสอบ: <เหตุผล>` ในบันทึกประวัติ lead (คนละบรรทัดกับยอด/เบอร์/ชื่อที่อ่านได้) และ log `[line-webhook] slip OCR: suspicious slip flagged` ด้วย เพื่อให้เซลส์เห็นและตรวจสอบก่อนกด PAID โดยเฉพาะ

**ข้อจำกัดสำคัญที่ต้องบอกลูกค้า:** นี่คือ "สัญญาณเตือนเบื้องต้น" จาก AI เท่านั้น ไม่ใช่การยืนยันกับธนาคารว่าสลิปจริงหรือปลอม — สลิปปลอมที่ทำมาดีอาจไม่ถูก flag ก็ได้ ถ้าต้องการยืนยันกับธนาคารจริงๆ ต้องใช้ API ตรวจสอบสลิปแยก (เช่น SlipOK/EasySlip) ซึ่งเป็นงานเพิ่มนอกเหนือจากที่ทำรอบนี้ ยังไม่ได้ทำ

ทำงานเฉพาะฝั่ง Gemini (ตัวหลัก) เท่านั้น — ถ้า fallback ไป Vision หรือ OCR.space จะไม่มีค่า suspicious (เป็น undefined ไม่ใช่ false — ไม่ได้แปลว่าตรวจสอบแล้วว่าไม่น่าสงสัย แค่ไม่ได้ประเมิน)

### เพิ่มเติม — เจอสาเหตุจริงแล้วจาก log จริงหลัง deploy (2026-07-24)
ทดสอบส่งสลิปจริงหลัง deploy รอบก่อน แล้ว log ขึ้นตามที่คาดไว้ (การันตี log แล้วทำงานได้จริง) เจอ 2 ปัญหาซ้อนกัน:

1. **Cloud Vision API ยังไม่เปิดใช้บน GCP project ที่ใช้จริง** — error ที่ log ขึ้นตรงๆ: `Cloud Vision API has not been used in project 457755368033 before or it is disabled` → **นี่คือ action ที่ต้องทำนอกโค้ด**: เข้า https://console.developers.google.com/apis/api/vision.googleapis.com/overview?project=457755368033 (ลิงก์ตรงจาก error message) แล้วกด Enable — ทำแล้ว Vision fallback จะใช้งานได้ทันที ไม่ต้อง deploy ใหม่

2. **Gemini เองก็ล้มเหลว** ด้วย error เดิม `ไม่พบ JSON ในคำตอบ` — ยังไม่รู้สาเหตุแน่ชัดว่า Gemini ตอบว่าอะไรมา (safety block? ตอบเป็นข้อความธรรมดาแทน JSON? response ว่างเปล่า?) เพราะ error message เดิมไม่ได้โชว์เนื้อหาที่ Gemini ตอบมาจริง

   **แก้แล้ว**: ปรับ `ocrGemini()` ให้ error message ที่ log ออกมาบอกรายละเอียดจริง — ถ้า Gemini บล็อกเพราะ safety จะขึ้น `blocked: <เหตุผล>`, ถ้าตอบมาไม่ครบ (`finishReason` ไม่ใช่ `STOP`) จะขึ้น `finishReason: <ค่า>`, ถ้าตอบมาเป็นข้อความธรรมดาที่ไม่ใช่ JSON จะโชว์ข้อความนั้นมาเลย (300 ตัวอักษรแรก) — **หลัง deploy รอบนี้แล้วส่งสลิปทดสอบใหม่ log จะบอกได้ทันทีว่า Gemini ล้มเหลวเพราะอะไรกันแน่**

ไฟล์ที่แก้เพิ่ม: `src/lib/line-tracking/services/ocrService.ts` (จุดเดียว — ปรับ error message ให้ละเอียดขึ้น ไม่เปลี่ยน logic การอ่าน)

**สรุปสิ่งที่ต้องทำ 2 อย่างคู่กัน:**
- เปิด Cloud Vision API ตามลิงก์ข้างบน (ไม่ต้องรอ deploy) → แก้ fallback ให้ใช้งานได้ก่อนเลย
- Deploy โค้ดชุดนี้ → ส่งสลิปทดสอบอีกรอบ → เอา error message ใหม่จาก log มาดูกันว่า Gemini ติดอะไรกันแน่

ไฟล์ที่แก้เพิ่ม: `src/lib/line-tracking/services/ocrService.ts`

---

## 11) ปุ่ม Test ข้อ 1 ขัดแย้งกับตัวเลข click (✅ 966 ครั้ง แต่ Test ตอบ ❌ ไม่พบโค้ด)

### อาการ
หน้า Setup ข้อ 1 แสดง "ตรวจพบ click จริงแล้ว 966 ครั้ง" (เขียว) แต่กด 🔍 Test แล้วได้
"❌ เปิดเว็บได้ แต่ไม่พบโค้ด Tracking" — สองข้อความค้านกันเองบนการ์ดเดียว

### Root cause
สองเช็คใช้คนละวิธี: ตัวเลข click นับจาก `AdClick` ใน DB (traffic จริงที่ยิงเข้า `/api/track`)
ส่วนปุ่ม Test fetch HTML ดิบจาก server แล้วหา string `/embed.js` — เว็บที่ติดตั้งผ่าน
**GTM inject สคริปต์ตอน runtime** HTML ดิบจึงไม่มีแท็กนี้ (convertcake.com คือเคสนี้ ดูหัวข้อ 7/9)
สแกนเลยตอบ "missing" ทั้งที่โค้ดทำงานและส่ง click อยู่จริง

### สิ่งที่แก้
- `testEmbedAction`: ถ้าสแกน HTML ไม่เจอ (missing/wrongslug/unreachable) ให้เช็ค `adClick.count`
  ของโปรเจกต์ก่อนตัดสิน — ถ้ามี click จริง ตอบ verdict ใหม่ `oktraffic` (เขียว):
  "โค้ดทำงานอยู่จริง แค่สแกนมองไม่เห็นเพราะติดผ่าน GTM" → traffic จริงชนะผลสแกนเสมอ
- **เคสเริ่มโปรเจกต์ใหม่ (ติดผ่าน GTM แต่ยังไม่มี click):** สแกนต่อเข้าไปใน GTM container
  (`googletagmanager.com/gtm.js?id=GTM-…` เป็นไฟล์ public) — Custom HTML tag ที่ Publish แล้ว
  จะอยู่ในไฟล์นี้ → verdict ใหม่ `okgtm` (เขียว: เจอโค้ดใน GTM + slug ถูก) และ `gtmnotag`
  (เหลือง: เว็บใช้ GTM แต่ไม่เจอโค้ดใน container ที่ publish — จับเคส "ลืมกด Publish" ได้ด้วย)
- จุดสำคัญที่เทสกับของจริงแล้วเจอ: ใน container GTM จะ escape เครื่องหมายคำพูดเป็น `\"`,
  slash เป็น `\/` และบางเว็บผูกโปรเจกต์ผ่าน `window.LINEHubProject="slug"` แทน `?project=` —
  ตัวเช็ค slug จึงเป็น regex ครอบทุกรูปแบบ (src query / data-project / LINEHubProject ± escaped)
- ข้อความ `missing` (กรณี click = 0 และไม่ใช่ GTM) เพิ่มคำอธิบายเคส GTM + วิธีเช็คด้วยลิงก์ ?utm_source=

### เทสกับเว็บจริงแล้ว (30 ก.ค.)
| เว็บ | slug | ผล |
|---|---|---|
| convertcake.com (GTM-P7PCL3P) | convert-cake | ✅ okgtm (ผูกผ่าน `window.LINEHubProject`) |
| laposhclinic.com (GTM-T83M5KDL) | la-posh | ✅ okgtm — เคส "GTM + ยังไม่มี click" ที่เคยขึ้น ❌ หลอก |
| convertcake.com | slug ผิด | ⚠️ wrongslug (ตรวจจับ slug ไม่ตรงได้จริง) |

หมายเหตุ: slug จริงของโปรเจกต์ La Posh คือ `la-posh` (มีขีด) — ถ้าในระบบตั้งเป็นอย่างอื่น
ปุ่ม Test จะฟ้อง wrongslug ซึ่งถูกต้องแล้ว (ให้แก้ slug ให้ตรงกัน)

ไฟล์: `src/lib/line-tracking/actions.ts`, `src/app/line-tracking/projects/[projectId]/setup/page.tsx`,
`vercel.json` (เพิ่ม maxDuration 60 ให้หน้า setup — กัน server action timeout ตอนสแกน GTM)

---

## 12) Webhook relay — รองรับลูกค้าที่มีบอท/webhook เดิมอยู่แล้ว (เลือกได้ 2 option)

### ปัญหา
LINE ตั้ง Webhook ได้ **URL เดียวต่อ channel** — ลูกค้าที่มีบอทเดิม (chatbot/ระบบตอบแชท)
พอเอา URL ของเราไปวางทับ บอทเดิมจะหยุดรับ event ทันที ทำให้ลูกค้ากลุ่มนี้ติดตั้งไม่ได้

### สิ่งที่เพิ่ม
หน้า Connect LINE OA มีตัวเลือกโหมด Webhook ใหม่ (dropdown):
- **Option 1 (ค่าเริ่มต้น)** — ลูกค้าไม่มีบอทเดิม: ใช้ webhook ของเราอย่างเดียว (พฤติกรรมเดิมทุกอย่าง)
- **Option 2** — ลูกค้ามีบอทเดิม: วาง URL ของเราใน LINE เหมือนเดิม + ใส่ "Webhook URL เดิมของบอทลูกค้า"
  → ระบบ forward **raw body + `X-Line-Signature` เดิม** ต่อให้ทุก event หลัง verify signature ผ่าน

ทำไมใช้ได้: ลายเซ็นคือ HMAC-SHA256 ของ raw bytes ด้วย channel secret ซึ่งบอทเดิมใช้ secret
ตัวเดียวกัน (channel เดียวกัน) — forward raw bytes เดิมไม่แตะต้อง บอทปลายทาง verify ผ่าน
เหมือน LINE ยิงตรง และ `replyToken` ใช้ตอบแชทได้ปกติ (ระบบเราไม่ได้ใช้ replyToken แย่งกัน)

รายละเอียด implementation:
- forward วิ่งใน `waitUntil` (นอก critical path — ACK LINE ภายใน ~1s เหมือนเดิม), timeout 10s, retry 2 ครั้ง
- ถ้า forward ล้มเหลว: เขียน `WebhookLog` status FAILED โผล่ในแผง "📡 Webhook ล่าสุด" หน้า Setup
  (LINE ไม่ retry ให้เพราะเรา ACK ไปแล้ว — event รอบนั้นหายเฉพาะฝั่งบอทลูกค้า ฝั่ง tracking เราปกติ)
- Guard: forwardUrl ต้องเป็น https และห้ามชี้กลับเข้า `/api/webhooks/line` (กัน loop)
- เก็บใน `configJson` ของ `ProjectConnection` (field `webhookMode` + `forwardUrl`) — **ไม่ต้อง migrate DB**
- `connectors.ts` เข้าชุดนี้ด้วยเพราะเพิ่ม field ใน `LineConfig` + LINE meta + รองรับ field แบบ dropdown

ไฟล์: `src/lib/line-tracking/connectors.ts` (ใหม่ในชุด), `src/app/api/webhooks/line/[projectId]/route.ts`,
`src/components/line-tracking/ConnectionCard.tsx`, `src/lib/line-tracking/connector-guide.ts`

---

## 13) Campaign Adjustment — filter + reapprove ก่อน push + ปรับ Bidding/Keywords (มี AI)

หน้า `/campaign-editor` (หัวข้อบนหน้าคือ "Campaign Adjustment") + หน้า `/campaign-adjustment/[planId]`

### 13.1 Filter รายการแคมเปญ (ทั้งสองหน้า)
- ช่องค้นหาชื่อ campaign + ปุ่มกรอง status (ทั้งหมด / ENABLED / PAUSED)
- ตัวเลขแสดง "ที่เห็น/ทั้งหมด" · **Select All เลือกเฉพาะที่ผ่าน filter** (กรองก่อนแล้วค่อยเลือกทั้งชุด)

### 13.2 Reapprove ก่อน push จริง (แก้ "กด Pause แล้ว paused ทันที")
- ปุ่ม Enable All / Pause All ไม่ยิงทันทีอีกแล้ว — เปิด **modal ยืนยัน** แสดงรายการว่า
  campaign ไหนจะเปลี่ยนจากอะไรเป็นอะไร ต้องกดยืนยันก่อนระบบถึง push ไป Google Ads
- การปรับ Bidding และ Keywords ทุกรายการ (ข้อ 13.3) ก็ผ่าน modal เดียวกันหมด
- ปรับงบยังใช้ BudgetModal เดิม (มีขั้นยืนยัน + แสดงรายการอยู่แล้ว)

### 13.3 ปรับระดับอื่นเพิ่มจากเดิม (เดิม: เปิด/ปิด, งบ, text ads)
- **Bidding (ทุก campaign):** ปรับ Target CPA / Target ROAS ผ่าน action `edit_campaign_bidding`
  ที่มีอยู่แล้วใน API — แสดง strategy ปัจจุบันของ campaign (เพิ่ม `bidding_strategy_type`
  ใน GAQL ของ campaigns route) + เตือนถ้าเลือก strategy ไม่ตรงกับที่ campaign ใช้จริง
- **Keywords (SEARCH campaigns):** section ใหม่ใต้ตัวแก้ ads —
  ดู keyword ทุก ad group (match type / status / negative) · พัก/เปิด/ลบทีละคำ ·
  เพิ่มหลายคำพร้อมกัน (เลือก match type + ad group) ·
  **AI แนะนำ** (route ใหม่ `keyword-suggest` — ใช้ `safeCallAI` provider เดิม **ไม่แตะโค้ด AI/OIDC**):
  อิงจาก keyword ที่รันอยู่ + ad copy จริงของแคมเปญ + คำสั่งที่พิมพ์ เสนอคำเพิ่ม (ติ๊กเลือกได้)
  และชี้คำที่ควรพัก/ลบพร้อมเหตุผล
- API ใหม่ `campaign-edit/keywords`: GET (GAQL `keyword_view` ต่อ campaign) + POST
  (adGroupCriteria:mutate — add / set_status / remove, สูงสุด 100 รายการ/ครั้ง)

### 13.4 รอบเพิ่มเติม (31 ก.ค.): Extensions / Audiences / Ad group / รูป PMax — ครบทุกระดับแล้ว
- **Extensions (SEARCH/DISPLAY/PMAX/DEMAND_GEN):** ดู-เพิ่ม-ถอด Sitelink (ข้อความ≤25 + URL +
  คำอธิบาย 2 บรรทัด≤35) และ Callout (≤25) ระดับแคมเปญ — route ใหม่ `extensions`:
  สร้าง asset + link เป็น **atomic เดียว** ผ่าน `googleAds:mutate` + temp resource name
  (ไม่มี asset ค้างถ้า link fail) · ถอด = unlink (asset ยังอยู่ใน library เหมือน Google UI)
- **Audiences (ทุกประเภทยกเว้น PMax):** ดู user list ที่ผูกกับแคมเปญ + เพิ่มจาก dropdown
  รายชื่อ user list ทั้งบัญชี (โชว์ขนาด list) + bid modifier + ถอด — route ใหม่ `audiences`
  (campaignCriteria:mutate type USER_LIST) · PMax ไม่โชว์เพราะ audience อยู่ที่ asset group signal
- **Ad group (SEARCH/DISPLAY):** ตาราง ad group ทุกกลุ่ม — เปิด/หยุดรายกลุ่ม + ปรับ CPC bid
  รายกลุ่ม (มี hint ว่า smart bidding ไม่ใช้ค่านี้) — route ใหม่ `ad-groups` (adGroups:mutate)
- **รูประดับ Asset Group (PMax):** เลือก asset group → เห็น thumbnail รูป/โลโก้ทุกใบ
  (list จาก `asset-groups` route เดิม) → ถอดรูป / อัปโหลดรูปใหม่ (เลือกประเภท Landscape/Square/
  Portrait/Logo) — route ใหม่ `asset-group-assets`: รับ URL จาก `/api/upload/image` เดิม
  (ซึ่งคืนแค่ `{url}` ไม่มี asset resource) → โหลดรูป server-side → สร้าง ImageAsset + ผูกเข้า
  asset group แบบ atomic · unlink สร้าง resource name จากรูปแบบมาตรฐาน `{agId}~{assetId}~{fieldType}`
  · ถ้าถอดต่ำกว่าขั้นต่ำ PMax Google จะปฏิเสธเอง (ข้อความ error ส่งถึง UI)
- ทุก action ผ่าน **modal reapprove** เดียวกับ 13.2 ทั้งหมด

### 13.5 โหมดจริงเท่านั้น — ตัด mock ออกทั้งเส้นทาง Campaign Adjustment (31 ก.ค.)
ทุก route ในเส้นทางนี้**ยิง Google Ads API จริงเสมอ** ไม่สน env `MOCK_GOOGLE_ADS` อีกต่อไป:
- ตัด `isMockMode()` + mock data ออกจาก: `campaign-adjustments` (push status/งบ/bidding +
  4 action ของหน้า plan), `campaign-edit/campaigns`, `ads`, `asset-groups`, `pmax-update`,
  `shopping-products`, `keywords`, `extensions`, `audiences`, `ad-groups`, `asset-group-assets`
  — 5 ไฟล์ (adjustments/ads/asset-groups/pmax-update/shopping-products) เดิมอยู่ใน repo
  จึงถูกดึงเข้าชุดนี้เพื่อแก้ (+5 ไฟล์)
- `keyword-suggest`: ถ้า AI provider ล่ม จะตอบ "ยังไม่มีคำแนะนำ" ตรง ๆ — **ไม่สร้างคำแนะนำ
  สำรองปลอม**อีกแล้ว (ป้องกันคำ template หลุดไป push จริง)
- UI สองหน้า (editor + [planId]) ลบการแสดงผล "(Mock)" ออกหมด
- ถ้า credentials Google Ads ไม่ครบ จะได้ **error ชัดเจน** แทน mock เงียบ ๆ
- ขอบเขต: แตะเฉพาะเส้นทาง campaign adjustment — ฟีเจอร์อื่นที่ใช้ `isMockMode()`
  (push-blueprint, automation ฯลฯ) ไม่ถูกแตะ

### ที่มีอยู่แล้ว (ไม่แตะ)
- เปลี่ยนรูป GDN + เพิ่ม PMax Asset Group → หน้า `/campaign-adjustment/[planId]`
- แก้ text ads ทุกประเภท (RSA/RDA/PMax/Demand Gen/App) + AI → หน้า editor เดิม

ไฟล์: `src/app/campaign-editor/page.tsx`, `src/app/campaign-adjustment/[planId]/page.tsx`,
`src/app/api/campaign-edit/campaigns/route.ts` + route ใหม่ 6 ตัว: `keywords`, `keyword-suggest`,
`extensions`, `audiences`, `ad-groups`, `asset-group-assets`

---

## 14) รอบ 31 ก.ค. (ชุดที่ 2): Tools hub / Line Tracking settings / Filters / Monthly budget

### 14.1 เอาหน้า /tools ออก
- Sidebar: แถว "Tools" เปลี่ยนจากลิงก์เป็นปุ่มกาง dropdown อย่างเดียว (เมนูย่อยทุกตัวยังอยู่ครบ)
- `/tools` เปลี่ยนเป็น redirect → `/dashboard` (กัน bookmark เก่าค้าง) — **ไม่แตะหน้าอื่น** ทุก tool เข้าได้ปกติ

### 14.2 Conversion Mapping — แก้ชื่อ event ได้ (Standard / Custom)
- แต่ละ platform ในแต่ละสถานะ: dropdown **Standard events** ของ platform นั้น
  (`PLATFORM_STANDARD_EVENTS` ใน platforms.ts — GA4/Meta/TikTok/Snapchat ตามชื่อ official,
  LINE Ads/Microsoft/X เป็น default แนะนำเพราะ event เป็นแบบ account กำหนดเอง)
- ช่อง **Custom พิมพ์เอง** ข้าง dropdown — กรอกเมื่อไหร่ชนะ dropdown (กัน event ซ้ำกับที่มีในบัญชี)
- ระบบยัง set default ให้เหมือนเดิม — ไม่แตะอะไรก็ทำงานเท่าเดิมเป๊ะ (ค่าปัจจุบันถูก pre-select)

### 14.3 แยก Client Login + Conversion Mapping เป็น Settings sub pages (ต่อโปรเจกต์)
- ใหม่: `/line-tracking/projects/{id}/settings` (hub) + `/settings/client-login` (เฉพาะแอดมิน)
  + `/settings/conversion-mapping`
- Setup Wizard: สองส่วนนี้กลายเป็นการ์ดลิงก์ไป Settings + ปุ่ม ⚙️ Settings บน header

### 14.4 🚫 line_block ส่งได้ทุก platform
- เพิ่ม `blockEvent: "line_block"` ให้ Microsoft + X (ครบ 7 platform แล้ว) — `enqueueBlockConversion`
  ยิงให้ทุก platform ที่เชื่อมต่อโดยอัตโนมัติเมื่อลูกค้าบล็อก OA
- ตารางอ้างอิง event ใน settings/conversion-mapping มีแถว 🚫 line_block ต่อ platform แล้ว

### 14.5 Reports — filter เฉพาะแคมเปญ Active
- plumb `campaign.status` ผ่าน `reporting.ts` → `performance-reader.ts` → weekly API → หน้า Reports
- ปุ่ม "✓ เฉพาะ Active / รวม Paused" (default = Active) — มีผลทั้งตาราง กราฟ export และ context AI
- หมายเหตุ: snapshot เก่าที่ sync ไว้ใน DB ไม่มี status → ถือเป็น ENABLED (live pull มีครบ)

### 14.6 Campaign Monitor (/dashboard) — filter + เปลี่ยน bidding type
- ปุ่มกรอง Active / Paused / ทั้งหมด (default = Active ตัดหาง PAUSED ยาว ๆ)
- Modal แก้แคมเปญ: เพิ่ม **เลือก Bidding Strategy** (tCPA / MaxConv / tROAS / MaxConvValue) —
  เปลี่ยน type ได้จริงผ่าน `changeStrategy` ใหม่ใน campaign-adjustments API (updateMask ทั้ง
  bidding scheme) + คำเตือน learning period + confirm ก่อน push · หน้า campaign-editor
  (Bidding section) ใช้ความสามารถเดียวกันนี้ด้วย

### 14.7 Morning-brief — Monthly Budget Progress (ต่อ account)
- API ใหม่ `morning-brief/monthly-budget`: MTD spend ราย account (GAQL THIS_MONTH)
- การ์ดต่อ account ตามดีไซน์ที่กำหนด: งบทั้งหมด / ใช้ไปแล้ว % + บาท / คงเหลือ ·
  เส้น progress ซ้าย→ขวา มีธง 🏁 ที่ 100% จุดสีเขียว = ตอนนี้ จุดส้ม/แดง = คาดการณ์สิ้นเดือน
  (run-rate: spend ÷ วันที่ผ่านมา × วันทั้งเดือน) · บอกเกิน/ขาดเป็น % และบาท ·
  ป้ายแนวโน้ม: ⚠️ เกินงบ / ✓ ตามแผน / 💤 ต่ำกว่าแผน
- **งบเดือนตั้งเองต่อ account เก็บใน localStorage ของเบราว์เซอร์** (ไม่มี migration DB) —
  ข้อจำกัด: ตั้งใหม่ต่อเครื่อง/เบราว์เซอร์ ถ้าอยากให้ทีมเห็นค่าเดียวกันต้องย้ายลง DB รอบหน้า

### 14.8 คำตอบข้อ "ไม่มีเว็บไซต์ track ได้ไหม" (ไม่ต้องแก้โค้ด)
- ได้ — ใช้ลิงก์ `/go/{slug}?utm_source=...` (มีอยู่แล้ว): บันทึก click ฝั่ง server →
  redirect เข้า LINE add-friend ทันที → follow event ถูก attribute ด้วย window 3 ชม.
  (หรือแม่น 1:1 ถ้าเปิดโหมด LINE Login) · click จาก /go นับเป็น AdClick ทำให้ checklist ผ่านเอง
- ลิงก์ lin.ee ที่สร้างจาก Gain Friends ใน LINE OA Manager ตรง ๆ → ระบบเรา**วัดที่มาไม่ได้**
  (ไม่ผ่านเรา) — ใช้ /go เป็นตัวหน้าแล้วมัน redirect ไป lin.ee เดิมให้แทน

---

## 15) LIFF tracking link + Monthly budget ลง DB กลาง (รอบ 31 ก.ค. ชุดที่ 3)

### 15.1 LIFF — วัดคน add จาก "ลิงก์โดเมน LINE" (FB post / ยิงแอดเข้า LINE ตรง ๆ)

**เหตุผล:** ลิงก์ lin.ee ที่สร้างจาก OA Manager วิ่งตรงเข้า LINE — ระบบไม่มีทางรู้ที่มา
LIFF แก้ตรงนี้: ลิงก์ `https://liff.line.me/{liffId}?src=fb-post` เป็น**โดเมน LINE แท้**
เปิดในแอป LINE → หน้า LIFF ของเราบันทึก click + LINE userId (verify token กับ LINE ฝั่ง server
— ไม่เชื่อ userId จาก client) → เด้งต่อไปหน้า add friend ทันที → พอ follow event เข้า webhook
ระบบหยิบ click ที่ผูกกับ user คนนั้นเป๊ะ ๆ (**1:1 แม่นกว่า 3h-window**)

**เป็น optional สมบูรณ์ — เลือกได้ 3 ระดับต่อลูกค้า:**
| ระดับ | เชื่อมอะไร | วัดอะไรได้ |
|---|---|---|
| 1 | LINE OA อย่างเดียว (Messaging) | Lead เข้าปกติ แต่ add ที่ไม่ผ่านเว็บ = ไม่รู้ที่มา |
| 2 | + เว็บ embed / ลิงก์ /go | วัดจากเว็บ + โฆษณาที่ผ่าน /go (3h window) |
| 3 | + LIFF (ต้องมี Login channel) | วัดลิงก์โดเมน LINE ตรง ๆ แบบรายคน 1:1 |

โปรเจกต์ที่ไม่ใส่ LIFF ID → ไม่มีอะไรเปลี่ยนเลย (หน้า /liff จะ redirect เฉย ๆ ถ้าถูกเรียก)

**วิธีตั้ง (ต่อโปรเจกต์ · อยู่ในคู่มือหน้า Connect LINE แล้ว):**
1. LINE Developers → Provider ของลูกค้า → สร้าง/เปิด **LINE Login channel**
2. แท็บ LIFF → Add → **Endpoint URL = `{โดเมนระบบ}/liff/{slug}`** · Scope: `profile`
3. เอา **LIFF ID** มาวางช่อง LIFF ID ในฟอร์ม Connect LINE → การ์ดจะโชว์ลิงก์พร้อม copy
4. แจกลิงก์ `https://liff.line.me/{liffId}?src=ชื่อช่องทาง` (เปลี่ยน src ต่อช่องทาง)

**Fail-open:** อะไรพังก็ตาม (SDK/token/API) ผู้ใช้ถูกส่งต่อไป add friend เสมอ — tracking
ห้ามขวางการ add · Lead ไม่ถูกสร้างตอนเปิดลิงก์ (กัน Lead ผี) — สร้างตอน follow จริงเท่านั้น

**leadService (แก้แบบ additive):** ก่อน fallback ไป 3h-window ให้เช็ค click ที่ stamp ไว้บน
LineUser ก่อน (LIFF/LINE Login ใช้ร่วมกัน) — ถ้าไม่มีก็ทำงานแบบเดิมทุกประการ

### 15.2 Monthly budget ย้ายจาก localStorage → DB กลาง (ทั้งทีมเห็นค่าเดียวกัน)
- ตาราง `AccountMonthlyBudget` (customer_id PK, budget_baht, updated_at) — **สร้างเอง
  อัตโนมัติ**ด้วย `CREATE TABLE IF NOT EXISTS` ผ่าน connection ของแอปตอนเรียกครั้งแรก
  → ไม่ต้องแก้ prisma schema ไม่ต้อง migrate ไม่ต้องรัน SQL เอง
- API `monthly-budget`: GET คืน spend + budget ต่อ account · PUT บันทึกงบ (upsert)
- หน้า morning-brief ตัด localStorage ออกหมด — งบที่ตั้งเห็นเหมือนกันทุกเครื่อง/ทุกคน

---

## 16) 🚨 ด่วนที่สุด — middleware บน production บล็อก Line Tracking ทั้งระบบอยู่ตอนนี้

### อาการ (ตรวจกับ production จริง 31 ก.ค.)
- `GET /embed.js` → **302 ไปหน้า login** = เว็บลูกค้าโหลดสคริปต์ไม่ได้ → click ไม่เข้าเลย
- `POST /api/webhooks/line/{id}` → **401** = **LINE webhook โดนปฏิเสธ → Lead ไม่เข้าระบบ**
- `/go/…`, `/t/…`, `/line/start` → 302 login = ลิงก์ในโฆษณา/tracking link ตายหมด

### Root cause
ชุดแก้ auth (plans-ads fix) เขียน `src/middleware.ts` ใหม่เป็นแบบ edge-safe (ถูกต้อง)
แต่**ทำรายการยกเว้น route สาธารณะของ Line Tracking หายไปทั้งชุด** (PUBLIC_TRACKING_PREFIXES
+ ระบบ cookie ของ client viewer) — deploy แล้วทุก request ที่ไม่มี session โดนไล่ไป login

### สิ่งที่แก้ — middleware ฉบับรวม (ไฟล์นี้ทับของทุกชุดก่อนหน้า)
- ฐาน edge-safe เดิมของชุด auth (NextAuth จาก `auth.config.ts` — ห้าม import prisma) ✓ คงไว้
- คืน `PUBLIC_TRACKING_PREFIXES` ครบ + เพิ่ม `/liff/`, `/api/liff/` ของหัวข้อ 15
- คืน logic client-viewer cookie (`clientToken.ts` เป็น jose ล้วน — edge-safe อยู่แล้ว)
- แนบ `src/lib/auth.config.ts` มาในชุดด้วย (ก๊อปเดิมจากชุด plans-ads ไม่แก้อะไร) เผื่อ repo ยังไม่มี

### หลัง deploy ต้องเช็คทันที
`curl -I https://<domain>/embed.js` ต้องได้ **200** (ไม่ใช่ 302) และเปิด
`/api/webhooks/line/{projectId}` ใน browser ต้องได้ JSON version probe (ไม่ใช่ 401)
แล้วกด Verify ใน LINE Developers + ทัก OA จริง 1 ครั้งดู Lead เข้า

---

# ไฟล์ในชุดนี้ (49 ไฟล์)

```
vercel.json                                                  ← maxDuration webhook + regions bom1
src/app/api/webhooks/line/[projectId]/route.ts               ← ตอบ 200 ทันที + waitUntil + log OCR fail + forward relay (หัวข้อ 12)
src/app/api/line-tracking/client-login/route.ts              ← ลบคุกกี้ staff ให้ได้จริง
src/components/line-tracking/ConnectionCard.tsx              ← + dropdown โหมด Webhook (12) + โชว์ลิงก์ LIFF (15.1)
src/lib/line-tracking/actions.ts                             ← + testEmbedAction/oktraffic (11) + custom event ชนะ dropdown (14.2)
src/lib/line-tracking/connectors.ts                          ← ใหม่ในชุด: LineConfig + webhookMode/forwardUrl + field แบบ dropdown (หัวข้อ 12)
src/lib/line-tracking/services/projectService.ts             ← ยุบ query ด้วย groupBy
src/lib/line-tracking/services/ocrService.ts                 ← อ่านสลิปด้วย Gemini ก่อน (fallback Vision → OCR.space)
src/app/line-tracking/projects/[projectId]/page.tsx          ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/setup/page.tsx    ← + ปุ่ม Test + oktraffic (11) + ย้าย 2 ส่วนไป Settings (14.3)
src/app/line-tracking/projects/[projectId]/funnel/page.tsx   ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/conversions/page.tsx ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/sheet/page.tsx    ← รวมเป็นรอบเดียว
src/app/line-tracking/projects/[projectId]/tracking-links/page.tsx ← snippet ใหม่ (?project=slug)
src/lib/line-tracking/connector-guide.ts                     ← + ขั้นตอน Option 2 (12) + ขั้นตอนตั้ง LIFF (15.1)
src/app/line-tracking/guide/page.tsx                         ← คู่มือในระบบ: + OA Manager + snippet ใหม่
src/app/embed.js/route.ts                                    ← หาแท็กตัวเองให้เจอเมื่อฝังผ่าน GTM + ?project= กันหลุดถาวร
src/app/campaign-editor/page.tsx                             ← filter + reapprove modal + Bidding + Keywords/AI (หัวข้อ 13)
src/app/campaign-adjustment/[planId]/page.tsx                ← filter ชื่อ + status ในลิสต์แคมเปญ (หัวข้อ 13.1)
src/app/api/campaign-edit/campaigns/route.ts                 ← + bidding_strategy_type (หัวข้อ 13.3)
src/app/api/campaign-edit/keywords/route.ts                  ← ใหม่: list + mutate keywords (หัวข้อ 13.3)
src/app/api/campaign-edit/keyword-suggest/route.ts           ← ใหม่: AI แนะนำ keyword ผ่าน safeCallAI เดิม (หัวข้อ 13.3)
src/app/api/campaign-edit/extensions/route.ts                ← ใหม่: Sitelink/Callout list+add+remove (หัวข้อ 13.4)
src/app/api/campaign-edit/audiences/route.ts                 ← ใหม่: Audience USER_LIST list+add+remove (หัวข้อ 13.4)
src/app/api/campaign-edit/ad-groups/route.ts                 ← ใหม่: ad group bid + เปิด/หยุดรายกลุ่ม (หัวข้อ 13.4)
src/app/api/campaign-edit/asset-group-assets/route.ts        ← ใหม่: เพิ่ม/ถอดรูป PMax asset group (หัวข้อ 13.4)
src/app/api/campaign-adjustments/route.ts                    ← ตัด mock — push status/งบ/bidding จริงเสมอ (หัวข้อ 13.5)
src/app/api/campaign-edit/ads/route.ts                       ← ตัด mock — list/แก้ text ads จริงเสมอ (หัวข้อ 13.5)
src/app/api/campaign-edit/asset-groups/route.ts              ← ตัด mock — list asset group จริงเสมอ (หัวข้อ 13.5)
src/app/api/campaign-edit/pmax-update/route.ts               ← ตัด mock (หัวข้อ 13.5)
src/app/api/campaign-edit/shopping-products/route.ts         ← ตัด mock (หัวข้อ 13.5)
src/components/layout/Sidebar.tsx                            ← Tools = dropdown อย่างเดียว (14.1)
src/app/tools/page.tsx                                       ← redirect → /dashboard (14.1)
src/lib/line-tracking/platforms.ts                           ← + PLATFORM_STANDARD_EVENTS + blockEvent ครบ 7 (14.2/14.4)
src/components/line-tracking/ConversionRuleRow.tsx           ← dropdown standard + ช่อง custom (14.2)
src/app/line-tracking/projects/[projectId]/settings/page.tsx                    ← ใหม่: settings hub (14.3)
src/app/line-tracking/projects/[projectId]/settings/client-login/page.tsx       ← ใหม่ (14.3)
src/app/line-tracking/projects/[projectId]/settings/conversion-mapping/page.tsx ← ใหม่ + แถว line_block (14.3/14.4)
src/lib/google-ads/reporting.ts                              ← + campaign.status ใน GAQL (14.5)
src/lib/google-ads/performance-reader.ts                     ← ส่ง status ผ่าน snapshot (14.5)
src/app/reports/page.tsx                                     ← ปุ่มเฉพาะ Active + derived report (14.5)
src/app/dashboard/page.tsx                                   ← filter status + เปลี่ยน bidding type ใน modal (14.6)
src/app/morning-brief/page.tsx                               ← Monthly Budget Progress ต่อ account (14.7)
src/app/api/morning-brief/monthly-budget/route.ts            ← ใหม่: MTD spend + งบเดือนใน DB กลาง (14.7/15.2)
src/app/liff/[projectSlug]/page.tsx                          ← ใหม่: LIFF entry — บันทึก click แล้วพาไป add friend (15.1)
src/app/api/liff/[projectSlug]/route.ts                      ← ใหม่: verify LIFF token + record click + stamp user (15.1)
src/lib/line-tracking/services/leadService.ts                ← additive: หยิบ click ที่ผูกกับ user ก่อน 3h-window (15.1)
src/middleware.ts                                            ← 🚨 ฉบับรวม: edge-safe + คืน public tracking + /liff (16)
src/lib/auth.config.ts                                       ← ก๊อปเดิมจากชุด plans-ads (ไม่แก้) — ให้ middleware build ได้ (16)
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
6. **หัวข้อ 11:** โปรเจกต์ที่มี click แล้ว (เช่น convert-cake 966 ครั้ง) → กด 🔍 Test → ต้องได้ข้อความเขียว
   "โค้ดทำงานอยู่จริง…" ไม่ใช่ ❌ ไม่พบโค้ด (ข้อความ ❌ จะขึ้นเฉพาะโปรเจกต์ที่ click = 0 จริง ๆ)
7. **หัวข้อ 12:** หน้า Connect LINE OA ต้องเห็น dropdown "โหมด Webhook" + ช่อง "Webhook URL เดิมของบอทลูกค้า"
   → เลือก Option 2 ใส่ URL บอททดสอบ (เช่น webhook.site) → Save → ทัก OA 1 ครั้ง →
   ปลายทางต้องได้รับ POST พร้อม header `x-line-signature` และ Lead ยังเข้าระบบเราปกติ
   → ลองใส่ URL ผิด ๆ แล้วทัก OA → แผง "📡 Webhook ล่าสุด" ต้องมีรายการ FAILED บอกว่า forward ไม่สำเร็จ
8. **หัวข้อ 13:** `/campaign-editor` → พิมพ์ค้นหา + กดกรอง PAUSED → ลิสต์ต้องกรองจริง และ
   Select All ต้องเลือกเฉพาะที่เห็น → เลือกแคมเปญแล้วกด Pause All → **ต้องมี modal ยืนยันก่อน**
   (กดยกเลิกต้องไม่มีอะไรเปลี่ยน) → แท็บแคมเปญ SEARCH ต้องมี section Bidding + Keywords →
   ลองพัก keyword 1 คำ (ผ่าน modal) + กด AI แนะนำ — คำแนะนำต้องมาจาก AI จริง (ถ้า provider ล่ม
   จะขึ้นข้อความ "ยังไม่มีคำแนะนำ" ตรง ๆ ไม่มีคำ template)
9. **หัวข้อ 13.4:** แท็บ SEARCH ต้องมี section Ad Groups / Extensions / Audiences เพิ่ม —
   ลองเพิ่ม Callout 1 อัน + ปรับ CPC bid 1 กลุ่ม (ทุกอันต้องผ่าน modal ยืนยัน) →
   แท็บ PMax ต้องเห็น thumbnail รูปใน asset group + ลองอัปโหลดรูป Square 1 ใบ →
   เช็คใน Google Ads UI ว่ารายการที่ push ไปโผล่จริง — **ระบบยิงจริงเสมอ ไม่มี mock แล้ว**
   เทสกับแคมเปญที่ PAUSED อยู่ก่อน แล้วลบ/ย้อนรายการทดสอบใน Google Ads UI หลังเทสเสร็จ
10. **หัวข้อ 14:** เมนู Tools ต้องกางเมนูย่อยอย่างเดียว (คลิกแล้วไม่เด้งไปหน้า hub, /tools เด้งไป
   /dashboard) → Line Tracking: หน้า Setup มีปุ่ม ⚙️ Settings + step Conversion Mapping เป็นลิงก์
   → settings/conversion-mapping แก้ event เป็น custom แล้ว Save ต้องเก็บค่า → Reports + Campaign
   Monitor มีปุ่มกรอง Active (default) → Monitor แก้แคมเปญเปลี่ยน strategy ต้องมี confirm →
   Morning-brief ใส่งบเดือน 1 account ต้องเห็นเส้น progress + จุดคาดการณ์ + ป้ายแนวโน้ม
11. **หัวข้อ 15:** งบเดือนที่ตั้งใน morning-brief ต้องเห็นเหมือนกันจากเครื่อง/บัญชีอื่น (อยู่ใน DB แล้ว)
   → โปรเจกต์ที่ใส่ LIFF ID: เปิดลิงก์ liff.line.me จากมือถือ → ต้องเด้งถึงหน้า add friend ลื่น ๆ
   และมี AdClick ใหม่ (source ตาม ?src=) → add เพื่อนจริง → Lead ต้องผูกกับ click นั้น (1:1)
   → โปรเจกต์ที่ไม่ใส่ LIFF ID ต้องไม่มีอะไรเปลี่ยน

> จุดเดียวที่อาจต่างแบบไม่มีผล: ตารางแยกช่องทาง ถ้ามี 2 ช่องทางที่ lead **เท่ากันเป๊ะ** ลำดับบน-ล่างอาจสลับกัน (ของเดิมก็ไม่ได้กำหนดลำดับ tie ไว้)

---

# ยืนยันแล้วฝั่งเรา

- `npx tsc --noEmit` → 0 error *(รอบหัวข้อ 1–10)*
- `npm run build` → `✓ Compiled successfully` ครบทุก route *(รอบหัวข้อ 1–10)*
- `vercel.json` → valid JSON

**หัวข้อ 11–13 (รอบเพิ่มเติม 30 ก.ค.) — สิ่งที่ทดสอบจริงแล้ว:**
- สแกน GTM container กับเว็บจริง: convertcake.com → `okgtm`, laposhclinic.com (`la-posh`) → `okgtm`,
  slug ผิด → `wrongslug` (รัน logic ชุดเดียวกับใน `testEmbedAction` ผ่าน Node script)
- Webhook relay: จำลอง LINE ยิง payload ไทย+อีโมจิ → forward ไป server ทดสอบที่ verify
  HMAC-SHA256 แบบเดียวกับ LINE SDK → **body ตรงทุก byte + ลายเซ็นผ่าน + x-line-retry-key ครบ**,
  retry ทำงาน (รอบแรก 500 → ส่งสำเร็จรอบ 2), guard ปฏิเสธ http / URL วน loop / URL เสีย

⚠️ ที่ตรวจไม่ได้จากเครื่องนี้: `tsc` + `next build` (ไม่มี repo เต็ม — ไม่มี `prisma/schema.prisma` +
`tsconfig.json`) — ทุกไฟล์ผ่าน esbuild syntax check แล้ว แต่ **dev ต้องรัน `npx tsc --noEmit` +
`npm run build` ใน repo จริงก่อน deploy** (ตามขั้น Deploy อยู่แล้ว) · ส่วน UI หัวข้อ 13 ยังไม่ได้
เปิดในเบราว์เซอร์จริง — เทสตามข้อ 8–9 ใน "เทสหลัง deploy"

⚠️ หัวข้อ 13.4: payload ของ `googleAds:mutate` / `campaignCriteria:mutate` / `adGroups:mutate` /
`assetGroupAssets` เขียนตามสเปค Google Ads API v21 (REST) และตาม pattern ของ route เดิมในโปรเจกต์
แต่**ยังไม่ได้ยิงกับบัญชีจริงจากเครื่องนี้** — และตั้งแต่หัวข้อ 13.5 **ไม่มี mock ให้เทสแล้ว**
ทุก request ไปบัญชีจริง: เทสกับแคมเปญที่ PAUSED / รายการเล็ก ๆ ก่อน แล้วเก็บกวาดใน
Google Ads UI หลังเทส ก่อนปล่อยให้ใช้กับแคมเปญลูกค้าที่รันอยู่

**ยังไม่ได้ทดสอบกับ DB จริง** — ความถูกต้องของตัวเลขตรวจจากตรรกะ ไม่ใช่จากการรันกับ production
ตัวเลข "เร็วขึ้นเท่าไหร่" เป็นการประมาณจากระยะทางเครือข่าย ยังไม่ได้วัดของจริง
