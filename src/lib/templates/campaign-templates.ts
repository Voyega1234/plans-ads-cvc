export interface CampaignTemplate {
  id: string
  type: 'SEARCH' | 'DISPLAY' | 'PERFORMANCE_MAX' | 'SHOPPING' | 'YOUTUBE' | 'DEMAND_GEN' | 'APP_CAMPAIGN' | 'SMART'
  name: string
  description: string
  icon: string           // lucide icon name string (for dynamic rendering)
  color: string          // tailwind bg color class
  badge?: string
  bestFor: string[]
  estimatedCPA: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  minBudget: number
  defaults: {
    objective: 'LEADS' | 'SALES' | 'AWARENESS' | 'TRAFFIC' | 'APP_INSTALLS'
    bidStrategy: string
    networkHints: string[]
    keyFeatures: string[]
    requiredAssets: string[]
    tips: string[]
  }
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'search-nonbrand',
    type: 'SEARCH',
    name: 'Search Non-Brand',
    description: 'แคมเปญค้นหาสำหรับ keyword ที่ไม่ใช่ชื่อแบรนด์ ดักจับความต้องการของลูกค้าที่กำลังมองหาสินค้า/บริการที่คล้ายคลึงกัน',
    icon: 'Search',
    color: 'bg-blue-500',
    bestFor: ['Lead generation', 'หาลูกค้าใหม่', 'ขยายฐานลูกค้า'],
    estimatedCPA: '฿300–800',
    difficulty: 'intermediate',
    minBudget: 15000,
    defaults: {
      objective: 'LEADS',
      bidStrategy: 'Maximize Conversions / Target CPA',
      networkHints: ['Google Search', 'Search Partners'],
      keyFeatures: [
        'ใช้ Keyword Match Types หลายรูปแบบ (Broad Match Modified, Phrase, Exact)',
        'แบ่ง Ad Group ตาม Theme ของสินค้า/บริการ',
        'ใช้ Negative Keywords เพื่อกรอง traffic ที่ไม่เกี่ยวข้อง',
        'เพิ่ม Ad Extensions: Sitelinks, Callouts, Call Extension',
        'ตั้ง Bid Adjustment สำหรับ Mobile, Location, Time',
      ],
      requiredAssets: [
        'Keyword list (อย่างน้อย 20-30 keywords)',
        'Responsive Search Ads (RSA) อย่างน้อย 3 ชุดต่อ Ad Group',
        'Sitelink Extensions อย่างน้อย 4 รายการ',
        'Callout Extensions อย่างน้อย 4 รายการ',
        'Landing Page ที่ตรงกับ keyword',
      ],
      tips: [
        'แยก campaign ออกจาก Brand campaign เพื่อควบคุมงบประมาณแยกกัน',
        'ใช้ Search Term Report สัปดาห์ละครั้งเพื่อเพิ่ม Negative Keywords',
        'ทดสอบ ad copy อย่างน้อย 2-3 เวอร์ชั่นต่อ Ad Group',
        'ตั้ง CPA target หลังจากมี conversion data อย่างน้อย 30-50 ครั้ง',
        'ระวัง Broad Match ที่อาจดึง traffic ที่ไม่เกี่ยวข้อง',
      ],
    },
  },
  {
    id: 'search-brand',
    type: 'SEARCH',
    name: 'Search Brand Protection',
    description: 'ปกป้องชื่อแบรนด์ใน Google Search ไม่ให้คู่แข่งแย่ง traffic และรักษา impression share ของแบรนด์ให้สูงที่สุด',
    icon: 'Shield',
    color: 'bg-indigo-500',
    bestFor: ['ปกป้องแบรนด์', 'รักษา impression share', 'ลด CPA'],
    estimatedCPA: '฿50–200',
    difficulty: 'beginner',
    minBudget: 5000,
    defaults: {
      objective: 'LEADS',
      bidStrategy: 'Target Impression Share (Top of page 100%)',
      networkHints: ['Google Search'],
      keyFeatures: [
        'Bid บน Brand Name และรูปแบบต่างๆ (ตัวสะกดผิด, คำย่อ)',
        'ตั้ง Target Impression Share 90-100% สำหรับ Top of page',
        'ใช้ Exact Match และ Phrase Match เพื่อควบคุม',
        'เพิ่ม Brand Messaging ใน Ad Copy',
        'ใช้ Sitelinks เพื่อเพิ่ม CTR และ Quality Score',
      ],
      requiredAssets: [
        'Brand keyword list (ชื่อแบรนด์, domain, สินค้าหลัก)',
        'Brand-focused ad copy (3 ชุดขึ้นไป)',
        'Sitelinks ที่ชี้ไปหน้าสำคัญ',
        'Call Extension (ถ้ามี)',
      ],
      tips: [
        'แยก campaign Brand ออกมาจาก Non-Brand เสมอ',
        'ตรวจสอบ Auction Insights สม่ำเสมอเพื่อดู competitor ที่ bid บน brand',
        'ไม่ต้องใช้ Broad Match สำหรับ Brand campaign',
        'งบประมาณต่ำก็ได้ผลดีเพราะ Quality Score สูงมาก',
        'ตรวจสอบ impression share หยุดที่ 80% ขึ้นไป',
      ],
    },
  },
  {
    id: 'pmax',
    type: 'PERFORMANCE_MAX',
    name: 'Performance Max',
    description: 'แคมเปญ AI-driven ที่ครอบคลุมทุก Google Network อัตโนมัติ เหมาะสำหรับธุรกิจที่ต้องการ Conversion สูงสุดด้วย Smart Bidding',
    icon: 'Zap',
    color: 'bg-violet-500',
    badge: 'AI-Powered',
    bestFor: ['Maximize Conversions', 'Omnichannel', 'Smart Automation'],
    estimatedCPA: '฿200–600',
    difficulty: 'intermediate',
    minBudget: 30000,
    defaults: {
      objective: 'LEADS',
      bidStrategy: 'Maximize Conversions / Target CPA / Target ROAS',
      networkHints: ['Search', 'Display', 'YouTube', 'Gmail', 'Maps', 'Discover'],
      keyFeatures: [
        'AI จัดสรร budget ข้ามทุก Google channel อัตโนมัติ',
        'Asset Group สำหรับแต่ละสินค้า/บริการหลัก',
        'Audience Signals ช่วย AI เรียนรู้เร็วขึ้น',
        'Final URL Expansion เพื่อให้ AI เลือก Landing Page ที่ดีที่สุด',
        'รองรับ Conversion Goals หลายประเภทพร้อมกัน',
      ],
      requiredAssets: [
        'รูปภาพ อย่างน้อย 3 ขนาด (1200x628, 1200x1200, 480x320)',
        'Logo (1200x1200 และ 1200x300)',
        'Video (YouTube URL) อย่างน้อย 1 คลิป (แนะนำ)',
        'Headlines อย่างน้อย 3 ชุด (สั้น ยาว)',
        'Descriptions อย่างน้อย 2 ชุด',
        'Audience Signals: Customer List หรือ Website Visitors',
      ],
      tips: [
        'ให้ PMax ทำงานอย่างน้อย 6-8 สัปดาห์ก่อนตัดสินผล',
        'ใส่ Audience Signals ที่ดีจะช่วยให้ AI เรียนรู้เร็ว',
        'ตรวจสอบ Asset performance ทุกเดือนและเปลี่ยน Asset ที่ Low rating',
        'ระวัง PMax แย่ง traffic จาก Brand campaign ควรใช้ Brand Exclusion',
        'ไม่แนะนำสำหรับธุรกิจที่มี conversion ต่ำกว่า 30/เดือน',
      ],
    },
  },
  {
    id: 'display-remarketing',
    type: 'DISPLAY',
    name: 'Display Remarketing',
    description: 'แสดงแบนเนอร์ต่อผู้เยี่ยมชมเว็บที่เคยเข้าชมแต่ยังไม่ได้ Convert กระตุ้นให้กลับมาและตัดสินใจซื้อ',
    icon: 'RefreshCw',
    color: 'bg-orange-500',
    bestFor: ['Remarketing', 'Re-engagement', 'เพิ่ม Conversion Rate'],
    estimatedCPA: '฿150–400',
    difficulty: 'intermediate',
    minBudget: 10000,
    defaults: {
      objective: 'LEADS',
      bidStrategy: 'Target CPA / Maximize Conversions',
      networkHints: ['Google Display Network'],
      keyFeatures: [
        'แยก Audience Segment ตามพฤติกรรม (ดูหน้าสินค้า, ไม่ checkout)',
        'ใช้ Dynamic Remarketing สำหรับ e-commerce',
        'ตั้ง Frequency Cap 3-5 ครั้ง/วัน เพื่อไม่รบกวนผู้ใช้',
        'Responsive Display Ads ปรับขนาดอัตโนมัติทุก placement',
        'ใช้ Exclusions เพื่อหยุดแสดงหลัง conversion',
      ],
      requiredAssets: [
        'รูปภาพหลายขนาด (1200x628, 300x250, 160x600, 728x90)',
        'Logo คุณภาพสูง',
        'Headlines 5 ชุด',
        'Descriptions 5 ชุด',
        'Remarketing Audience (อย่างน้อย 100 users)',
      ],
      tips: [
        'แยก Audience ที่ bounce เร็วออกจาก Audience ที่ engaged สูง',
        'ตั้ง window remarketing 7, 14, 30 วัน และทดสอบว่าอันไหนดีกว่า',
        'ใช้ message ที่แตกต่างกันสำหรับแต่ละ segment',
        'ตรวจสอบ Placement Report และ Exclude website ที่ไม่เกี่ยวข้อง',
        'ระวัง View-through conversion อาจทำให้ CPA ดูดีกว่าความเป็นจริง',
      ],
    },
  },
  {
    id: 'display-prospecting',
    type: 'DISPLAY',
    name: 'Display Prospecting',
    description: 'เข้าถึงกลุ่มเป้าหมายใหม่ที่ยังไม่รู้จักแบรนด์ผ่าน Google Display Network สร้าง Awareness และ Consideration',
    icon: 'Eye',
    color: 'bg-teal-500',
    bestFor: ['Brand Awareness', 'หาลูกค้าใหม่', 'Upper Funnel'],
    estimatedCPA: '฿500–1500',
    difficulty: 'intermediate',
    minBudget: 20000,
    defaults: {
      objective: 'AWARENESS',
      bidStrategy: 'Target CPM / Maximize Clicks',
      networkHints: ['Google Display Network', 'YouTube Display'],
      keyFeatures: [
        'In-market Audiences สำหรับกลุ่มที่กำลังมองหาสินค้าคล้ายกัน',
        'Custom Intent Audiences จาก keyword ที่เกี่ยวข้อง',
        'Similar Audiences จาก Customer List',
        'Topic และ Placement Targeting',
        'Responsive Display Ads พร้อม A/B Testing',
      ],
      requiredAssets: [
        'รูปภาพ Lifestyle และ Product หลายขนาด',
        'Logo ความละเอียดสูง',
        'Headlines ที่ดึงดูดความสนใจ 5 ชุด',
        'Descriptions ที่อธิบาย Value Proposition 5 ชุด',
        'Customer List สำหรับสร้าง Similar Audiences',
      ],
      tips: [
        'ตั้ง KPI เป็น CPM หรือ Reach ไม่ใช่ CPA สำหรับ Awareness',
        'ทดสอบ Audience segments ต่างกันใน Ad Group แยก',
        'รูปภาพคุณภาพสูงสำคัญมากสำหรับ Display — ลงทุนกับ creative',
        'ตรวจสอบ Brand Lift หลังจาก campaign ทำงาน 4 สัปดาห์',
        'หลีกเลี่ยง Automatic Placements — ใช้ Managed Placements แทน',
      ],
    },
  },
  {
    id: 'shopping',
    type: 'SHOPPING',
    name: 'Shopping / Product Listing',
    description: 'แสดงสินค้าพร้อมรูปภาพและราคาใน Google Search เหมาะสำหรับ e-commerce ที่ต้องการเพิ่มยอดขายออนไลน์',
    icon: 'ShoppingCart',
    color: 'bg-emerald-500',
    bestFor: ['E-commerce', 'Product Sales', 'ยอดขายออนไลน์'],
    estimatedCPA: '฿100–300',
    difficulty: 'advanced',
    minBudget: 20000,
    defaults: {
      objective: 'SALES',
      bidStrategy: 'Target ROAS / Maximize Conversion Value',
      networkHints: ['Google Shopping', 'Search Partners', 'Display Network (Showcase)'],
      keyFeatures: [
        'Product Feed คุณภาพสูงคือหัวใจของ Shopping campaign',
        'แบ่ง Product Groups ตาม Category, Brand, Price range',
        'ใช้ Negative Keywords เพื่อกรอง irrelevant search',
        'Smart Shopping ผสาน Remarketing อัตโนมัติ',
        'Priority Settings สำหรับ Tiered bidding strategy',
      ],
      requiredAssets: [
        'Google Merchant Center account ที่ verified',
        'Product Feed ใน GMC (title, description, price, image, GTIN)',
        'รูปภาพสินค้า background ขาว ขนาดขั้นต่ำ 800x800px',
        'Conversion Tracking สำหรับ Purchase event พร้อม Revenue value',
        'Website SSL certificate',
      ],
      tips: [
        'Title ใน Product Feed สำคัญมาก — ใส่ keyword หลักไว้ต้น title',
        'อัพเดท Feed อย่างน้อยวันละครั้งเพื่อให้ราคาและสต็อคถูกต้อง',
        'แยก Best Sellers ออกมาเป็น Product Group เพื่อ bid สูงกว่า',
        'ใช้ Custom Labels เพื่อแบ่งสินค้าตาม Margin หรือ Seasonality',
        'ตั้ง ROAS target หลังจากมี purchase data อย่างน้อย 50 ครั้ง',
      ],
    },
  },
  {
    id: 'youtube-instream',
    type: 'YOUTUBE',
    name: 'YouTube In-Stream',
    description: 'โฆษณาวิดีโอที่เล่นก่อนหรือระหว่าง YouTube video สามารถ skip ได้หลัง 5 วินาที เหมาะสำหรับสร้าง Brand Awareness และ Storytelling',
    icon: 'Play',
    color: 'bg-red-500',
    bestFor: ['Brand Storytelling', 'Video Awareness', 'Product Launch'],
    estimatedCPA: '฿800–2000',
    difficulty: 'intermediate',
    minBudget: 25000,
    defaults: {
      objective: 'AWARENESS',
      bidStrategy: 'Target CPV / Maximum CPV',
      networkHints: ['YouTube', 'Video Partners on Display Network'],
      keyFeatures: [
        'Skippable In-Stream — ผู้ชม skip ได้หลัง 5 วินาที',
        'คิดเงินเมื่อดูครบ 30 วินาที หรือ interact กับโฆษณา',
        'รองรับ Call-to-Action Overlay',
        'Companion Banner แสดงข้างวิดีโอ',
        'YouTube Audience Targeting: Demographics, Interests, Keywords',
      ],
      requiredAssets: [
        'Video โฆษณาความยาว 15-60 วินาที (แนะนำ 30 วินาที)',
        'Hook ที่แข็งแกร่งใน 5 วินาทีแรกก่อน skip',
        'YouTube Channel ที่ verified',
        'Companion Banner (300x60px)',
        'CTA ที่ชัดเจนในวิดีโอ',
      ],
      tips: [
        '5 วินาทีแรกสำคัญที่สุด — ต้องดึงดูดความสนใจก่อนผู้ชม skip',
        'ใส่ Brand/Logo ภายใน 3 วินาทีแรกเสมอ',
        'ความยาวที่แนะนำคือ 15-30 วินาที สำหรับ awareness',
        'ทดสอบ Audience Targeting ต่างๆ: In-market, Custom Intent, Similar',
        'วัดผลด้วย View Rate, Brand Lift, Search Lift ไม่ใช่แค่ CPV',
      ],
    },
  },
  {
    id: 'youtube-bumper',
    type: 'YOUTUBE',
    name: 'YouTube Bumper 6s',
    description: 'โฆษณาวิดีโอ 6 วินาทีที่ skip ไม่ได้ เหมาะสำหรับ Reinforcement message และ Brand Recall โดยเฉพาะบน Mobile',
    icon: 'Timer',
    color: 'bg-pink-500',
    bestFor: ['Brand Recall', 'Mobile Reach', 'Frequency Building'],
    estimatedCPA: '฿1000–3000',
    difficulty: 'beginner',
    minBudget: 15000,
    defaults: {
      objective: 'AWARENESS',
      bidStrategy: 'Target CPM',
      networkHints: ['YouTube', 'Video Partners'],
      keyFeatures: [
        'Non-skippable 6 วินาที — ผู้ชมต้องดูจบทุกคน',
        'คิดเงินแบบ CPM (Cost Per Thousand Impressions)',
        'เหมาะสำหรับ Reminder message และ Frequency building',
        'มักใช้คู่กับ In-Stream เพื่อ reinforce message',
        'Reach สูงมากด้วย CPM ต่ำ',
      ],
      requiredAssets: [
        'Video ความยาวไม่เกิน 6 วินาที',
        'Message ที่กระชับ จำง่าย ใน 6 วินาที',
        'Brand Logo/Name ที่เห็นชัดเจน',
        'YouTube Channel',
      ],
      tips: [
        '6 วินาทีสั้นมาก — เลือก single message เดียว อย่าพยายามบอกหลายอย่าง',
        'ใช้ Bumper เพื่อ reinforce หลังจาก In-Stream campaign',
        'เหมาะสำหรับ Seasonal promotion หรือ Product reminder',
        'วัดผลด้วย Unique Reach และ Frequency',
        'ทดสอบ Message variants ต่างๆ เพื่อหา best performer',
      ],
    },
  },
  {
    id: 'demand-gen',
    type: 'DEMAND_GEN',
    name: 'Demand Gen',
    description: 'แคมเปญ AI-driven สำหรับ Discovery, YouTube Feed, Gmail และ YouTube Shorts สร้าง demand ใหม่ด้วย visual storytelling',
    icon: 'Sparkles',
    color: 'bg-fuchsia-500',
    bestFor: ['Visual Storytelling', 'New Audience', 'Social-like Ads'],
    estimatedCPA: '฿400–1000',
    difficulty: 'intermediate',
    minBudget: 20000,
    defaults: {
      objective: 'AWARENESS',
      bidStrategy: 'Maximize Clicks / Target CPA',
      networkHints: ['YouTube Feed', 'Discover', 'Gmail', 'YouTube Shorts'],
      keyFeatures: [
        'ครอบคลุม YouTube Shorts, YouTube Feed, Gmail, Discover',
        'รูปแบบ Carousel Ads รองรับหลาย product/story',
        'Lookalike Audiences จาก Customer Data',
        'AI จัดสรร Creative ที่เหมาะสมกับแต่ละ placement',
        'รองรับ Video และ Image assets พร้อมกัน',
      ],
      requiredAssets: [
        'รูปภาพ Landscape (1200x628) อย่างน้อย 3 รูป',
        'รูปภาพ Square (1200x1200) อย่างน้อย 3 รูป',
        'Video สำหรับ YouTube Shorts (9:16) แนะนำ',
        'Headlines และ Descriptions ที่น่าสนใจ',
        'Customer List สำหรับ Lookalike',
      ],
      tips: [
        'Creative คุณภาพสูงคือกุญแจ — ลงทุนกับ Visual assets',
        'ใช้ Carousel สำหรับ Storytelling หรือแสดงหลาย product',
        'Demand Gen เหมาะสำหรับ Upper-to-mid funnel',
        'ทดสอบ Lookalike vs In-market audience',
        'ใช้ Video Shorts format เพื่อ Reach กลุ่ม Gen Z',
      ],
    },
  },
  {
    id: 'app-campaign',
    type: 'APP_CAMPAIGN',
    name: 'App Campaign',
    description: 'แคมเปญสำหรับโปรโมต Mobile App ทั้ง iOS และ Android ครอบคลุม Search, Display, YouTube, Google Play Store อัตโนมัติ',
    icon: 'Smartphone',
    color: 'bg-cyan-500',
    bestFor: ['App Installs', 'App Engagement', 'In-app Actions'],
    estimatedCPA: '฿20–150 per install',
    difficulty: 'intermediate',
    minBudget: 15000,
    defaults: {
      objective: 'APP_INSTALLS',
      bidStrategy: 'Target CPI (Cost per Install) / Target CPA',
      networkHints: ['Google Search', 'Google Play', 'YouTube', 'Google Display Network'],
      keyFeatures: [
        'AI จัดการ Targeting และ Bidding ทั้งหมดอัตโนมัติ',
        'ครอบคลุมทุก Google Network ด้วย campaign เดียว',
        'รองรับ Deep Link สำหรับ Re-engagement',
        'App Conversion Tracking ผ่าน Firebase หรือ Third-party',
        'Creative Rotation อัตโนมัติตามผลลัพธ์',
      ],
      requiredAssets: [
        'App ที่ Published ใน Google Play หรือ App Store',
        'App Store URL',
        'Ad Text (Headlines) 4 ชุด',
        'Ad Text (Descriptions) 4 ชุด',
        'รูปภาพ Portrait และ Landscape',
        'Video App Preview (แนะนำอย่างยิ่ง)',
        'Firebase SDK หรือ conversion tracking ที่ตั้งค่าแล้ว',
      ],
      tips: [
        'ตั้งค่า Firebase Conversion Tracking ก่อนเริ่ม campaign',
        'ใช้ In-app events เป็น conversion goal ไม่ใช่แค่ install',
        'เพิ่ม Video assets เสมอ — มีผลต่อ performance อย่างมาก',
        'แยก campaign App Installs และ App Engagement ออกจากกัน',
        'ตั้ง CPI target ที่สมจริงจาก benchmark อุตสาหกรรม',
      ],
    },
  },
  {
    id: 'smart',
    type: 'SMART',
    name: 'Smart Campaign',
    description: 'แคมเปญอัตโนมัติสำหรับธุรกิจขนาดเล็กที่ต้องการความง่าย Google จัดการ Targeting, Bidding และ Ad Creation ให้อัตโนมัติ',
    icon: 'Bot',
    color: 'bg-amber-500',
    badge: 'เหมาะสำหรับมือใหม่',
    bestFor: ['ธุรกิจขนาดเล็ก', 'มือใหม่ Google Ads', 'ประหยัดเวลา'],
    estimatedCPA: '฿200–600',
    difficulty: 'beginner',
    minBudget: 5000,
    defaults: {
      objective: 'LEADS',
      bidStrategy: 'Maximize Conversions (Automated)',
      networkHints: ['Google Search', 'Google Display', 'Google Maps'],
      keyFeatures: [
        'Google จัดการทุกอย่างอัตโนมัติ — ง่ายมากสำหรับมือใหม่',
        'สร้าง Ad จาก Website และข้อมูลธุรกิจอัตโนมัติ',
        'Targeting ตาม Business Goals และ Location',
        'แสดงใน Search, Maps, Display พร้อมกัน',
        'ไม่ต้องการ keyword research เชิงลึก',
      ],
      requiredAssets: [
        'Business Name และ Website',
        'Business Location (สำหรับ Local)',
        'Phone Number',
        'Budget รายวัน',
        'Business Description (ไม่เกิน 90 ตัวอักษร)',
      ],
      tips: [
        'เหมาะสำหรับธุรกิจ Local ที่ต้องการลูกค้าในพื้นที่',
        'ควบคุมได้น้อยกว่า Standard campaign — เหมาะสำหรับผู้เริ่มต้น',
        'ตั้ง Conversion Goal ให้ชัดเจน: Phone calls, Form fills, Store visits',
        'ดูผลหลัง 2-4 สัปดาห์ก่อนปรับ budget',
        'เมื่อชำนาญแล้วแนะนำให้อัพเกรดเป็น Search campaign เพื่อควบคุมมากขึ้น',
      ],
    },
  },
]

export function getTemplateById(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id)
}

export const TEMPLATE_FILTERS = [
  { key: 'all',        label: 'ทั้งหมด' },
  { key: 'search',     label: 'Search' },
  { key: 'display',    label: 'Display' },
  { key: 'video',      label: 'Video' },
  { key: 'shopping',   label: 'Shopping' },
  { key: 'automation', label: 'Automation' },
] as const

export type TemplateFilterKey = typeof TEMPLATE_FILTERS[number]['key']

export function filterTemplates(templates: CampaignTemplate[], filter: TemplateFilterKey): CampaignTemplate[] {
  switch (filter) {
    case 'search':     return templates.filter((t) => t.type === 'SEARCH')
    case 'display':    return templates.filter((t) => t.type === 'DISPLAY')
    case 'video':      return templates.filter((t) => t.type === 'YOUTUBE')
    case 'shopping':   return templates.filter((t) => t.type === 'SHOPPING')
    case 'automation': return templates.filter((t) => ['PERFORMANCE_MAX', 'DEMAND_GEN', 'APP_CAMPAIGN', 'SMART'].includes(t.type))
    default:           return templates
  }
}
