import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'
import { z } from 'zod'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

function adsHeaders(token: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

async function mutate(customerId: string, ops: unknown[], token: string) {
  const cid = customerId.replace(/-/g, '')
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ mutateOperations: ops }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Ads mutate failed (${res.status}): ${txt.slice(0, 3000)}`)
  }
  return res.json()
}

// ── Schema ─────────────────────────────────────────────────────────────────────
const baseSchema = z.object({
  customerId: z.string().min(1),
  action: z.enum(['add_pmax_asset_group', 'edit_text_ads', 'gdn_adgroup', 'gdn_image']),
})

const addPMaxSchema = baseSchema.extend({
  action: z.literal('add_pmax_asset_group'),
  campaignResourceName: z.string(),  // customers/xxx/campaigns/yyy
  assetGroupName: z.string(),
  finalUrl: z.string().url(),
  headlines: z.array(z.string().max(30)).min(3).max(15),
  longHeadlines: z.array(z.string().max(90)).min(1).max(5),
  descriptions: z.array(z.string().max(90)).min(2).max(4),
  businessName: z.string().max(25),
  imageResourceNames: z.array(z.string()).optional(),  // already-uploaded image asset resource names
})

const editTextAdsSchema = baseSchema.extend({
  action: z.literal('edit_text_ads'),
  adGroupAdResourceName: z.string(),  // customers/xxx/adGroupAds/yyy
  headlines: z.array(z.string().max(30)).min(3).max(15),
  descriptions: z.array(z.string().max(90)).min(2).max(4),
  finalUrl: z.string().url(),
})

const gdnAdGroupSchema = baseSchema.extend({
  action: z.literal('gdn_adgroup'),
  campaignResourceName: z.string(),
  adGroupName: z.string(),
  targeting: z.object({
    keywords: z.array(z.string()).optional(),
    placements: z.array(z.string()).optional(),
    audiences: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
  }).optional(),
  ads: z.array(z.object({
    headlines: z.array(z.string()).min(1).max(5),
    longHeadline: z.string().max(90),
    descriptions: z.array(z.string()).min(1).max(5),
    businessName: z.string().max(25),
    finalUrl: z.string().url(),
    imageResourceName: z.string().optional(),
    logoResourceName: z.string().optional(),
  })).min(1),
})

const gdnImageSchema = baseSchema.extend({
  action: z.literal('gdn_image'),
  adGroupAdResourceName: z.string(),
  imageResourceName: z.string(),   // already-uploaded image asset
  imageAssetType: z.enum(['MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'PORTRAIT_MARKETING_IMAGE']),
})

// ── Mock responses ─────────────────────────────────────────────────────────────
function mockResponse(action: string) {
  return NextResponse.json({
    success: true, mock: true, action,
    message: `[Mock] ${action} สำเร็จ — จะ push จริงเมื่อ MOCK_GOOGLE_ADS=false`,
    resourceName: `customers/mock/assetGroups/${Date.now()}`,
  })
}

// ── Handlers ───────────────────────────────────────────────────────────────────

async function handleAddPMaxAssetGroup(body: z.infer<typeof addPMaxSchema>, token: string) {
  const cid = body.customerId.replace(/-/g, '')

  // Build operations
  const ops: unknown[] = []

  // 1. Create asset group
  const agTmp = '-1'
  ops.push({
    assetGroupOperation: {
      create: {
        resourceName: `customers/${cid}/assetGroups/${agTmp}`,
        campaign: body.campaignResourceName,
        name: body.assetGroupName,
        finalUrls: [body.finalUrl],
        status: 'ENABLED',
      }
    }
  })

  // 2. Add text assets
  const textAssets: { text: string; fieldType: string; tmpId: string }[] = [
    ...body.headlines.map((h, i) => ({ text: h, fieldType: 'HEADLINE', tmpId: `h${i}` })),
    ...body.longHeadlines.map((h, i) => ({ text: h, fieldType: 'LONG_HEADLINE', tmpId: `lh${i}` })),
    ...body.descriptions.map((d, i) => ({ text: d, fieldType: 'DESCRIPTION', tmpId: `d${i}` })),
    [{ text: body.businessName, fieldType: 'BUSINESS_NAME', tmpId: 'bn' }][0],
  ]

  let assetTmp = -100
  for (const ta of textAssets) {
    const assetTmpId = assetTmp--
    ops.push({
      assetOperation: {
        create: {
          resourceName: `customers/${cid}/assets/${assetTmpId}`,
          textAsset: { text: ta.text },
        }
      }
    })
    ops.push({
      assetGroupAssetOperation: {
        create: {
          assetGroup: `customers/${cid}/assetGroups/${agTmp}`,
          asset: `customers/${cid}/assets/${assetTmpId}`,
          fieldType: ta.fieldType,
        }
      }
    })
  }

  // 3. Link image assets if provided
  if (body.imageResourceNames) {
    for (const imgRN of body.imageResourceNames) {
      // Determine field type from asset name convention or default to MARKETING_IMAGE
      const isSquare = imgRN.includes('square') || imgRN.includes('logo')
      ops.push({
        assetGroupAssetOperation: {
          create: {
            assetGroup: `customers/${cid}/assetGroups/${agTmp}`,
            asset: imgRN,
            fieldType: isSquare ? 'SQUARE_MARKETING_IMAGE' : 'MARKETING_IMAGE',
          }
        }
      })
    }
  }

  const result = await mutate(body.customerId, ops, token)
  return NextResponse.json({ success: true, action: 'add_pmax_asset_group', result })
}

async function handleEditTextAds(body: z.infer<typeof editTextAdsSchema>, token: string) {
  const cid = body.customerId.replace(/-/g, '')
  const assetTmp = -200

  const ops: unknown[] = []

  // Create new responsive search ad assets and update
  const headlineOps = body.headlines.map((h, i) => ({
    assetOperation: {
      create: {
        resourceName: `customers/${cid}/assets/${assetTmp - i}`,
        textAsset: { text: h },
      }
    }
  }))
  ops.push(...headlineOps)

  // Update ad with new headlines/descriptions via UPDATE operation
  // For RSA, we use adGroupAd UPDATE with responsiveSearchAd field
  ops.push({
    adGroupAdOperation: {
      updateMask: 'ad.responsiveSearchAd.headlines,ad.responsiveSearchAd.descriptions,ad.finalUrls',
      update: {
        resourceName: body.adGroupAdResourceName,
        ad: {
          finalUrls: [body.finalUrl],
          responsiveSearchAd: {
            headlines: body.headlines.map(h => ({ text: h })),
            descriptions: body.descriptions.map(d => ({ text: d })),
          },
        },
      },
    },
  })

  const result = await mutate(body.customerId, ops, token)
  return NextResponse.json({ success: true, action: 'edit_text_ads', result })
}

async function handleGdnAdGroup(body: z.infer<typeof gdnAdGroupSchema>, token: string) {
  const cid = body.customerId.replace(/-/g, '')
  const ops: unknown[] = []

  // Create ad group
  const agTmp = '-300'
  ops.push({
    adGroupOperation: {
      create: {
        resourceName: `customers/${cid}/adGroups/${agTmp}`,
        name: body.adGroupName,
        campaign: body.campaignResourceName,
        status: 'ENABLED',
      }
    }
  })

  // Create responsive display ad
  for (let i = 0; i < body.ads.length; i++) {
    const ad = body.ads[i]
    ops.push({
      adGroupAdOperation: {
        create: {
          adGroup: `customers/${cid}/adGroups/${agTmp}`,
          status: 'ENABLED',
          ad: {
            finalUrls: [ad.finalUrl],
            responsiveDisplayAd: {
              headlines: ad.headlines.map(h => ({ text: h })),
              longHeadline: { text: ad.longHeadline },
              descriptions: ad.descriptions.map(d => ({ text: d })),
              businessName: ad.businessName,
              ...(ad.imageResourceName ? { marketingImages: [{ asset: ad.imageResourceName }] } : {}),
              ...(ad.logoResourceName ? { logoImages: [{ asset: ad.logoResourceName }] } : {}),
            },
          },
        }
      }
    })
  }

  // Add targeting if specified
  if (body.targeting?.keywords) {
    for (const kw of body.targeting.keywords) {
      ops.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: `customers/${cid}/adGroups/${agTmp}`,
            keyword: { text: kw, matchType: 'BROAD' },
          }
        }
      })
    }
  }

  if (body.targeting?.placements) {
    for (const placement of body.targeting.placements) {
      ops.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: `customers/${cid}/adGroups/${agTmp}`,
            placement: { url: placement },
          }
        }
      })
    }
  }

  const result = await mutate(body.customerId, ops, token)
  return NextResponse.json({ success: true, action: 'gdn_adgroup', result })
}

async function handleGdnImage(body: z.infer<typeof gdnImageSchema>, token: string) {
  // Update image in existing responsive display ad
  // This requires knowing which asset group / ad group to update
  // We update via assetGroupAsset or adGroupAd UPDATE operation
  const ops = [{
    adGroupAdOperation: {
      updateMask: 'ad.responsiveDisplayAd.marketingImages',
      update: {
        resourceName: body.adGroupAdResourceName,
        ad: {
          responsiveDisplayAd: {
            marketingImages: [{ asset: body.imageResourceName }],
          },
        },
      },
    },
  }]
  const result = await mutate(body.customerId, ops, token)
  return NextResponse.json({ success: true, action: 'gdn_image', result })
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = baseSchema.parse(body)

    if (isMockMode()) return mockResponse(action)

    const token = await getGoogleAdsAccessToken()
    if (!token) return NextResponse.json({ error: 'No Google Ads access token' }, { status: 401 })

    switch (action) {
      case 'add_pmax_asset_group':
        return handleAddPMaxAssetGroup(addPMaxSchema.parse(body), token)
      case 'edit_text_ads':
        return handleEditTextAds(editTextAdsSchema.parse(body), token)
      case 'gdn_adgroup':
        return handleGdnAdGroup(gdnAdGroupSchema.parse(body), token)
      case 'gdn_image':
        return handleGdnImage(gdnImageSchema.parse(body), token)
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[campaign-adjustments]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed',
    }, { status: 500 })
  }
}
