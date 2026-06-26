import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({ briefId: z.string().min(1) })

export interface CampaignStructureItem {
  id:             string
  type:           'SEARCH' | 'DISPLAY' | 'PERFORMANCE_MAX' | 'SHOPPING' | 'YOUTUBE' | 'DEMAND_GEN' | 'APP_CAMPAIGN'
  theme?:         'Generic' | 'Brand' | 'Competitor' | 'Product' | 'Service' | 'Remarketing'
  name:           string   // CVC naming e.g. 'CVC - SEM | Generic | BizName | Lead'
  objective:      string   // role description
  recommendedPct: number   // % of total budget
  selected:       boolean  // default true
  researchDone:   boolean  // false on creation
}

// Mirrors MIX_BY_OBJECTIVE in /src/lib/ai/media-plan.ts — keep in sync
const MIX_BY_OBJECTIVE: Record<string, { type: string; role: string; theme?: string; pct: number }[]> = {
  LEADS: [
    { type: 'SEARCH',          theme: 'Generic',     role: 'High-intent generic keywords',                                                      pct: 18 },
    { type: 'SEARCH',          theme: 'Brand',       role: 'Protect brand terms',                                                               pct:  7 },
    { type: 'SEARCH',          theme: 'Competitor',  role: 'Capture competitor search traffic',                                                  pct:  7 },
    { type: 'PERFORMANCE_MAX', theme: undefined,     role: 'Automated AI bidding across all channels',                                          pct: 28 },
    { type: 'DISPLAY',         theme: 'Remarketing', role: 'Remarketing — แสดงโฆษณาซ้ำหา visitors ที่เคยเข้าเว็บ (ต่ำสุด 100 users/30วัน)', pct: 15 },
    { type: 'SEARCH',          theme: 'Product',     role: 'Product/service specific keywords',                                                  pct:  8 },
    { type: 'SEARCH',          theme: 'Service',     role: 'Service category & informational keywords',                                          pct:  7 },
    { type: 'DEMAND_GEN',      theme: undefined,     role: 'Social-style discovery ads on YouTube/Gmail/Discover',                              pct: 10 },
  ],
  SALES: [
    { type: 'SHOPPING',        theme: undefined,    role: 'Showcase products with price & image',     pct: 40 },
    { type: 'PERFORMANCE_MAX', theme: undefined,    role: 'Automated AI bidding across all channels', pct: 35 },
    { type: 'SEARCH',          theme: 'Generic',    role: 'Capture high-intent buyers',               pct: 15 },
    { type: 'SEARCH',          theme: 'Brand',      role: 'Protect brand terms',                      pct: 10 },
  ],
  AWARENESS: [
    { type: 'YOUTUBE',    theme: undefined, role: 'Brand video reach',                         pct: 40 },
    { type: 'DISPLAY',    theme: undefined, role: 'Visual brand awareness across GDN',         pct: 35 },
    { type: 'DEMAND_GEN', theme: undefined, role: 'Social-style discovery ads',                pct: 25 },
  ],
  TRAFFIC: [
    { type: 'SEARCH',          theme: 'Generic',     role: 'Capture high-intent search traffic',                                          pct: 22 },
    { type: 'SEARCH',          theme: 'Brand',       role: 'Protect brand terms',                                                         pct:  7 },
    { type: 'SEARCH',          theme: 'Competitor',  role: 'Capture competitor search traffic',                                            pct:  7 },
    { type: 'PERFORMANCE_MAX', theme: undefined,     role: 'Automated traffic across channels',                                            pct: 30 },
    { type: 'DISPLAY',         theme: 'Remarketing', role: 'Remarketing — แสดงโฆษณาซ้ำหา visitors ที่เคยเข้าเว็บ',                     pct: 12 },
    { type: 'SEARCH',          theme: 'Product',     role: 'Product/service specific keywords',                                            pct:  9 },
    { type: 'DEMAND_GEN',      theme: undefined,     role: 'Social-style discovery ads on YouTube/Gmail/Discover',                        pct: 13 },
  ],
  APP_INSTALLS: [
    { type: 'APP_CAMPAIGN', theme: undefined, role: 'Drive app installs across all channels', pct: 70 },
    { type: 'YOUTUBE',      theme: undefined, role: 'App promo video ads',                    pct: 30 },
  ],
}

const TYPE_LABEL: Record<string, string> = {
  SEARCH: 'SEM', PERFORMANCE_MAX: 'PMax', DISPLAY: 'GDN',
  SHOPPING: 'Shopping', YOUTUBE: 'YouTube', DEMAND_GEN: 'DemandGen',
  APP_CAMPAIGN: 'App',
}

const OBJ_LABEL: Record<string, string> = {
  LEADS: 'Lead', SALES: 'Sale', AWARENESS: 'Aware',
  TRAFFIC: 'Traffic', APP_INSTALLS: 'App',
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9ก-๙\s]/g, '').trim().slice(0, 25)
}

function buildStructure(objective: string, businessName: string): CampaignStructureItem[] {
  const mix      = MIX_BY_OBJECTIVE[objective] ?? MIX_BY_OBJECTIVE['LEADS']
  const objLabel = OBJ_LABEL[objective] ?? objective
  const bizSlug  = slugify(businessName)

  return mix.map((m, i) => {
    const tl    = TYPE_LABEL[m.type] ?? m.type
    const theme = m.theme ? ` | ${m.theme}` : ''
    const name  = `CVC - ${tl}${theme} | ${bizSlug} | ${objLabel}`
    const id    = `${m.type.toLowerCase()}${m.theme ? '-' + m.theme.toLowerCase() : ''}-${i}`

    return {
      id,
      type:           m.type as CampaignStructureItem['type'],
      theme:          m.theme as CampaignStructureItem['theme'],
      name,
      objective:      m.role,
      recommendedPct: m.pct,
      selected:       true,
      researchDone:   false,
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session  = skipAuth ? null : await auth()
    const userId   = skipAuth ? null : getUserId(session)

    const body    = await req.json()
    const { briefId } = schema.parse(body)

    const brief = await prisma.brief.findFirst({
      where: skipAuth
        ? { id: briefId }
        : { id: briefId, userId: userId ?? undefined },
    })
    if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

    const structure = buildStructure(brief.objective, brief.businessName)

    return NextResponse.json({ structure, objective: brief.objective, businessName: brief.businessName })
  } catch (err) {
    console.error('[campaign-structure/generate]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
