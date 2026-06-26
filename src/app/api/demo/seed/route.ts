import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

// ── Demo data — ConvertCake Google Ads Agency ─────────────────────────────────

const DEMO_PLAN_JSON = JSON.stringify({
  campaignMix: [
    {
      campaignName: 'CVC-Search | Brand | ConvertCake | Lead',
      type: 'SEARCH',
      objective: 'Brand Protection & Direct Intent Capture',
      monthlyBudget: 12000,
      dailyBudget: 400,
      budgetPercent: 15,
      targetCPA: 800,
      expectedClicks: 600,
      expectedImpressions: 8000,
      expectedConversions: 12,
      bidStrategy: 'MAXIMIZE_CLICKS',
      networks: ['SEARCH'],
      targeting: { locations: ['Bangkok', 'Thailand'], languages: ['th', 'en'], devices: ['MOBILE', 'DESKTOP'] },
    },
    {
      campaignName: 'CVC-Search | Generic | ConvertCake | Lead',
      type: 'SEARCH',
      objective: 'Generic Demand Capture — รับลูกค้าใหม่ที่ search หา Google Ads agency',
      monthlyBudget: 32000,
      dailyBudget: 1067,
      budgetPercent: 40,
      targetCPA: 1500,
      expectedClicks: 1400,
      expectedImpressions: 28000,
      expectedConversions: 20,
      bidStrategy: 'MAXIMIZE_CLICKS',
      networks: ['SEARCH'],
      targeting: { locations: ['Bangkok', 'Thailand'], languages: ['th', 'en'], devices: ['MOBILE', 'DESKTOP'] },
    },
    {
      campaignName: 'CVC-PMax | ConvertCake | Lead',
      type: 'PERFORMANCE_MAX',
      objective: 'Performance Max — ขยาย reach ทุก channel',
      monthlyBudget: 24000,
      dailyBudget: 800,
      budgetPercent: 30,
      targetCPA: 2000,
      expectedClicks: 800,
      expectedImpressions: 60000,
      expectedConversions: 10,
      bidStrategy: 'MAXIMIZE_CONVERSIONS',
      networks: ['SEARCH', 'DISPLAY', 'YOUTUBE'],
      targeting: { locations: ['Bangkok', 'Thailand'], languages: ['th', 'en'], devices: ['MOBILE', 'DESKTOP', 'TABLET'] },
    },
    {
      campaignName: 'CVC-Display | Remarketing | ConvertCake | Lead',
      type: 'DISPLAY',
      objective: 'Remarketing — ตามเยี่ยม visitor ที่ยังไม่ convert',
      monthlyBudget: 12000,
      dailyBudget: 400,
      budgetPercent: 15,
      targetCPA: 1200,
      expectedClicks: 400,
      expectedImpressions: 120000,
      expectedConversions: 8,
      bidStrategy: 'MAXIMIZE_CONVERSIONS',
      networks: ['DISPLAY'],
      targeting: { locations: ['Bangkok', 'Thailand'], languages: ['th', 'en'], devices: ['MOBILE', 'DESKTOP'] },
    },
  ],
  forecast: {
    totalMonthlyBudget: 80000,
    totalExpectedConversions: 50,
    blendedCPA: 1600,
    totalExpectedClicks: 3200,
    totalExpectedImpressions: 216000,
    blendedCTR: 1.48,
    blendedCPC: 25,
    roas: 4.2,
  },
  strategicRationale: 'วาง funnel แบบ 4 ชั้น: Brand ป้องกัน intent ตรง, Generic ดัก demand ที่มีอยู่, PMax ขยาย reach, Display ดึงคนกลับมา — เน้น Conversion Quality ก่อน Scale ตาม Executive Growth Skill',
  recommendations: [
    'พี่ๆ ลองเปิด Brand campaign ก่อนเลย เพราะ CPC ต่ำสุดและ CVR สูงที่สุด — ใช้เป็น baseline วัด CPA target',
    'แนะนำให้พี่ๆ ทำ Search Term Report สัปดาห์แรกก่อนเพิ่มงบ PMax — จะได้ข้อมูล intent จริงก่อนระบบ auto-expand',
    'พี่ๆ ลอง pin Headline 1-2 ใน RSA เป็น keyword หลักก่อน แล้วค่อย test angle อื่น — ช่วยให้ Ad Strength ขึ้น Excellent เร็ว',
    'แนะนำให้พี่ๆ ตั้ง Conversion Tracking ให้ครบ 3 action: Form submit, LINE click, Phone call — PMax จะ optimize ได้แม่นขึ้นมาก',
    'พี่ๆ ลอง Audience Signal ใน PMax ด้วย Customer List + In-Market SaaS/Software — จะช่วยให้ระบบเรียนรู้เร็วกว่า cold start',
  ],
})

const DEMO_BLUEPRINT_JSON = JSON.stringify({
  campaigns: [
    {
      campaignName: 'CVC-Search | Brand | ConvertCake | Lead',
      campaignType: 'SEARCH',
      status: 'PAUSED',
      budget: 400,
      bidStrategy: 'MAXIMIZE_CLICKS',
      targetCPA: 800,
      locationTargets: ['Bangkok', 'Thailand'],
      languageTargets: ['th', 'en'],
      adGroups: [
        {
          adGroupName: 'Brand — Core',
          defaultBid: 15,
          keywords: ['convertcake', 'convert cake', 'convertcake google ads', 'บริษัท convertcake'],
          matchTypes: ['PHRASE', 'PHRASE', 'PHRASE', 'PHRASE'],
          ads: [
            {
              headline1: 'ConvertCake Google Ads',
              headline2: 'ผู้เชี่ยวชาญ Paid Search ไทย',
              headline3: 'ปรึกษาฟรีวันนี้',
              description1: 'รับทำ Google Ads ครบวงจร ตั้งแต่วางแผนถึงปรับปรุงผลลัพธ์ ประสบการณ์มากกว่า 200 account',
              description2: 'ทีม Expert ดูแลคุณตลอด 24 ชั่วโมง ไม่มีสัญญาผูกมัด ทดลองใช้บริการฟรีเดือนแรก',
              finalUrl: 'https://www.convertcake.com',
              displayPath: 'google-ads',
              rsa: {
                adType: 'RSA',
                headlines: [
                  'ConvertCake Google Ads',
                  'ผู้เชี่ยวชาญ Paid Search ไทย',
                  'ปรึกษาฟรีวันนี้',
                  'บริการ Google Ads ครบวงจร',
                  'ดูแลโดยทีม Expert',
                  'ผลลัพธ์วัดได้จริง',
                  'ไม่มีสัญญาผูกมัด',
                  'ฟรี Audit เดือนแรก',
                  'ประสบการณ์ 200+ Account',
                  'เพิ่ม Conversion ทันที',
                  'ราคาโปร่งใส ไม่มีค่าซ่อน',
                  'ติดต่อ ConvertCake วันนี้',
                  'Google Ads Agency ไทย',
                  'Data-Driven ทุกขั้นตอน',
                  'Scale ธุรกิจด้วย Ads',
                ],
                descriptions: [
                  'รับทำ Google Ads ครบวงจร ตั้งแต่วางแผนถึงปรับปรุงผลลัพธ์ ประสบการณ์มากกว่า 200 account ในไทย',
                  'ทีม Expert ดูแลคุณตลอด ไม่มีสัญญาผูกมัด รายงานผลทุกสัปดาห์ พร้อมปรับกลยุทธ์ตามข้อมูลจริง',
                  'ฟรี Audit Google Ads เดือนแรก ไม่มีเงื่อนไข — เริ่มต้นง่าย เห็นผลเร็ว ติดต่อเราวันนี้',
                  'ConvertCake ดูแล account ให้ได้ ROI สูงสุด พร้อม dashboard real-time ดูผลได้ทุกเวลา',
                ],
                finalUrl: 'https://www.convertcake.com',
                displayPath1: 'google-ads',
                displayPath2: 'ปรึกษาฟรี',
              },
            },
          ],
        },
      ],
      negativeKeywords: ['งาน', 'สมัครงาน', 'ฟรี', 'pantip', 'รีวิว', 'ดีไหม'],
      sitelinks: [
        { text: 'ดูผลงาน', description1: 'Case Study จากลูกค้าจริง', description2: 'ROI ที่วัดได้ชัดเจน', finalUrl: 'https://www.convertcake.com/case-studies' },
        { text: 'ราคาบริการ', description1: 'แพ็กเกจเริ่มต้นที่เหมาะสม', description2: 'ไม่มีค่าใช้จ่ายซ่อน', finalUrl: 'https://www.convertcake.com/pricing' },
        { text: 'ปรึกษาฟรี', description1: 'คุยกับ Expert วันนี้', description2: 'ไม่มีข้อผูกมัด', finalUrl: 'https://www.convertcake.com/contact' },
        { text: 'เกี่ยวกับเรา', description1: 'ทีม Google Ads มืออาชีพ', description2: 'ประสบการณ์ 10+ ปี', finalUrl: 'https://www.convertcake.com/about' },
      ],
      callouts: ['ฟรี Audit เดือนแรก', 'ไม่มีสัญญาผูกมัด', 'รายงานทุกสัปดาห์', 'ทีม Expert ดูแล', 'Data-Driven', 'ROI วัดได้จริง'],
      structuredSnippets: [{ header: 'บริการ', values: ['Google Search Ads', 'Performance Max', 'Display Ads', 'YouTube Ads', 'Remarketing'] }],
      phoneNumbers: [],
    },
    {
      campaignName: 'CVC-Search | Generic | ConvertCake | Lead',
      campaignType: 'SEARCH',
      status: 'PAUSED',
      budget: 1067,
      bidStrategy: 'MAXIMIZE_CLICKS',
      targetCPA: 1500,
      locationTargets: ['Bangkok', 'Thailand'],
      languageTargets: ['th', 'en'],
      adGroups: [
        {
          adGroupName: 'Generic — รับทำ Google Ads',
          defaultBid: 35,
          keywords: ['รับทำ google ads', 'บริษัทรับทำ google ads', 'agency google ads ไทย', 'รับทำโฆษณา google', 'google ads agency bangkok'],
          matchTypes: ['PHRASE', 'PHRASE', 'PHRASE', 'PHRASE', 'PHRASE'],
          ads: [
            {
              headline1: 'รับทำ Google Ads มืออาชีพ',
              headline2: 'ประสบการณ์ 200+ Account',
              headline3: 'ปรึกษาฟรีวันนี้',
              description1: 'ทีม Expert ดูแล Google Ads ครบวงจร วางแผน สร้าง วิเคราะห์ และปรับปรุงผลลัพธ์ทุกสัปดาห์',
              description2: 'ฟรี Audit Account เดือนแรก ไม่มีสัญญาผูกมัด เริ่มเพิ่ม Conversion ได้ทันที',
              finalUrl: 'https://www.convertcake.com',
              displayPath: 'google-ads',
              rsa: {
                adType: 'RSA',
                headlines: [
                  'รับทำ Google Ads มืออาชีพ',
                  'ประสบการณ์ 200+ Account',
                  'ปรึกษาฟรีวันนี้',
                  'เพิ่ม Conversion ทันที',
                  'Agency Google Ads ไทย',
                  'ทีม Expert ดูแลครบวงจร',
                  'ROI วัดได้จริงทุกบาท',
                  'ฟรี Audit เดือนแรก',
                  'ไม่มีสัญญาผูกมัด',
                  'Ads ที่ดึง Intent จริง',
                  'ลด CPA เพิ่ม Conversion',
                  'Google Ads Expert 10 ปี',
                  'รายงานผลทุกสัปดาห์',
                  'เริ่มต้นได้วันนี้',
                  'Data-Driven ทุกขั้นตอน',
                ],
                descriptions: [
                  'รับทำ Google Ads ครบวงจร วางแผน keyword, สร้าง ad copy, วิเคราะห์ search term และ optimize ทุกสัปดาห์',
                  'ทีม Expert ดูแล account โดยตรง ไม่ส่งต่อ junior รายงานผลโปร่งใส เข้าใจง่าย ทุกสัปดาห์',
                  'ฟรี Audit Google Ads เดือนแรก เจอปัญหาจริง แก้ได้จริง — ติดต่อเราวันนี้ไม่มีข้อผูกมัด',
                  'ConvertCake ช่วยธุรกิจ SME ลด wasted spend และเพิ่ม Conversion จาก Traffic เดิม ไม่ต้องเพิ่มงบ',
                ],
                finalUrl: 'https://www.convertcake.com',
                displayPath1: 'google-ads',
                displayPath2: 'ราคาบริการ',
              },
            },
          ],
        },
        {
          adGroupName: 'Problem Intent — โฆษณาไม่ได้ผล',
          defaultBid: 30,
          keywords: ['google ads ไม่ได้ผล', 'โฆษณา google ไม่ work', 'cpa สูงเกินไป', 'google ads เสียเงินเปล่า', 'ยิงแอดแล้วไม่มีลูกค้า'],
          matchTypes: ['PHRASE', 'PHRASE', 'PHRASE', 'PHRASE', 'PHRASE'],
          ads: [
            {
              headline1: 'Google Ads ไม่ได้ผล?',
              headline2: 'ให้เราตรวจฟรีก่อนเลย',
              headline3: 'พบปัญหาจริงใน 48 ชั่วโมง',
              description1: 'หลายธุรกิจเสียเงินกับ Google Ads โดยไม่รู้สาเหตุ เราตรวจ account ฟรีและบอกปัญหาชัดเจน',
              description2: 'ทีม Expert วิเคราะห์ Search Term, Keyword, Ad Copy และ Landing Page ให้ครบ ปรึกษาฟรีวันนี้',
              finalUrl: 'https://www.convertcake.com',
              displayPath: 'audit-ฟรี',
              rsa: {
                adType: 'RSA',
                headlines: [
                  'Google Ads ไม่ได้ผล?',
                  'ให้เราตรวจฟรีก่อนเลย',
                  'พบปัญหาจริงใน 48 ชั่วโมง',
                  'หยุดเสียเงินกับ Ads ที่ไม่ work',
                  'ตรวจ Account ฟรีทันที',
                  'Root Cause วิเคราะห์จริง',
                  'แก้ CPA สูงได้ไม่ต้องเพิ่มงบ',
                  'Search Term ที่แพงแต่ไม่ Convert',
                  'Keyword กว้างเกินไปหรือเปล่า?',
                  'Landing Page ทำให้คนออกไว?',
                  'Negative Keyword ช่วยได้มาก',
                  'ปรึกษา Expert ฟรีวันนี้',
                  'Fix ก่อน Scale เสมอ',
                  'เริ่มแก้ปัญหาได้เลย',
                  'Audit ครบใน 48 ชั่วโมง',
                ],
                descriptions: [
                  'หลายธุรกิจเสียเงินกับ Google Ads โดยไม่รู้ว่าปัญหาอยู่ที่ Keyword, Ad Copy หรือ Landing Page',
                  'เราตรวจ Search Term, Negative Keyword, Ad Strength และ Funnel ให้ครบ บอกปัญหาจริงชัดเจน',
                  'ฟรี Audit ไม่มีข้อผูกมัด — เจอปัญหาแล้วค่อยตัดสินใจว่าจะใช้บริการต่อหรือไม่',
                  'ConvertCake ช่วยแก้ CPA สูงและ Conversion ต่ำโดยไม่ต้องเพิ่มงบ ผลลัพธ์วัดได้จริง',
                ],
                finalUrl: 'https://www.convertcake.com',
                displayPath1: 'audit-ฟรี',
                displayPath2: 'แก้ปัญหา',
              },
            },
          ],
        },
      ],
      negativeKeywords: ['งาน', 'สมัครงาน', 'ฟรี ทำเอง', 'youtube', 'facebook', 'tiktok', 'pantip', 'รีวิว'],
      sitelinks: [
        { text: 'ดูผลงาน', description1: 'Case Study จากลูกค้าจริง', description2: 'ROI ที่วัดได้ชัดเจน', finalUrl: 'https://www.convertcake.com/case-studies' },
        { text: 'ราคาบริการ', description1: 'แพ็กเกจเริ่มต้นที่เหมาะสม', description2: 'ไม่มีค่าใช้จ่ายซ่อน', finalUrl: 'https://www.convertcake.com/pricing' },
        { text: 'ปรึกษาฟรี', description1: 'คุยกับ Expert วันนี้', description2: 'ไม่มีข้อผูกมัด', finalUrl: 'https://www.convertcake.com/contact' },
        { text: 'Audit ฟรี', description1: 'ตรวจ Account ฟรีทันที', description2: 'พบปัญหาใน 48 ชั่วโมง', finalUrl: 'https://www.convertcake.com/audit' },
      ],
      callouts: ['ฟรี Audit เดือนแรก', 'ไม่มีสัญญาผูกมัด', 'รายงานทุกสัปดาห์', 'ทีม Expert ดูแล', 'Data-Driven', 'ROI วัดได้จริง'],
      structuredSnippets: [{ header: 'บริการ', values: ['Google Search Ads', 'Performance Max', 'Display Ads', 'YouTube Ads', 'Remarketing'] }],
      phoneNumbers: [],
    },
  ],
  conversionActions: [
    { name: 'CVC-Form Submit', category: 'SUBMIT_LEAD_FORM', value: 1500, countingType: 'ONE_PER_CLICK' },
    { name: 'CVC-LINE Chat Click', category: 'PAGE_VIEW', value: 800, countingType: 'ONE_PER_CLICK' },
    { name: 'CVC-Phone Call', category: 'PHONE_CALL_LEAD', value: 2000, countingType: 'ONE_PER_CLICK' },
  ],
  sharedNegatives: ['งาน', 'สมัครงาน', 'ทำเอง', 'diy', 'youtube', 'facebook ads', 'tiktok ads', 'instagram', 'line ads'],
  recommendations: [
    'พี่ๆ ลองเปิด Brand campaign ก่อน — CPC ต่ำสุด CVR สูงสุด ใช้เป็น benchmark CPA จริงก่อน optimize Generic',
    'แนะนำให้พี่ๆ ดู Search Term Report ทุกวันในสัปดาห์แรก เพิ่ม negative ทันทีที่เห็น query ที่ไม่ใช่ intent',
    'พี่ๆ ลอง pin Headline ที่มี keyword ไว้ position 1 เพื่อ Ad Relevance — ช่วยให้ Quality Score สูงขึ้นและ CPC ลดลง',
    'แนะนำให้พี่ๆ ตั้ง Conversion ให้ครบ 3 action ก่อน activate PMax — ระบบจะ optimize ได้แม่นกว่า cold start มาก',
  ],
})

export async function POST() {
  try {
    const session = await auth()
    const userId = getUserId(session)

    // Create demo brief
    const brief = await prisma.brief.create({
      data: {
        userId,
        businessName: 'ConvertCake',
        websiteUrl: 'https://www.convertcake.com',
        productService: 'บริการรับทำ Google Ads ครบวงจร ตั้งแต่วางแผนกลยุทธ์ สร้างแคมเปญ วิเคราะห์ข้อมูล Search Term และปรับปรุงผลลัพธ์อย่างต่อเนื่อง เหมาะสำหรับธุรกิจ SME ที่ต้องการเพิ่ม Lead และ Sales จาก Google',
        objective: 'LEADS',
        monthlyBudget: 80000,
        currency: 'THB',
        targetLocation: 'Bangkok, Thailand',
        language: 'th',
        targetAudience: 'เจ้าของธุรกิจ SME อายุ 28-50 ปี งบการตลาด 30,000+ บาท/เดือน สนใจเพิ่มยอดขายออนไลน์ผ่าน Google Ads',
        conversionGoal: 'Form submit / LINE OA click / โทรศัพท์',
        promotion: 'ฟรี Audit Google Ads เดือนแรก ไม่มีเงื่อนไข',
        brandTone: 'Professional, Data-driven, Trustworthy',
        duration: '3',
        notes: 'เน้น keyword purchase intent สูง และ competitor agency keywords ในไทย',
        googleAdsCustomerId: '548-200-7847',
        status: 'active',
      },
    })

    // Create demo media plan
    const mediaPlan = await prisma.mediaPlan.create({
      data: {
        briefId: brief.id,
        userId,
        title: 'ConvertCake — Full Funnel Google Ads Plan (Demo)',
        objective: 'LEADS',
        monthlyBudget: 80000,
        currency: 'THB',
        planJson: DEMO_PLAN_JSON,
        status: 'active',
      },
    })

    // Create demo campaign blueprint
    const blueprint = await prisma.campaignBlueprint.create({
      data: {
        mediaPlanId: mediaPlan.id,
        userId,
        blueprintJson: DEMO_BLUEPRINT_JSON,
        status: 'draft',
        qaScore: 92,
      },
    })

    return NextResponse.json({
      ok: true,
      briefId: brief.id,
      mediaPlanId: mediaPlan.id,
      blueprintId: blueprint.id,
    })
  } catch (e) {
    console.error('[demo/seed]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

// DELETE — remove all demo data for this user
export async function DELETE() {
  try {
    const session = await auth()
    const userId = getUserId(session)

    // Find demo briefs
    const demoBriefs = await prisma.brief.findMany({
      where: { userId, businessName: 'ConvertCake', notes: { contains: 'Demo' } },
      select: { id: true },
    })

    // Also find by exact demo title in media plans
    const demoPlans = await prisma.mediaPlan.findMany({
      where: { userId, title: { contains: '(Demo)' } },
      select: { id: true, briefId: true },
    })

    const planIds = demoPlans.map(p => p.id)
    const briefIds = Array.from(new Set([...demoBriefs.map(b => b.id), ...demoPlans.map(p => p.briefId)]))

    if (planIds.length > 0) {
      await prisma.campaignBlueprint.deleteMany({ where: { mediaPlanId: { in: planIds } } })
      await prisma.keywordIdea.deleteMany({ where: { mediaPlanId: { in: planIds } } })
      await prisma.audienceSegment.deleteMany({ where: { mediaPlanId: { in: planIds } } })
      await prisma.mediaPlan.deleteMany({ where: { id: { in: planIds } } })
    }
    if (briefIds.length > 0) {
      await prisma.brief.deleteMany({ where: { id: { in: briefIds } } })
    }

    return NextResponse.json({ ok: true, removed: { plans: planIds.length, briefs: briefIds.length } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
