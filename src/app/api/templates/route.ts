import { NextRequest, NextResponse } from 'next/server'
import { CAMPAIGN_TEMPLATES } from '@/lib/templates/campaign-templates'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const objective  = searchParams.get('objective')  // LEADS | SALES | AWARENESS | TRAFFIC | APP_INSTALLS
  const type       = searchParams.get('type')        // SEARCH | DISPLAY | PERFORMANCE_MAX | ...
  const difficulty = searchParams.get('difficulty')  // beginner | intermediate | advanced
  const search     = searchParams.get('q')           // free text search

  let results = CAMPAIGN_TEMPLATES

  if (objective) {
    results = results.filter(t => t.defaults.objective === objective)
  }
  if (type) {
    results = results.filter(t => t.type === type)
  }
  if (difficulty) {
    results = results.filter(t => t.difficulty === difficulty)
  }
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.bestFor.some(b => b.toLowerCase().includes(q))
    )
  }

  return NextResponse.json({
    templates: results,
    total: results.length,
    filters: {
      objectives: ['LEADS', 'SALES', 'AWARENESS', 'TRAFFIC', 'APP_INSTALLS'],
      types: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX', 'SHOPPING', 'YOUTUBE', 'DEMAND_GEN', 'APP_CAMPAIGN'],
      difficulties: ['beginner', 'intermediate', 'advanced'],
    },
  })
}
