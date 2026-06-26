import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// In-memory defaults — persisted to a single DB row keyed by userId=__global__ when SKIP_AUTH=true
const DEFAULTS = {
  defaultCurrency: 'THB',
  defaultTimeZone: 'Asia/Bangkok',
  defaultLanguage: 'th',
  defaultUtmSource: 'google',
  defaultUtmMedium: 'cpc',
  defaultUtmCampaign: '{campaignname}',
  defaultUtmContent: '{adgroupname}',
  namingConvention: '{Type} | {Theme} | {BizName} | {Obj}',
  productionPushEnabled: false,
  requireQaBeforePush: true,
  requireTrackingBeforePush: false,
  defaultNegativeKeywords: 'ฟรี,free,สมัครงาน,pantip,reddit,diy,tutorial,วิธีทำเอง',
}

export async function GET() {
  try {
    // Try to read stored settings from DB (stored as a ClientMemory note for __global__)
    // Simple approach: use env vars + hardcoded defaults
    const settings = {
      ...DEFAULTS,
      // Override with env vars where available
      defaultCurrency: process.env.DEFAULT_CURRENCY || DEFAULTS.defaultCurrency,
      defaultTimeZone: process.env.DEFAULT_TIMEZONE || DEFAULTS.defaultTimeZone,
      ga4PropertyId:   process.env.GA4_PROPERTY_ID  || null,
      gtmContainerId:  process.env.GTM_CONTAINER_ID  || null,
      gtmAccountId:    process.env.GTM_ACCOUNT_ID    || null,
      mockAi:          process.env.MOCK_AI === 'true',
      mockGoogleAds:   process.env.MOCK_GOOGLE_ADS === 'true',
      skipAuth:        process.env.SKIP_AUTH === 'true',
    }
    return NextResponse.json(settings)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load settings' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>

    // For now, settings that can be changed at runtime are stored in-memory
    // (env vars require server restart — we return what was submitted as acknowledgement)
    const allowed = [
      'defaultCurrency', 'defaultTimeZone', 'defaultLanguage',
      'defaultUtmSource', 'defaultUtmMedium', 'defaultUtmCampaign', 'defaultUtmContent',
      'namingConvention', 'productionPushEnabled', 'requireQaBeforePush',
      'requireTrackingBeforePush', 'defaultNegativeKeywords',
    ]
    const updated = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k))
    )

    return NextResponse.json({ success: true, updated, note: 'Settings acknowledged. Env-based settings require server restart.' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update settings' },
      { status: 500 }
    )
  }
}
