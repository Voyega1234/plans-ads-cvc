import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// Month-to-date spend per account — feeds the Monthly Budget Progress section
// on the morning-brief page. One GAQL per account (customer-level metrics,
// segments.date DURING THIS_MONTH), fetched in parallel.
//
// Monthly budgets live in the shared DB (table "AccountMonthlyBudget") so the
// whole team sees the same numbers. The table is created on first use with
// CREATE TABLE IF NOT EXISTS through the app's own connection — no Prisma
// schema change, no migration step.

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface AccountSpendMTD {
  customerId: string
  /** Month-to-date spend in account currency (บาท). */
  spendMTD: number
  /** Monthly budget (บาท) from the shared DB — 0 when not set yet. */
  budget: number
  error?: string
}

let budgetTableReady = false
async function ensureBudgetTable() {
  if (budgetTableReady) return
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "AccountMonthlyBudget" (
       customer_id text PRIMARY KEY,
       budget_baht double precision NOT NULL,
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
  budgetTableReady = true
}

async function loadBudgets(): Promise<Map<string, number>> {
  await ensureBudgetTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ customer_id: string; budget_baht: number }>>(
    `SELECT customer_id, budget_baht FROM "AccountMonthlyBudget"`
  )
  return new Map(rows.map(r => [r.customer_id, Number(r.budget_baht)]))
}

async function fetchSpendMTD(customerId: string, token: string): Promise<AccountSpendMTD> {
  const cid = customerId.replace(/-/g, '')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) headers['login-customer-id'] = LOGIN_CID

  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `SELECT metrics.cost_micros, segments.date FROM customer WHERE segments.date DURING THIS_MONTH`,
        }),
        signal: AbortSignal.timeout(20_000),
      }
    )
    if (!res.ok) {
      const txt = await res.text()
      return { customerId, spendMTD: 0, budget: 0, error: `HTTP ${res.status}: ${txt.slice(0, 150)}` }
    }
    const data = await res.json() as Array<{ results?: Array<{ metrics?: { costMicros?: string } }> }>
    let micros = 0
    for (const batch of data) {
      for (const row of batch.results ?? []) micros += Number(row.metrics?.costMicros ?? 0)
    }
    return { customerId, spendMTD: micros / 1_000_000, budget: 0 }
  } catch (err) {
    return { customerId, spendMTD: 0, budget: 0, error: err instanceof Error ? err.message : 'fetch failed' }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('customerIds') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'customerIds is required' }, { status: 400 })
  }
  if (ids.length > 50) {
    return NextResponse.json({ error: 'สูงสุด 50 accounts ต่อครั้ง' }, { status: 400 })
  }
  try {
    const token = await getGoogleAdsAccessToken()
    const [accounts, budgets] = await Promise.all([
      Promise.all(ids.map(id => fetchSpendMTD(id, token))),
      loadBudgets().catch(() => new Map<string, number>()),
    ])
    for (const a of accounts) {
      a.budget = budgets.get(a.customerId) ?? budgets.get(a.customerId.replace(/-/g, '')) ?? 0
    }
    return NextResponse.json({ accounts })
  } catch (err) {
    console.error('[morning-brief/monthly-budget GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

/** Save an account's monthly budget (shared for the whole team via DB). */
export async function PUT(req: NextRequest) {
  let body: { customerId?: string; budgetBaht?: number }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const customerId = (body.customerId ?? '').trim()
  const budgetBaht = Number(body.budgetBaht)
  if (!customerId || !isFinite(budgetBaht) || budgetBaht <= 0) {
    return NextResponse.json({ error: 'customerId และ budgetBaht (> 0) จำเป็น' }, { status: 400 })
  }
  try {
    await ensureBudgetTable()
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AccountMonthlyBudget" (customer_id, budget_baht, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (customer_id) DO UPDATE SET budget_baht = $2, updated_at = now()`,
      customerId,
      budgetBaht
    )
    return NextResponse.json({ ok: true, customerId, budgetBaht })
  } catch (err) {
    console.error('[morning-brief/monthly-budget PUT]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
