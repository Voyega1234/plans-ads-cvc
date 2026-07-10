/**
 * Image pool — รูปที่อัปโหลดในแคมเปญไหนก็ได้ ใช้ร่วมกันทั้ง push (business เดียวกัน
 * logo/รูปชุดเดียวกัน) แคมเปญที่ขาดรูปบังคับจะหยิบจาก pool อัตโนมัติ
 * แก้ปัญหา "อัปโหลด logo แล้วแต่ PMax ยังบอกขาดรูป" ให้จบถาวร
 */

import type { CampaignBlueprintItem } from '@/types'

export interface PoolImage { assetType: string; imageUrl: string; description?: string }

// รวมรูปทุก shape ที่ blueprint หนึ่งตัวมี (assetGroups + ad.pmax + ad.display)
export function collectBlueprintImages(bp?: CampaignBlueprintItem | null): PoolImage[] {
  if (!bp) return []
  const out: PoolImage[] = []
  for (const ag of bp.assetGroups ?? []) {
    for (const img of ag.imageAssets ?? []) {
      if (img.imageUrl) out.push({ assetType: img.assetType, imageUrl: img.imageUrl, description: img.description })
    }
  }
  for (const ag of bp.adGroups ?? []) {
    for (const ad of ag.ads ?? []) {
      const shapes = [
        ...((ad.pmax?.imageAssets ?? []) as { assetType: string; imageUrl?: string; description?: string }[]),
        ...((ad.display?.imageAssets ?? []) as { assetType: string; imageUrl?: string; description?: string }[]),
      ]
      for (const img of shapes) {
        if (img.imageUrl) out.push({ assetType: img.assetType, imageUrl: img.imageUrl, description: img.description })
      }
    }
  }
  return out
}

export function buildImagePool(blueprints: (CampaignBlueprintItem | null | undefined)[]): PoolImage[] {
  const seen = new Set<string>()
  const pool: PoolImage[] = []
  for (const bp of blueprints) {
    for (const img of collectBlueprintImages(bp)) {
      const key = `${img.assetType}|${img.imageUrl}`
      if (!seen.has(key)) { seen.add(key); pool.push(img) }
    }
  }
  return pool
}

const LOGO_TYPES = ['LOGO', 'SQUARE_LOGO']

function hasType(imgs: PoolImage[], types: string[]): boolean {
  return imgs.some(i => types.includes(i.assetType))
}
function pickFromPool(pool: PoolImage[], types: string[]): PoolImage | undefined {
  return pool.find(i => types.includes(i.assetType))
}

// เติมรูปบังคับที่ขาดจาก pool ลง blueprint (คืนตัวใหม่ ไม่แก้ของเดิม)
// วางใน assetGroups[0] (PMax) หรือ ads[0].display (Display/DG) ให้ตรงที่ builder อ่าน
export function withPooledImages(
  type: string,
  bp: CampaignBlueprintItem,
  pool: PoolImage[]
): CampaignBlueprintItem {
  const needLogo = type === 'PERFORMANCE_MAX' || type === 'DEMAND_GEN'
  const needImgs = needLogo || type === 'DISPLAY'
  if (!needImgs) return bp

  // แหล่งรูป = รูปของแคมเปญตัวเองก่อน (reuse ข้าม ad group) แล้วค่อย pool จากแคมเปญอื่น
  const own = collectBlueprintImages(bp)
  const source = [...own, ...pool]
  const requiredTypes: string[][] = [
    ...(needLogo ? [LOGO_TYPES] : []),
    ['MARKETING_IMAGE'],
    ['SQUARE_MARKETING_IMAGE'],
  ]
  // รูปครบชุดที่ดีที่สุดเท่าที่หาได้ (จากตัวเอง+pool) สำหรับเติมจุดที่ขาด
  const asAssets = requiredTypes
    .map(types => pickFromPool(source, types))
    .filter((i): i is PoolImage => !!i)
    .map(b => ({
      assetType: b.assetType as 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'PORTRAIT_MARKETING_IMAGE' | 'LOGO' | 'SQUARE_LOGO',
      description: b.description ?? b.assetType.replace(/_/g, ' '),
      imageUrl: b.imageUrl,
    }))
  if (asAssets.length === 0) return bp

  if (type === 'PERFORMANCE_MAX' && (bp.assetGroups?.length ?? 0) > 0) {
    return {
      ...bp,
      assetGroups: bp.assetGroups!.map((ag, i) => {
        if (i !== 0) return ag
        const agOwn = (ag.imageAssets ?? []).filter(x => x.imageUrl) as PoolImage[]
        const agBorrow = asAssets.filter(b =>
          LOGO_TYPES.includes(b.assetType) ? !hasType(agOwn, LOGO_TYPES) : !hasType(agOwn, [b.assetType]))
        return agBorrow.length > 0 ? { ...ag, imageAssets: [...(ag.imageAssets ?? []), ...agBorrow] } : ag
      }),
    }
  }
  // Display/DG (หรือ PMax ที่ไม่มี assetGroup): เติมให้ "ทุก ad group" ที่ยังขาด —
  // builder สร้าง RDA ต่อ ad group แยกกัน ถ้าเติมแค่ตัวแรก AG ถัดไปจะยังขาดรูป
  const adGroups = (bp.adGroups ?? []).map(ag => {
    if ((ag.ads?.length ?? 0) === 0) return ag
    const ownImgs = (ag.ads ?? []).flatMap(ad => ([
      ...((ad.pmax?.imageAssets ?? []) as PoolImage[]),
      ...((ad.display?.imageAssets ?? []) as PoolImage[]),
    ])).filter(i => i.imageUrl)
    const agBorrow = asAssets.filter(b =>
      LOGO_TYPES.includes(b.assetType)
        ? !hasType(ownImgs, LOGO_TYPES)
        : !hasType(ownImgs, [b.assetType]))
    if (agBorrow.length === 0) return ag
    const ads = ag.ads.map((ad, ai) => {
      if (ai !== 0) return ad
      const disp = (ad.display ?? { headlines: [], longHeadlines: [], descriptions: [], businessName: '', imageAssets: [] }) as { imageAssets?: unknown[] } & Record<string, unknown>
      return { ...ad, display: { ...disp, imageAssets: [...((disp.imageAssets ?? []) as PoolImage[]), ...agBorrow] } }
    })
    return { ...ag, ads }
  })
  return { ...bp, adGroups: adGroups as CampaignBlueprintItem['adGroups'] }
}
