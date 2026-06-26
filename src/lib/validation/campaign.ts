import { z } from 'zod'

export const adCopySchema = z.object({
  headline1: z.string().max(30, 'Headline 1 ต้องไม่เกิน 30 ตัวอักษร'),
  headline2: z.string().max(30, 'Headline 2 ต้องไม่เกิน 30 ตัวอักษร'),
  headline3: z.string().max(30, 'Headline 3 ต้องไม่เกิน 30 ตัวอักษร'),
  description1: z.string().max(90, 'Description 1 ต้องไม่เกิน 90 ตัวอักษร'),
  description2: z.string().max(90, 'Description 2 ต้องไม่เกิน 90 ตัวอักษร'),
  finalUrl: z.string().url('Final URL ไม่ถูกต้อง'),
  displayPath: z.string().optional(),
})

export const adGroupSchema = z.object({
  adGroupName: z.string().min(1, 'ชื่อ Ad Group ต้องไม่ว่างเปล่า'),
  defaultBid: z.number().min(0),
  keywords: z.array(z.string()),
  matchTypes: z.array(z.string()),
  ads: z.array(adCopySchema),
})

export const campaignSchema = z.object({
  campaignName: z.string().min(1, 'ชื่อ Campaign ต้องไม่ว่างเปล่า'),
  campaignType: z.enum(['SEARCH', 'DISPLAY', 'VIDEO', 'PERFORMANCE_MAX', 'SHOPPING']),
  status: z.enum(['ENABLED', 'PAUSED']),
  budget: z.number().min(100, 'งบประมาณรายวันขั้นต่ำ ฿100'),
  bidStrategy: z.string(),
  locationTargets: z.array(z.string()),
  languageTargets: z.array(z.string()),
  adGroups: z.array(adGroupSchema),
})

export const pushBlueprintSchema = z.object({
  blueprintId: z.string().min(1, 'Blueprint ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  mode: z.enum(['PAUSED', 'ENABLED']).default('PAUSED'),
})
