import { isMockMode } from './client'
import { mockGenerateKeywordIdeas } from './mock'

export async function generateKeywordIdeas(keywords: string[], customerId: string) {
  if (isMockMode()) {
    return mockGenerateKeywordIdeas(keywords, customerId)
  }
  throw new Error('Real Google Ads Keyword Planner API not configured.')
}

export async function getKeywordHistoricalMetrics(keywords: string[], customerId: string) {
  if (isMockMode()) {
    return mockGenerateKeywordIdeas(keywords, customerId)
  }
  throw new Error('Real Google Ads Keyword Planner API not configured.')
}
