/**
 * Audience management API
 * GET  /api/audiences?customerId=xxx  → list remarketing audiences
 * POST /api/audiences                 → create new remarketing user list
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'
import { z } from 'zod'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

function adsHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

async function gaqlQuery(customerId: string, query: string, token: string) {
  const cid = customerId.replace(/-/g, '')
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ query }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GAQL failed (${res.status}): ${txt.slice(0, 2000)}`)
  }
  const chunks = await res.json() as Array<{ results?: unknown[] }>
  return chunks.flatMap(c => c.results ?? [])
}

async function mutate(customerId: string, ops: unknown[], token: string) {
  const cid = customerId.replace(/-/g, '')
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ mutateOperations: ops }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Mutate failed (${res.status}): ${txt.slice(0, 2000)}`)
  }
  return res.json()
}

// ── Mock data ──────────────────────────────────────────────────────────────────
const MOCK_AUDIENCES = [
  { id: 'rl1', resourceName: 'customers/5482007847/userLists/rl1', name: 'All Website Visitors (30d)', membershipLifeSpan: 30, type: 'WEBSITE_VISITOR', memberCount: 2450 },
  { id: 'rl2', resourceName: 'customers/5482007847/userLists/rl2', name: 'All Website Visitors (90d)', membershipLifeSpan: 90, type: 'WEBSITE_VISITOR', memberCount: 8100 },
  { id: 'rl3', resourceName: 'customers/5482007847/userLists/rl3', name: 'Converted Visitors (90d)', membershipLifeSpan: 90, type: 'WEBSITE_VISITOR', memberCount: 320 },
]

// ── GET: List audiences ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  if (isMockMode()) {
    return NextResponse.json({ audiences: MOCK_AUDIENCES })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

    const query = `
      SELECT
        user_list.id,
        user_list.resource_name,
        user_list.name,
        user_list.type,
        user_list.membership_life_span,
        user_list.size_for_display
      FROM user_list
      ORDER BY user_list.name
      LIMIT 100
    `
    type Row = {
      userList: {
        id: string; resourceName: string; name: string; type: string
        membershipLifeSpan: string; sizeForDisplay: string
      }
    }
    const rows = await gaqlQuery(customerId, query, token) as Row[]
    const audiences = rows.map(r => ({
      id: r.userList.id,
      resourceName: r.userList.resourceName,
      name: r.userList.name,
      type: r.userList.type,
      membershipLifeSpan: parseInt(r.userList.membershipLifeSpan ?? '30'),
      memberCount: parseInt(r.userList.sizeForDisplay ?? '0'),
    }))

    return NextResponse.json({ audiences })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

// ── POST: Create remarketing audience ─────────────────────────────────────────
const createSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1).max(255),
  membershipLifeSpan: z.number().int().min(1).max(540).default(30),
  description: z.string().optional(),
  // Rule: page URL contains these strings
  urlContains: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json())

    if (isMockMode()) {
      return NextResponse.json({
        success: true, mock: true,
        audience: {
          id: `mock-${Date.now()}`,
          resourceName: `customers/${body.customerId}/userLists/mock-${Date.now()}`,
          name: body.name,
          membershipLifeSpan: body.membershipLifeSpan,
          type: 'WEBSITE_VISITOR',
          memberCount: 0,
        },
        message: `[Mock] สร้าง audience "${body.name}" สำเร็จ — จะทำงานจริงเมื่อ MOCK_GOOGLE_ADS=false`,
      })
    }

    const token = await getGoogleAdsAccessToken()
    if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

    const cid = body.customerId.replace(/-/g, '')

    // Use simple expression-based rule (URL contains nothing = all pages)
    const urlContains = body.urlContains ?? []

    const ruleItemGroups = urlContains.length > 0
      ? [{
          ruleItems: urlContains.map(url => ({
            name: `url_contains_${url.replace(/[^a-z0-9]/gi, '_')}`,
            urlRuleItem: { operator: 'CONTAINS', value: url },
          }))
        }]
      : [{
          ruleItems: [{
            name: 'all_pages',
            urlRuleItem: { operator: 'CONTAINS', value: '/' },
          }]
        }]

    // Website visitor lists must be created via Google tag / GA4 import in Google Ads UI.
    // Via API, we can only create CRM-based (customer match) lists.
    // For tag-based lists, return instructions instead of trying to create via API.
    return NextResponse.json({
      success: false,
      requiresManual: true,
      message: 'Website visitor audiences ต้องสร้างผ่าน Google Ads UI',
      instructions: [
        '1. ไปที่ Google Ads → Tools & Settings → Shared Library → Audience Manager',
        '2. คลิก + → Website Visitors',
        `3. ตั้งชื่อ "${body.name}"`,
        `4. เลือก "Visited a page with a URL containing" → ใส่ URL เว็บ`,
        `5. ตั้ง Membership duration: ${body.membershipLifeSpan} days`,
        '6. บันทึก — ระบบจะเริ่มสะสม visitors ภายใน 24-48 ชั่วโมง (ต้องมี Google tag ติดบนเว็บ)',
      ],
      googleAdsUrl: `https://ads.google.com/aw/audiences/userlistmanager?ocid=${cid}`,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
