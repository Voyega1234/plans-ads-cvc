import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// Sitelink / Callout extensions (Google Ads "assets") attached at campaign level.
// Add = create the asset AND link it to the campaign in ONE atomic googleAds:mutate
// request using a temp resource name — no orphan assets if the link step fails.
// Remove = unlink the campaign_asset (the asset stays in the account library,
// which is how Google Ads UI behaves too).

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface ExtensionRow {
  campaignAssetResourceName: string
  assetResourceName: string
  fieldType: 'SITELINK' | 'CALLOUT'
  // sitelink
  linkText?: string
  description1?: string
  description2?: string
  finalUrl?: string
  // callout
  calloutText?: string
}

function headersFor(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const campaignResourceName = searchParams.get('campaignResourceName') ?? ''
  if (!customerId || !campaignResourceName) {
    return NextResponse.json({ error: 'customerId and campaignResourceName are required' }, { status: 400 })
  }
  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const safeRn = campaignResourceName.replace(/'/g, "\\'")

    // ── ทำไมของเดิมพัง และทำไมรอบนี้ถึงไม่พังอีก ─────────────────────────────
    // ของเดิมเป็น query เดียวที่ทั้ง (ก) กรองด้วย campaign.resource_name และ
    // campaign_asset.status โดยไม่ได้ SELECT สองตัวนั้น และ (ข) ดึงฟิลด์ของ
    // resource อื่น (asset.*) ข้ามมาจาก campaign_asset พร้อมกัน → Google ตอบ
    // queryError = EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE (HTTP 400) แผงนี้เลย
    // พังทุกครั้งที่เปิดหน้า
    //
    // แทนที่จะเดาว่ากติกาข้อไหนโดน จึงทำสองชั้น:
    //   ชั้น 1 (เร็ว, 1 คำขอ) — query เดิมที่ SELECT ครบทุกฟิลด์ที่อ้างใน WHERE
    //   ชั้น 2 (กันพลาด, 2 คำขอ) — ถ้าชั้น 1 ยังโดน queryError ให้แยกเป็นสอง query
    //     ที่ "ไม่มีทางผิดกติกาข้ามรีซอร์ส" ได้เลย: อ่าน campaign_asset โดยเลือก
    //     เฉพาะฟิลด์ของตัวมันเอง แล้วค่อยอ่าน asset จาก FROM asset ตรง ๆ
    //     แล้ว join ในโค้ด — เป็นแพตเทิร์นเดียวกับ /campaign-edit/audiences ที่ใช้งานจริงอยู่
    // ผลลัพธ์ที่ผู้ใช้เห็นเหมือนกันทั้งสองชั้น ต่างกันแค่จำนวนคำขอ
    const SELECT_FIELDS = [
      'campaign.resource_name',        // อยู่ใน WHERE → SELECT ด้วย
      'campaign_asset.resource_name',
      'campaign_asset.field_type',     // อยู่ใน WHERE → SELECT ด้วย
      'campaign_asset.status',         // อยู่ใน WHERE → SELECT ด้วย
      'asset.resource_name',
      'asset.sitelink_asset.link_text',
      'asset.sitelink_asset.description1',
      'asset.sitelink_asset.description2',
      'asset.final_urls',
      'asset.callout_asset.callout_text',
    ].join(', ')

    const runQuery = (query: string) =>
      fetch(
        `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
        { method: 'POST', headers: headersFor(token), body: JSON.stringify({ query }) }
      )

    type JoinedRow = {
      campaignAsset?: { resourceName?: string; fieldType?: string; status?: string; asset?: string }
      asset?: {
        resourceName?: string
        finalUrls?: string[]
        sitelinkAsset?: { linkText?: string; description1?: string; description2?: string }
        calloutAsset?: { calloutText?: string }
      }
    }
    type Batches = Array<{ results?: JoinedRow[] }>

    let rows: JoinedRow[] = []
    let usedFallback = false

    const joined = await runQuery(
      `SELECT ${SELECT_FIELDS} FROM campaign_asset WHERE campaign.resource_name = '${safeRn}' AND campaign_asset.field_type IN ('SITELINK', 'CALLOUT') AND campaign_asset.status != 'REMOVED'`
    )
    if (joined.ok) {
      rows = ((await joined.json()) as Batches).flatMap(b => b.results ?? [])
    } else {
      const txt = await joined.text()
      if (!txt.includes('queryError')) {
        throw new Error(`Google Ads API error (${joined.status}): ${txt.slice(0, 400)}`)
      }
      console.error('[campaign-edit/extensions GET] joined query rejected, falling back to two-step:', txt.slice(0, 300))
      usedFallback = true

      // ขา 1 — เฉพาะฟิลด์ของ campaign_asset เอง (ไม่ข้ามรีซอร์ส = ไม่มีทางผิดกติกา)
      const linksRes = await runQuery(
        `SELECT campaign.resource_name, campaign_asset.resource_name, campaign_asset.field_type, campaign_asset.status, campaign_asset.asset FROM campaign_asset WHERE campaign.resource_name = '${safeRn}'`
      )
      if (!linksRes.ok) {
        throw new Error(`Google Ads API error (${linksRes.status}): ${(await linksRes.text()).slice(0, 400)}`)
      }
      const links = ((await linksRes.json()) as Batches)
        .flatMap(b => b.results ?? [])
        .filter(r => {
          const ca = r.campaignAsset
          return !!ca?.resourceName && !!ca.asset && ca.status !== 'REMOVED' &&
            (ca.fieldType === 'SITELINK' || ca.fieldType === 'CALLOUT')
        })

      // ขา 2 — อ่านเนื้อ asset จาก FROM asset ตรง ๆ แล้ว join เอง
      // ตั้งใจไม่ใช้ [...new Set()] — tsconfig ของโปรเจกต์ไม่ได้ตั้ง target ไว้ (ตกเป็น ES5)
      // การ spread Set จะพัง TS2802 ตอน build ถ้าไม่มี downlevelIteration
      const seenRn: Record<string, true> = {}
      const assetRns: string[] = []
      for (const r of links) {
        const rn = r.campaignAsset!.asset!
        if (!seenRn[rn]) {
          seenRn[rn] = true
          assetRns.push(rn)
        }
      }
      const assetById = new Map<string, JoinedRow['asset']>()
      if (assetRns.length) {
        const inList = assetRns.map(rn => `'${rn.replace(/'/g, "\\'")}'`).join(', ')
        const assetsRes = await runQuery(
          `SELECT asset.resource_name, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.callout_asset.callout_text FROM asset WHERE asset.resource_name IN (${inList})`
        )
        if (!assetsRes.ok) {
          throw new Error(`Google Ads API error (${assetsRes.status}): ${(await assetsRes.text()).slice(0, 400)}`)
        }
        for (const r of ((await assetsRes.json()) as Batches).flatMap(b => b.results ?? [])) {
          if (r.asset?.resourceName) assetById.set(r.asset.resourceName, r.asset)
        }
      }
      rows = links.map(r => ({ campaignAsset: r.campaignAsset, asset: assetById.get(r.campaignAsset!.asset!) }))
    }

    const extensions: ExtensionRow[] = []
    for (const row of rows) {
      const ca = row.campaignAsset
      const asset = row.asset
      if (!ca?.resourceName) continue
      // เส้นทาง fallback อาจอ่านเนื้อ asset ไม่ได้ (เช่นถูกลบไปแล้ว) — ยังแสดงแถวได้
      // เพราะ resource name ของ asset ติดมากับ campaign_asset.asset อยู่แล้ว
      const assetRn = asset?.resourceName ?? ca.asset ?? ''
      if (!assetRn) continue
      if (ca.fieldType === 'SITELINK') {
        extensions.push({
          campaignAssetResourceName: ca.resourceName,
          assetResourceName: assetRn,
          fieldType: 'SITELINK',
          linkText: asset?.sitelinkAsset?.linkText ?? '',
          description1: asset?.sitelinkAsset?.description1 ?? '',
          description2: asset?.sitelinkAsset?.description2 ?? '',
          finalUrl: asset?.finalUrls?.[0] ?? '',
        })
      } else if (ca.fieldType === 'CALLOUT') {
        extensions.push({
          campaignAssetResourceName: ca.resourceName,
          assetResourceName: assetRn,
          fieldType: 'CALLOUT',
          calloutText: asset?.calloutAsset?.calloutText ?? '',
        })
      }
    }
    return NextResponse.json({ extensions, degraded: usedFallback })
  } catch (err) {
    console.error('[campaign-edit/extensions GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

interface ExtensionOp {
  op: 'add_sitelink' | 'add_callout' | 'remove'
  campaignResourceName?: string
  // add_sitelink
  linkText?: string
  finalUrl?: string
  description1?: string
  description2?: string
  // add_callout
  calloutText?: string
  // remove
  campaignAssetResourceName?: string
}

export async function POST(req: NextRequest) {
  let body: { customerId?: string; operations?: ExtensionOp[] }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const customerId = body.customerId ?? ''
  const operations = body.operations ?? []
  if (!customerId || operations.length === 0) {
    return NextResponse.json({ error: 'customerId and operations are required' }, { status: 400 })
  }
  if (operations.length > 50) {
    return NextResponse.json({ error: 'สูงสุด 50 รายการต่อครั้ง' }, { status: 400 })
  }

  const cid = customerId.replace(/-/g, '')
  const mutateOperations: Record<string, unknown>[] = []
  let tempId = -1
  // ใช้ index loop แทน operations.entries() — tsconfig ของโปรเจกต์ไม่ได้ตั้ง `target`
  // (ตกเป็น ES5) การ iterate iterator จะพัง TS2802 ตอน build ถ้าไม่มี downlevelIteration
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]
    if (op.op === 'add_sitelink') {
      if (!op.campaignResourceName || !op.linkText?.trim() || !op.finalUrl?.trim()) {
        return NextResponse.json({ error: `operation[${i}]: add_sitelink ต้องมี campaignResourceName, linkText, finalUrl` }, { status: 400 })
      }
      const tempRn = `customers/${cid}/assets/${tempId--}`
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: tempRn,
            finalUrls: [op.finalUrl.trim()],
            sitelinkAsset: {
              linkText: op.linkText.trim().slice(0, 25),
              ...(op.description1?.trim() ? { description1: op.description1.trim().slice(0, 35) } : {}),
              ...(op.description2?.trim() ? { description2: op.description2.trim().slice(0, 35) } : {}),
            },
          },
        },
      })
      mutateOperations.push({
        campaignAssetOperation: {
          create: { campaign: op.campaignResourceName, asset: tempRn, fieldType: 'SITELINK' },
        },
      })
    } else if (op.op === 'add_callout') {
      if (!op.campaignResourceName || !op.calloutText?.trim()) {
        return NextResponse.json({ error: `operation[${i}]: add_callout ต้องมี campaignResourceName, calloutText` }, { status: 400 })
      }
      const tempRn = `customers/${cid}/assets/${tempId--}`
      mutateOperations.push({
        assetOperation: {
          create: { resourceName: tempRn, calloutAsset: { calloutText: op.calloutText.trim().slice(0, 25) } },
        },
      })
      mutateOperations.push({
        campaignAssetOperation: {
          create: { campaign: op.campaignResourceName, asset: tempRn, fieldType: 'CALLOUT' },
        },
      })
    } else if (op.op === 'remove') {
      if (!op.campaignAssetResourceName) {
        return NextResponse.json({ error: `operation[${i}]: remove ต้องมี campaignAssetResourceName` }, { status: 400 })
      }
      mutateOperations.push({ campaignAssetOperation: { remove: op.campaignAssetResourceName } })
    } else {
      return NextResponse.json({ error: `operation[${i}]: op ไม่ถูกต้อง` }, { status: 400 })
    }
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
      { method: 'POST', headers: headersFor(token), body: JSON.stringify({ mutateOperations }) }
    )
    const data = await res.json() as { mutateOperationResponses?: unknown[]; error?: { message?: string } }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Google Ads API error (${res.status})`)
    }
    return NextResponse.json({ success: true, applied: operations.length })
  } catch (err) {
    console.error('[campaign-edit/extensions POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
