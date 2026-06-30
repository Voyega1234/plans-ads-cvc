# Plans Ads — Vercel Deployment Guide (V1)

คู่มือนี้ครอบคลุมทุกขั้นตอนสำหรับทีม Dev ในการ Deploy ขึ้น Vercel Production

---

## สิ่งที่ต้องเตรียมก่อน

| รายการ                      | หมายเหตุ                              |
| --------------------------- | ------------------------------------- |
| Node.js ≥ 18                | local machine                         |
| Turso account               | https://turso.tech (free tier ใช้ได้) |
| Google Cloud Console access | เพื่อเพิ่ม domain ใน OAuth            |
| Vercel account              | https://vercel.com                    |
| GitHub repository           | push code ขึ้นก่อน deploy             |

---

## ขั้นตอนที่ 1 — Push Code ขึ้น GitHub

```bash
cd /Users/bob/plans-ads

git init                               # ถ้ายังไม่มี git repo
git add .
git commit -m "V1 initial deploy"
git remote add origin https://github.com/YOUR_ORG/plans-ads.git
git push -u origin main
```

> **หมายเหตุ**: ตรวจสอบว่า `.gitignore` มี `.env.local` และ `prisma/dev.db` อยู่แล้ว

---

## ขั้นตอนที่ 2 — ติดตั้ง Turso (แทน SQLite บน Vercel)

Vercel เป็น serverless — ไม่มี persistent filesystem ดังนั้น SQLite ใช้บน production ไม่ได้ ต้องใช้ **Turso** (LibSQL cloud)

### 2.1 ติดตั้ง Turso CLI และสร้าง Database

```bash
# ติดตั้ง Turso CLI
brew install tursodatabase/tap/turso

# Login (เปิด browser)
turso auth login

# สร้าง database
turso db create plans-ads-v1

# ดู connection URL
turso db show plans-ads-v1 --url
# ผลลัพธ์: libsql://plans-ads-v1-xxxxxxxx.turso.io

# สร้าง auth token
turso db tokens create plans-ads-v1
# ผลลัพธ์: eyJhbGciOiJFZERTQSJ9...
```

จดค่าสองอย่างนี้ไว้:

- **DB URL**: `libsql://plans-ads-v1-xxxxxxxx.turso.io`
- **Token**: `eyJhbGciOiJFZERTQSJ9...`

### 2.2 ติดตั้ง libsql adapter ใน Project

```bash
cd /Users/bob/plans-ads
npm install @prisma/adapter-libsql @libsql/client
```

### 2.3 แก้ `prisma/schema.prisma` เพิ่ม adapter

เปิดไฟล์ `prisma/schema.prisma` แก้ส่วน `generator` และ `datasource`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

### 2.4 แก้ `src/lib/prisma.ts` ให้รองรับ Turso

เปิดไฟล์ `src/lib/prisma.ts` แก้เป็น:

```typescript
import { PrismaClient } from '@prisma/client'

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? ''

  if (url.startsWith('libsql://') || url.startsWith('file:')) {
    if (url.startsWith('libsql://')) {
      // Production: Turso
      const { createClient } = require('@libsql/client')
      const { PrismaLibSQL } = require('@prisma/adapter-libsql')

      const urlOnly = url.split('?')[0]
      const token = url.split('authToken=')[1]
      const libsql = createClient({ url: urlOnly, authToken: token })
      const adapter = new PrismaLibSQL(libsql)
      return new PrismaClient({ adapter })
    }
  }

  // Local: SQLite
  return new PrismaClient()
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### 2.5 Push Schema ขึ้น Turso

```bash
# ตั้ง DATABASE_URL ชั่วคราวชี้ไป Turso แล้ว push schema
DATABASE_URL="libsql://plans-ads-v1-xxxxxxxx.turso.io?authToken=eyJ..." \
  npx prisma db push
```

ถ้า success: `Your database is now in sync with your Prisma schema.`

### 2.6 (Optional) Migrate ข้อมูลจาก SQLite มา Turso

```bash
# Export ข้อมูลจาก local SQLite
sqlite3 prisma/dev.db .dump > /tmp/plans-ads-dump.sql

# Import เข้า Turso
turso db shell plans-ads-v1 < /tmp/plans-ads-dump.sql
```

---

## ขั้นตอนที่ 3 — ตั้งค่า Google OAuth สำหรับ Domain ใหม่

**ต้องทำก่อน** ไม่งั้น Google Login จะขึ้น Error 400

1. เปิด [console.cloud.google.com](https://console.cloud.google.com)
2. เลือก Project ที่ใช้อยู่
3. ไปที่ **APIs & Services → Credentials**
4. คลิก OAuth 2.0 Client ID (Web application)
5. เพิ่มใน **Authorized JavaScript origins**:
   ```
   https://your-app.vercel.app
   ```
6. เพิ่มใน **Authorized redirect URIs**:
   ```
   https://your-app.vercel.app/api/auth/callback/google
   ```
7. กด **Save** รอประมาณ 5 นาที

> ของเดิมที่มี (localhost) **ห้ามลบ** ไม่งั้น local dev จะใช้ไม่ได้

---

## ขั้นตอนที่ 4 — สร้าง Vercel Project

1. ไปที่ [vercel.com](https://vercel.com) → **Add New Project**
2. Import repository จาก GitHub
3. Framework: **Next.js** (auto-detect)
4. Root Directory: ปล่อยว่าง (root ของ repo)
5. **อย่ากด Deploy ก่อน** — ตั้ง Environment Variables ก่อนในขั้นตอนถัดไป

---

## ขั้นตอนที่ 5 — ตั้ง Environment Variables บน Vercel

ไปที่ **Settings → Environment Variables** เพิ่มตัวแปรด้านล่างทีละตัว

> เลือก Environment: **Production** (และ Preview ถ้าต้องการ)

### Auth

| Key               | Value                                              |
| ----------------- | -------------------------------------------------- |
| `NEXTAUTH_URL`    | `https://your-app.vercel.app`                      |
| `NEXTAUTH_SECRET` | รันคำสั่ง `openssl rand -base64 32` แล้วเอาผลมาใส่ |

### Database (Turso)

| Key            | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| `DATABASE_URL` | `libsql://plans-ads-v1-xxxxxxxx.turso.io?authToken=eyJ...` |

> URL + Token รวมกันใน `DATABASE_URL` เดียว — Prisma จัดการเองอัตโนมัติ

### Google OAuth (Login)

| Key                    | Value                                  |
| ---------------------- | -------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Client ID จาก Google Cloud Console     |
| `GOOGLE_CLIENT_SECRET` | Client Secret จาก Google Cloud Console |

### AI

| Key                                      | Value                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                         | Google Cloud project id ที่เปิด Vertex AI                               |
| `GCP_PROJECT_NUMBER`                     | Google Cloud project number                                             |
| `GCP_SERVICE_ACCOUNT_EMAIL`              | Service Account ที่ให้ Vercel impersonate เพื่อเรียก Vertex AI          |
| `GCP_WORKLOAD_IDENTITY_POOL_ID`          | Workload Identity Pool ID                                               |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Workload Identity Pool Provider ID สำหรับ Vercel OIDC                   |
| `GCP_VERTEX_LOCATION`                    | Vertex AI location เช่น `us-central1` (optional; default `us-central1`) |
| `ANTHROPIC_API_KEY`                      | API Key จาก console.anthropic.com                                       |
| `OPENAI_API_KEY`                         | (optional)                                                              |
| `AI_MODEL_QUALITY`                       | `gemini-3.5-flash`                                                      |
| `AI_MODEL_STANDARD`                      | `gemini-3.5-flash`                                                      |
| `MOCK_AI`                                | `false`                                                                 |

> AI Gemini ใช้ Vercel OIDC + Google Cloud Workload Identity Federation แล้ว ไม่ต้องตั้งค่า `GEMINI_API_KEY`

### Google Ads

| Key                            | Value                                       |
| ------------------------------ | ------------------------------------------- |
| `MOCK_GOOGLE_ADS`              | `false`                                     |
| `AUTOMATION_MUTATE`            | `false`                                     |
| `GOOGLE_ADS_DEVELOPER_TOKEN`   | จาก Google Ads Manager → Tools → API Center |
| `GOOGLE_ADS_CLIENT_ID`         | ใช้ค่าเดียวกับ `GOOGLE_CLIENT_ID`           |
| `GOOGLE_ADS_CLIENT_SECRET`     | ใช้ค่าเดียวกับ `GOOGLE_CLIENT_SECRET`       |
| `GOOGLE_ADS_REFRESH_TOKEN`     | ดูวิธีสร้างด้านล่าง (ข้อ 3 ของ Appendix)    |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | MCC ID ไม่มี dash เช่น `6140243864`         |
| `GOOGLE_ADS_CUSTOMER_ID`       | Sub-account IDs คั่นด้วย comma              |
| `COMPANY_MCC_CUSTOMER_ID`      | ค่าเดียวกับ `GOOGLE_ADS_LOGIN_CUSTOMER_ID`  |

### GA4

| Key               | Value                                         |
| ----------------- | --------------------------------------------- |
| `GA4_PROPERTY_ID` | Property ID จาก GA4 Admin → Property Settings |

### GTM

| Key                               | Value                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| `GTM_ACCOUNT_ID`                  | GTM Account ID                                                       |
| `GTM_CONTAINER_ID`                | GTM Container ID                                                     |
| `GTM_SERVICE_ACCOUNT_EMAIL`       | Service Account email ที่มี GTM Read access                          |
| `GTM_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key จาก Service Account JSON (ต้องแทน newline จริงด้วย `\n`) |

### Google Sheets / Drive

| Key                          | Value                                       |
| ---------------------------- | ------------------------------------------- |
| `GOOGLE_SHEETS_ENABLED`      | `true`                                      |
| `GOOGLE_DRIVE_ENABLED`       | `true`                                      |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | Service Account email                       |
| `GOOGLE_SHEETS_PRIVATE_KEY`  | Private key (ต้องแทน newline จริงด้วย `\n`) |
| `GOOGLE_DRIVE_FOLDER_ID`     | Google Drive Folder ID                      |

> **เรื่อง Private Key**: เวลา copy ค่า private_key จาก JSON file มาใส่ใน Vercel ต้องแน่ใจว่า `\n` อยู่ในบรรทัดเดียว ไม่ใช่ enter จริง Vercel จะจัดการให้ถ้า paste ตรงๆ

---

## ขั้นตอนที่ 6 — Deploy

1. กลับไปที่ Vercel Project → **Deployments**
2. กด **Deploy** (หรือ push commit ใหม่ขึ้น main)
3. Vercel จะรัน: `prisma generate && next build` (ตาม vercel.json)
4. รอประมาณ 3–5 นาที

---

## ขั้นตอนที่ 7 — Post-Deploy Checklist

ทดสอบตามลำดับหลัง deploy เสร็จ:

- [ ] เปิด `https://your-app.vercel.app` — หน้า Login ขึ้น
- [ ] Login ด้วย Google account ที่ได้รับอนุญาต — เข้าได้
- [ ] Login ด้วย account อื่น — ถูก redirect ออก (ระบบจำกัดแค่ admin emails)
- [ ] หน้า Dashboard โหลดข้อมูล Google Ads ได้
- [ ] สร้าง Media Plan ใหม่ → บันทึกได้ (Turso ทำงาน)
- [ ] Campaign Templates → generate keyword/ad copy ได้ (AI ทำงาน)
- [ ] Push campaign → สร้างสำเร็จใน Google Ads สถานะ PAUSED
- [ ] หน้า /push-logs → เห็น log ที่เพิ่งสร้าง
- [ ] Admin login → เห็น Track Cost tab ใน /push-logs

---

## ขั้นตอนที่ 8 — อัปเดต Production ในอนาคต

```bash
git add .
git commit -m "feat: description of change"
git push origin main
```

Vercel auto-deploy ทุกครั้งที่ push ขึ้น `main`

ถ้าแก้ Prisma schema ต้องรัน:

```bash
DATABASE_URL="libsql://plans-ads-v1-xxxxxxxx.turso.io?authToken=eyJ..." \
  npx prisma db push
```

---

## ข้อจำกัดที่มีบน Vercel

| รายการ                            | สถานะ                       | วิธีแก้                                       |
| --------------------------------- | --------------------------- | --------------------------------------------- |
| Image upload (`/public/uploads/`) | ไม่ persistent บน Vercel    | ใช้ Vercel Blob หรือ Cloudinary — ดู Appendix |
| AI timeout สูง                    | ตั้งไว้ 300s ใน vercel.json | ถ้า timeout บ่อยให้ลด scope prompt            |
| SQLite                            | ใช้ได้แค่ local             | ใช้ Turso บน production (ทำแล้วในขั้นตอน 2)   |

---

## Appendix

### A. สร้าง Google Ads Refresh Token

```bash
# เปิด URL นี้ใน browser (แทน CLIENT_ID ด้วยค่าจริง)
https://accounts.google.com/o/oauth2/auth?client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/adwords&response_type=code&access_type=offline&prompt=consent

# รับ authorization code แล้วแลกเป็น refresh token
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=AUTH_CODE" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code"

# จาก response ให้เอาค่า refresh_token มาใส่ GOOGLE_ADS_REFRESH_TOKEN
```

### B. Vercel Blob สำหรับ Image Upload (Optional)

ถ้าต้องการให้รูปที่ upload ใน Ad Copy step เก็บถาวรบน production:

```bash
npm install @vercel/blob
```

ตั้ง Environment Variable บน Vercel:

- `BLOB_READ_WRITE_TOKEN` — สร้างได้ที่ Vercel → Storage → Create Blob Store

แก้ `/src/app/api/upload/image/route.ts` ให้ใช้ `@vercel/blob` แทนการเขียนไฟล์ local

### C. Local Dev ยังใช้ได้ปกติ

```bash
cd /Users/bob/plans-ads
npm run dev
# เปิดที่ http://localhost:3010
```

Local ใช้ SQLite (`DATABASE_URL=file:./prisma/dev.db`) — Turso ถูกใช้เฉพาะเมื่อ URL ขึ้นต้นด้วย `libsql://`

---

## Appendix D — Google Cloud Console: สิ่งที่ต้องแก้เมื่อ Deploy

### D1. OAuth 2.0 Client ID (สำหรับ Login + Google Ads)

ไปที่: **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application)**

**Authorized JavaScript origins** — เพิ่มบรรทัดใหม่ (ห้ามลบของเดิม):

```
https://your-app.vercel.app
```

**Authorized redirect URIs** — เพิ่มบรรทัดใหม่ (ห้ามลบของเดิม):

```
https://your-app.vercel.app/api/auth/callback/google
```

ของเดิมที่ต้องยังอยู่:

```
http://localhost:3010
http://localhost:3010/api/auth/callback/google
```

> **ทำไมต้องมีทั้งคู่**: OAuth Client เดียวกันถูกใช้ทั้ง local dev และ production ถ้าลบ localhost จะ login local ไม่ได้

---

### D2. Google Ads API — APIs ที่ต้อง Enable

ไปที่: **Google Cloud Console → APIs & Services → Library** ค้นหาแล้ว Enable:

| API                           | ใช้สำหรับ                         |
| ----------------------------- | --------------------------------- |
| **Google Ads API**            | ดึง campaign data, สร้าง campaign |
| **Google Analytics Data API** | GA4 dashboard                     |
| **Tag Manager API**           | GTM integration                   |
| **Google Sheets API**         | Export reports                    |
| **Google Drive API**          | เก็บ report files                 |

Enable ได้ที่:

```
https://console.cloud.google.com/apis/library
```

---

### D3. Google Ads Developer Token

Developer Token ต้องมี **Standard Access** (ไม่ใช่ Test Account) เพื่อใช้กับ production accounts

วิธีตรวจสอบ:

1. Google Ads Manager (MCC) → Tools & Settings → Setup → **API Center**
2. ดูสถานะ: ต้องเป็น **Standard access** ไม่ใช่ **Test account**
3. ถ้ายังเป็น Test → กด Apply for Basic Access → รอ Google อนุมัติ (ปกติ 1-2 วันทำการ)

---

### D4. Google Ads Refresh Token — สร้างใหม่

Refresh Token ที่ใช้อยู่ในปัจจุบัน scope ครอบคลุม `https://www.googleapis.com/auth/adwords` แล้ว ใช้ได้ทั้ง local และ production **ไม่ต้องสร้างใหม่**

แต่ถ้า Token หมดอายุหรือ revoke ให้สร้างใหม่ด้วย:

```bash
# แทนค่า CLIENT_ID, CLIENT_SECRET ด้วยค่าจริง
# เปิด URL นี้ใน browser:
https://accounts.google.com/o/oauth2/auth\
?client_id=CLIENT_ID\
&redirect_uri=urn:ietf:wg:oauth:2.0:oob\
&scope=https://www.googleapis.com/auth/adwords\
&response_type=code\
&access_type=offline\
&prompt=consent

# รับ authorization_code แล้วแลกเป็น token:
curl -s -X POST https://oauth2.googleapis.com/token \
  -d "code=AUTHORIZATION_CODE" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code"

# Response JSON จะมี refresh_token → นำไปใส่ GOOGLE_ADS_REFRESH_TOKEN
```

---

### D5. Service Account สำหรับ Google Sheets / GTM

Service Account ที่ใช้อยู่แล้วสามารถใช้ต่อได้บน production ไม่ต้องสร้างใหม่

แต่ต้องตรวจสอบว่า Service Account มี access ถึง resources เหล่านี้:

- **Google Drive Folder**: Share folder กับ `SERVICE_ACCOUNT_EMAIL` (Editor)
- **Google Sheets**: Share sheet กับ `SERVICE_ACCOUNT_EMAIL` (Editor)
- **GTM Container**: GTM → Admin → User Management → เพิ่ม `SERVICE_ACCOUNT_EMAIL` (Read)

---

### D6. GA4 — ไม่ต้องตั้งค่าเพิ่ม

GA4 ใช้ OAuth token ของ user ที่ login (ไม่ใช่ service account) ดังนั้น:

- user ที่ login ต้องมี **Viewer** access ใน GA4 property
- `GA4_PROPERTY_ID` ใส่ตัวเลข property ID เดิมได้เลย ใช้ได้ทั้ง local และ production

---

## Appendix E — สรุป Google Console Checklist ก่อน Deploy

```
OAuth 2.0 Client ID:
  [ ] เพิ่ม https://your-app.vercel.app ใน Authorized JavaScript origins
  [ ] เพิ่ม https://your-app.vercel.app/api/auth/callback/google ใน Authorized redirect URIs
  [ ] ของเดิม (localhost:3010) ยังอยู่ครบ

APIs Enabled:
  [ ] Google Ads API
  [ ] Google Analytics Data API
  [ ] Tag Manager API
  [ ] Google Sheets API
  [ ] Google Drive API

Google Ads:
  [ ] Developer Token เป็น Standard Access (ไม่ใช่ Test)
  [ ] Refresh Token ยังใช้งานได้ (ทดสอบด้วย curl หรือ run local)
  [ ] MCC ID ถูกต้อง

Service Account:
  [ ] มี access ใน Google Drive Folder
  [ ] มี access ใน Google Sheets (ถ้าใช้)
  [ ] มี access ใน GTM (ถ้าใช้)

GA4:
  [ ] GA4_PROPERTY_ID ถูกต้อง
  [ ] User ที่จะ login มี Viewer access ใน GA4
```

---

_Plans Ads V1 — Convert Cake_
