import { z } from 'zod'

export const briefSchema = z.object({
  businessName: z.string().min(2, 'ชื่อธุรกิจต้องมีอย่างน้อย 2 ตัวอักษร'),
  websiteUrl: z.string().url('URL ไม่ถูกต้อง กรุณาระบุ https://...'),
  productService: z.string().min(10, 'กรุณาอธิบายสินค้า/บริการอย่างน้อย 10 ตัวอักษร'),
  objective: z.enum(['LEADS', 'SALES', 'AWARENESS', 'TRAFFIC', 'APP_INSTALLS'], {
    errorMap: () => ({ message: 'กรุณาเลือกวัตถุประสงค์' }),
  }),
  monthlyBudget: z
    .number({ invalid_type_error: 'กรุณาระบุงบประมาณ' })
    .min(1, 'กรุณาระบุงบประมาณรายเดือน'),
  currency: z.string().default('THB'),
  targetLocation: z.string().min(2, 'กรุณาระบุพื้นที่เป้าหมาย'),
  language: z.string().default('th'),
  targetAudience: z.string().min(10, 'กรุณาอธิบายกลุ่มเป้าหมายอย่างน้อย 10 ตัวอักษร'),
  conversionGoal: z.string().min(5, 'กรุณาระบุเป้าหมาย Conversion'),
  promotion: z.string().optional(),
  brandTone: z.string().optional(),
  duration: z.string().optional(),
  launchDate: z.string().optional(),
  notes: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  ga4MeasurementId: z.string().optional(),
  gtmContainerId: z.string().optional(),
  adsConversionId: z.string().optional(),
  adsConversionLabel: z.string().optional(),
  googleAdsCustomerId: z.string().optional(),
  isNewAccount: z.boolean().optional(),
})

export type BriefInput = z.infer<typeof briefSchema>
