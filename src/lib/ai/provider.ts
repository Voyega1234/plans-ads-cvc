/**
 * Central AI provider — Vertex Gemini primary, Anthropic fallback.
 * All AI functions call callAI() instead of importing SDKs directly.
 *
 * Model tiers (set in .env.local):
 *   AI_MODEL_QUALITY  = quality tasks: media plan, ad copy, chat, morning brief
 *   AI_MODEL_STANDARD = standard tasks: campaign builder, keyword research, QA, audience
 */

import { generateVertexText, hasVertexOidcConfig } from '@/lib/ai/vertex'

export type AIProvider = 'vertex' | 'anthropic' | 'openai' | 'mock'
export type AITier = 'quality' | 'standard'

const DEFAULT_QUALITY = 'gemini-3.5-flash'
const DEFAULT_STANDARD = 'gemini-3.5-flash'

// Gemini 3.5 Flash pricing (USD per 1M tokens) — update when Google changes pricing
const GEMINI_PRICE_INPUT = 0.075 // $0.075 per 1M input tokens
const GEMINI_PRICE_OUTPUT = 0.3 // $0.30 per 1M output tokens

export function getModel(tier: AITier = 'standard'): string {
  if (tier === 'quality') {
    return process.env.AI_MODEL_QUALITY ?? DEFAULT_QUALITY
  }
  return process.env.AI_MODEL_STANDARD ?? DEFAULT_STANDARD
}

export function getProvider(): AIProvider {
  if (process.env.MOCK_AI === 'true') return 'mock'
  if (hasVertexOidcConfig()) return 'vertex'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'mock'
}

export function isRealAI(): boolean {
  return getProvider() !== 'mock'
}

interface CallAIOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  tier?: AITier
  useGrounding?: boolean // Enable Google Search grounding for real-world data
  // Cost tracking context (optional — best-effort, never throws)
  _route?: string
  _userId?: string
  _mediaPlanId?: string
}

export async function logAiCost(opts: {
  route: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedUSD: number
  userId?: string
  mediaPlanId?: string
}) {
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.aiCostLog.create({
      data: {
        route: opts.route,
        model: opts.model,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        totalTokens: opts.inputTokens + opts.outputTokens,
        estimatedUSD: opts.estimatedUSD,
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.mediaPlanId ? { mediaPlanId: opts.mediaPlanId } : {}),
      },
    })
  } catch {
    // Cost logging is best-effort — never break the main flow
  }
}

/**
 * Call the configured AI provider and return the response text.
 * Always returns valid JSON string when the prompt asks for JSON.
 */
export async function callAI(userPrompt: string, options: CallAIOptions = {}): Promise<string> {
  const {
    temperature = 0.3,
    maxTokens = 65536,
    systemPrompt,
    tier = 'standard',
    useGrounding = false,
    _route = 'unknown',
    _userId,
    _mediaPlanId,
  } = options
  const provider = getProvider()
  const modelName = getModel(tier)

  const defaultSystem =
    'You are an expert Google Ads specialist for the Thai market. Always respond with valid JSON only — no markdown, no code fences, no explanation outside the JSON object.'

  if (provider === 'vertex') {
    const result = await generateVertexText({
      model: modelName,
      system: systemPrompt ?? defaultSystem,
      prompt: userPrompt,
      temperature,
      maxOutputTokens: maxTokens,
      useGrounding,
    })

    const inp = result.usage.inputTokens ?? 0
    const out = result.usage.outputTokens ?? 0
    if (inp > 0 || out > 0) {
      const usd = (inp / 1_000_000) * GEMINI_PRICE_INPUT + (out / 1_000_000) * GEMINI_PRICE_OUTPUT
      void logAiCost({
        route: _route,
        model: modelName,
        inputTokens: inp,
        outputTokens: out,
        estimatedUSD: usd,
        userId: _userId,
        mediaPlanId: _mediaPlanId,
      })
    }

    let text = result.text.trim()
    if (text.startsWith('```')) {
      text = text
        .replace(/^```[a-z]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
    }
    const jsonStart = text.indexOf('{')
    if (jsonStart > 0) text = text.slice(jsonStart)

    return text
  }

  if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const msg = await client.messages.create({
      model: modelName,
      max_tokens: maxTokens,
      system: systemPrompt ?? defaultSystem,
      messages: [{ role: 'user', content: userPrompt }],
      temperature,
    })

    const inp = msg.usage.input_tokens
    const out = msg.usage.output_tokens
    // Anthropic pricing varies by model; use conservative estimate
    const usd = (inp / 1_000_000) * 3.0 + (out / 1_000_000) * 15.0
    void logAiCost({
      route: _route,
      model: modelName,
      inputTokens: inp,
      outputTokens: out,
      estimatedUSD: usd,
      userId: _userId,
      mediaPlanId: _mediaPlanId,
    })

    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Anthropic response type')

    let text = block.text.trim()
    if (text.startsWith('```')) {
      text = text
        .replace(/^```[a-z]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
    }
    const jsonStart = text.indexOf('{')
    if (jsonStart > 0) text = text.slice(jsonStart)

    return text
  }

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const messages: { role: 'system' | 'user'; content: string }[] = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    })

    const inp = response.usage?.prompt_tokens ?? 0
    const out = response.usage?.completion_tokens ?? 0
    const usd = (inp / 1_000_000) * 5.0 + (out / 1_000_000) * 15.0
    void logAiCost({
      route: _route,
      model: 'gpt-4o',
      inputTokens: inp,
      outputTokens: out,
      estimatedUSD: usd,
      userId: _userId,
      mediaPlanId: _mediaPlanId,
    })

    return response.choices[0]?.message?.content ?? '{}'
  }

  throw new Error('No AI provider available — configure Vertex OIDC or set ANTHROPIC_API_KEY')
}

/**
 * Safe AI parse: calls AI, parses JSON, validates with schema.
 * Falls back to mockFn() if parsing or validation fails.
 */
export async function safeCallAI<T>(
  prompt: string,
  validate: (raw: unknown) => T | null,
  mockFn: () => T | Promise<T>,
  options?: CallAIOptions
): Promise<T> {
  if (!isRealAI()) return mockFn()

  try {
    const raw = await callAI(prompt, options)
    const json = JSON.parse(raw)
    const result = validate(json)
    if (result !== null) return result
    console.warn('[AI] Validation failed, falling back to mock')
    return mockFn()
  } catch (err) {
    console.error(
      '[AI] callAI error, falling back to mock:',
      err instanceof Error ? err.message : err
    )
    return mockFn()
  }
}
