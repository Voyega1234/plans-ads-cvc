# 🩹 Patch 2026-07-09 — Optimization Log: AI summary + กัน log spam

**ใช้กับ:** deployment ปัจจุบันบน `plans-ads-cvc` (เวอร์ชันจาก zip 2026-07-07)
**วิธีติดตั้ง:** วางทับ 3 ไฟล์ตาม path เดิม → commit → redeploy (ไม่มี dependency/env/schema ใหม่)

## ไฟล์ที่แก้ (3 ไฟล์)
| ไฟล์ | แก้อะไร |
|---|---|
| `src/app/api/optimization-log/route.ts` | รวมรายการซ้ำเป็นแถวเดียว ×N (bulk asset 1,900 แถว → ไม่กี่แถว) + ASSET เป็น Low impact |
| `src/app/api/optimization-log/ai/route.ts` | **fix หลัก:** AI ตอบ free-text แล้วระบบเคย reject ทิ้ง → รับทุกรูปแบบ (สรุปยาวมีเนื้อหาจริงแล้ว) + สรุปใช้ digest ตัวเลขรวมแทนบรรทัดดิบ + ถ้า AI ล่มจริงขึ้นป้าย "⚠ AI ไม่พร้อมใช้งาน" ชัดเจน |
| `src/app/optimization-log/page.tsx` | แสดง badge ×N ที่รายการที่ถูก group |

## ตรวจรับหลัง deploy
1. เปิด Optimization Log → เลือก Villa Market → Last 30 Days → แถวลดจาก 2,000 เหลือ ~125 พร้อม ×N
2. กด "สรุปใหม่" → ได้สรุปยาวมีชื่อแคมเปญจริง (ไม่ใช่ประโยคสั้นเดิม)
3. ⚠ ถ้ายังเห็น "AI ไม่พร้อมใช้งาน" = env AI บน Vercel ไม่ครบ → เช็ค `GEMINI_API_KEY` (หรือ OIDC `GCP_*` 5 ตัว) + `MOCK_AI=false`
