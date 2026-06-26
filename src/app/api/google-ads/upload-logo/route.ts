import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MB = 5

function getAdsConfig() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId =
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ??
    process.env.COMPANY_MCC_CUSTOMER_ID ??
    ''
  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not set.')
  return { developerToken, loginCustomerId }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const customerId = (formData.get('customerId') as string | null)?.replace(/-/g, '') ?? ''

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, WebP' }, { status: 400 })
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `ไฟล์ใหญ่เกินไป (max ${MAX_MB}MB)` }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const accessToken = await getGoogleAdsAccessToken()
    const { developerToken, loginCustomerId } = getAdsConfig()

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const assetName = file.name.replace(/\.[^.]+$/, '').slice(0, 50) || 'logo'

    const body = {
      mutateOperations: [
        {
          assetOperation: {
            create: {
              name: `${assetName}_${Date.now()}`,
              imageAsset: {
                data: base64,
              },
            },
          },
        },
      ],
    }

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:mutate`,
      { method: 'POST', headers, body: JSON.stringify(body) }
    )

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Google Ads API error: ${err.slice(0, 500)}` }, { status: 400 })
    }

    const data = await res.json() as {
      mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }>
    }
    const resourceName = data.mutateOperationResponses?.[0]?.assetResult?.resourceName ?? ''

    return NextResponse.json({ resourceName })
  } catch (err) {
    console.error('[upload-logo]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
