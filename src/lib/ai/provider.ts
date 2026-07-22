/**
 * Central AI provider — Gemini primary, Anthropic fallback.
 * All AI functions call callAI() instead of importing SDKs directly.
 *
 * Model tiers (set in .env.local):
 *   AI_MODEL_QUALITY  = quality tasks: media plan, ad copy, chat, morning brief
 *   AI_MODEL_STANDARD = standard tasks: campaign builder, keyword research, QA, audience
 */

import { isVertexConfigured, getVertexAccessToken, VERTEX_LOCATION, VERTEX_PROJECT } from './vertex-auth'

export type AIProvider = 'vertex' | 'gemini' | 'anthropic' | 'openai' | 'mock'
export type AITier = 'quality' | 'standard'

const DEFAULT_QUALITY  = 'gemini-3.5-flash'
const DEFAULT_STANDARD = 'gemini-3.5-flash'

// Gemini 3.5 Flash pricing (USD per 1M tokens) — update when Google changes pricing
const GEMINI_PRICE_INPUT  = 0.075  // $0.075 per 1M input tokens
const GEMINI_PRICE_OUTPUT = 0.30   // $0.30 per 1M output tokens
const AI_PROJECT_LABEL = 'mercy'

export function getModel(tier: AITier = 'standard'): string {
  if (tier === 'quality') {
    return process.env.AI_MODEL_QUALITY ?? DEFAULT_QUALITY
  }
  return process.env.AI_MODEL_STANDARD ?? DEFAULT_STANDARD
}

export function getProvider(): AIProvider {
  if (process.env.MOCK_AI === 'true') return 'mock'
  if (isVertexConfigured()) return 'vertex'          // OIDC (Vercel WIF → Vertex AI) — ไม่ต้องมี key
  if (process.env.GEMINI_API_KEY) return 'gemini'
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
  useGrounding?: boolean  // Enable Google Search grounding for real-world data
  // Cost tracking context (optional — best-effort, never throws)
  _route?: string
  _userId?: string
  _mediaPlanId?: string
  _feature?: string
  _subfeature?: string
}

export interface AiUsageLabels {
  project: string
  provider: string
  feature: string
  subfeature: string
  label: string
}

function labelValue(raw: string | undefined, fallback: string) {
  const value = (raw || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63)
  return value || fallback
}

function routeLabels(route: string) {
  const parts = route.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  return {
    feature: labelValue(parts[0], 'unknown'),
    subfeature: labelValue(parts.slice(1).join('_') || parts[0], 'unknown'),
  }
}

export function buildAiUsageLabels(opts: {
  route: string
  model: string
  provider?: string
  feature?: string
  subfeature?: string
}): AiUsageLabels {
  const derived = routeLabels(opts.route)
  const provider = labelValue(opts.provider ?? (opts.model.includes(':') ? opts.model.split(':')[0] : 'unknown'), 'unknown')
  const feature = labelValue(opts.feature, derived.feature)
  const subfeature = labelValue(opts.subfeature, derived.subfeature)
  const label = [AI_PROJECT_LABEL, provider, feature, subfeature].join('_').slice(0, 63)

  return { project: AI_PROJECT_LABEL, provider, feature, subfeature, label }
}

export async function logAiCost(opts: {
  route: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedUSD: number
  userId?: string
  mediaPlanId?: string
  provider?: string
  feature?: string
  subfeature?: string
}) {
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.aiCostLog.create({
      data: {
        route:        opts.route,
        model:        opts.model,
        inputTokens:  opts.inputTokens,
        outputTokens: opts.outputTokens,
        totalTokens:  opts.inputTokens + opts.outputTokens,
        estimatedUSD: opts.estimatedUSD,
        ...(opts.userId     ? { userId:     opts.userId }     : {}),
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
export async function callAI(
  userPrompt: string,
  options: CallAIOptions = {}
): Promise<string> {
  const { temperature = 0.3, maxTokens = 65536, systemPrompt, tier = 'standard', useGrounding = false,
    _route = 'unknown', _userId, _mediaPlanId } = options
  const provider = getProvider()
  const modelName = getModel(tier)

  const defaultSystem = 'You are an expert Google Ads specialist for the Thai market. Always respond with valid JSON only — no markdown, no code fences, no explanation outside the JSON object.'

  if (provider === 'vertex') {
    // Vertex AI ผ่าน OIDC — model id เดียวกับ Gemini API, request/response shape เดียวกัน
    const token = await getVertexAccessToken()
    const url = `https://${VERTEX_LOCATION()}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT()}/locations/${VERTEX_LOCATION()}/publishers/google/models/${modelName}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt ?? defaultSystem }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        ...(useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(useGrounding ? {} : { responseMimeType: 'application/json' }),
        },
      }),
    })
    if (!res.ok) throw new Error(`Vertex AI ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const usage = data.usageMetadata
    if (usage) {
      const inp = usage.promptTokenCount ?? 0
      const out = usage.candidatesTokenCount ?? 0
      const usd = (inp / 1_000_000) * GEMINI_PRICE_INPUT + (out / 1_000_000) * GEMINI_PRICE_OUTPUT
      void logAiCost({ route: _route, model: `vertex:${modelName}`, inputTokens: inp, outputTokens: out, estimatedUSD: usd, userId: _userId, mediaPlanId: _mediaPlanId })
    }
    let text = (data.candidates?.[0]?.content?.parts ?? []).map(pt => pt.text ?? '').join('').trim()
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    }
    const jsonStart = text.indexOf('{')
    if (jsonStart > 0) text = text.slice(jsonStart)
    return text
  }

  if (provider === 'gemini') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt ?? defaultSystem,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(useGrounding ? { tools: [{ googleSearch: {} } as any] } : {}),
    })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(useGrounding ? {} : { responseMimeType: 'application/json' }),
      },
    })

    // Capture token usage from Gemini response
    const usage = result.response.usageMetadata
    if (usage) {
      const inp  = usage.promptTokenCount    ?? 0
      const out  = usage.candidatesTokenCount ?? 0
      const usd  = (inp / 1_000_000) * GEMINI_PRICE_INPUT + (out / 1_000_000) * GEMINI_PRICE_OUTPUT
      void logAiCost({ route: _route, model: modelName, inputTokens: inp, outputTokens: out, estimatedUSD: usd, userId: _userId, mediaPlanId: _mediaPlanId })
    }

    let text = result.response.text().trim()
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    }
    const jsonStart = text.indexOf('{')
    if (jsonStart > 0) text = text.slice(jsonStart)

    return text
  }

  if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const msg = await client.messages.create({
      model:      modelName,
      max_tokens: maxTokens,
      system:     systemPrompt ?? defaultSystem,
      messages:   [{ role: 'user', content: userPrompt }],
      temperature,
    })

    const inp = msg.usage.input_tokens
    const out = msg.usage.output_tokens
    // Anthropic pricing varies by model; use conservative estimate
    const usd = (inp / 1_000_000) * 3.0 + (out / 1_000_000) * 15.0
    void logAiCost({ route: _route, model: modelName, inputTokens: inp, outputTokens: out, estimatedUSD: usd, userId: _userId, mediaPlanId: _mediaPlanId })

    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Anthropic response type')

    let text = block.text.trim()
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
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
      model:           'gpt-4o',
      messages,
      temperature,
      max_tokens:      maxTokens,
      response_format: { type: 'json_object' },
    })

    const inp = response.usage?.prompt_tokens    ?? 0
    const out = response.usage?.completion_tokens ?? 0
    const usd = (inp / 1_000_000) * 5.0 + (out / 1_000_000) * 15.0
    void logAiCost({ route: _route, model: 'gpt-4o', inputTokens: inp, outputTokens: out, estimatedUSD: usd, userId: _userId, mediaPlanId: _mediaPlanId })

    return response.choices[0]?.message?.content ?? '{}'
  }

  throw new Error('No AI provider available — set GEMINI_API_KEY')
}

/**
 * Safe AI parse: calls AI, parses JSON, validates with schema.
 * Falls back to mockFn() if parsing or validation fails.
 */
// Extract the first complete JSON value (object or array) from a model response.
// Gemini often appends prose/fence remnants AFTER the JSON, which makes a bare
// JSON.parse throw "Unexpected non-whitespace character after JSON".
function extractJson(raw: string): string {
  const s = raw.trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart)
  if (start < 0) return s
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; continue }
    if (inStr) {
      if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return s.slice(start, i + 1) }
  }
  return s.slice(start)
}

export async function safeCallAI<T>(
  prompt: string,
  validate: (raw: unknown) => T | null,
  mockFn: () => T | Promise<T>,
  options?: CallAIOptions
): Promise<T> {
  if (!isRealAI()) return mockFn()

  try {
    const raw = await callAI(prompt, options)

    // Attempt 1: first balanced JSON value (survives trailing prose/fences)
    try {
      const result = validate(JSON.parse(extractJson(raw)))
      if (result !== null) return result
    } catch { /* fall through to array-repair attempt */ }

    // Attempt 2: callAI slices leading text up to the first '{' — an ARRAY response
    // ("[{...},{...}]") arrives decapitated as "{...},{...}]". Restore the bracket.
    if (raw.trimStart().startsWith('{') && raw.trimEnd().endsWith(']')) {
      try {
        const result = validate(JSON.parse(extractJson('[' + raw)))
        if (result !== null) return result
      } catch { /* fall through to mock */ }
    }

    // Real provider IS configured but the response was invalid. Per the production
    // rule we NEVER serve mock/fake AI data when live — surface a clear error instead.
    throw new Error('AI ตอบกลับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
  } catch (err) {
    // No mock fallback in production (real provider). Local dev (no provider) already
    // returned mockFn() at the top, so this only fires when a real AI call failed.
    console.error('[AI] real provider call failed (no mock fallback):', err instanceof Error ? err.message : err)
    throw err instanceof Error ? err : new Error('AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่')
  }
}
