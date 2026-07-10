'use client'

/**
 * Market Share / Visibility Share — จาก Google Ads Impression Share
 * โมดูลแยกอิสระ: fetch เอง render เอง — ไม่กระทบ report เดิม
 * หมายเหตุความหมาย: นี่คือ Visibility/Auction Share ไม่ใช่ส่วนแบ่งตลาดจริงของธุรกิจ
 */

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, AlertTriangle, Copy, CheckCircle2, TrendingUp, TrendingDown, PieChart } from 'lucide-react'

interface ChannelIS {
  impressionShare: number
  lostBudget: number
  lostRank: number
  topShare: number | null
  absTopShare: number | null
  impressions: number
  campaigns: number
}
interface MSCampaign {
  name: string; channel: string; impressions: number
  impressionShare: number | null; lostBudget: number | null; lostRank: number | null
  topShare: number | null; absTopShare: number | null
}
interface MSData {
  overview: { search: ChannelIS | null; display: ChannelIS | null } | null
  prev: { search: ChannelIS | null; display: ChannelIS | null } | null
  campaigns: MSCampaign[]
  aiSummary: string
  recommendations: string[]
  unavailable: string[]
}

const MUTED = { teal: '#5B9E92', clay: '#DD8E63', slate: '#8FA3B0', rose: '#D08C8C', sand: '#C9AF6E' }

const pct = (v: number | null | undefined) =>
  v == null ? 'N/A' : v <= 0.1 && v >= 0.0999 ? '< 10%' : `${(v * 100).toFixed(1)}%`

function Bar({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="w-full h-2 bg-[#F3F5F4] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value ?? 0) * 100)}%`, background: color }} />
    </div>
  )
}

function Trend({ now, before }: { now: number | null | undefined; before: number | null | undefined }) {
  if (now == null || before == null || before === 0) return null
  const diff = (now - before) * 100
  if (Math.abs(diff) < 0.5) return <span className="text-[10px] text-gray-400">คงที่</span>
  const up = diff > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold', up ? 'text-emerald-600' : 'text-red-500')}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{diff.toFixed(1)} pt vs ช่วงก่อน
    </span>
  )
}

export default function MarketShareSection({ customerId, dateRange }: { customerId: string; dateRange: string }) {
  const [data, setData] = useState<MSData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setLoading(true); setError(null)
    fetch(`/api/reports/market-share?customerId=${customerId}&dateRange=${dateRange}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`); return d })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [customerId, dateRange])

  if (!customerId) return null

  const s = data?.overview?.search
  const d = data?.overview?.display

  return (
    <div className="bg-white border border-[#ECEFEE] rounded-2xl p-5 space-y-4 shadow-[0_1px_3px_rgba(61,72,82,0.04)]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-[#3D4852] flex items-center gap-2">
            <PieChart className="w-4 h-4" style={{ color: MUTED.teal }} /> Market Share (Visibility Share)
          </p>
          <p className="text-[11px] text-[#A3ADB8] mt-0.5">ส่วนแบ่งการมองเห็นจาก Google Ads Impression Share — ไม่ใช่ส่วนแบ่งตลาดจริงของธุรกิจ</p>
        </div>
        {data?.aiSummary && (
          <button
            onClick={async () => { try { await navigator.clipboard.writeText(data.aiSummary); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* noop */ } }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {copied ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Summary</>}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังดึง Impression Share...
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Overview cards */}
          {(s || d) ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {s && (
                <>
                  <div className="rounded-xl p-3.5" style={{ background: '#EDF4F2' }}>
                    <p className="text-[10px] font-bold text-[#93A1AB] uppercase tracking-wide">Search Impr. Share</p>
                    <p className="text-xl font-extrabold mt-1" style={{ color: MUTED.teal }}>{pct(s.impressionShare)}</p>
                    <Trend now={s.impressionShare} before={data.prev?.search?.impressionShare} />
                    <div className="mt-2"><Bar value={s.impressionShare} color={MUTED.teal} /></div>
                  </div>
                  <div className="rounded-xl p-3.5 bg-[#FAF6F0]">
                    <p className="text-[10px] font-bold text-[#93A1AB] uppercase tracking-wide">Lost IS (Budget)</p>
                    <p className="text-xl font-extrabold mt-1" style={{ color: MUTED.clay }}>{pct(s.lostBudget)}</p>
                    <div className="mt-2"><Bar value={s.lostBudget} color={MUTED.clay} /></div>
                  </div>
                  <div className="rounded-xl p-3.5 bg-[#FAF0F0]">
                    <p className="text-[10px] font-bold text-[#93A1AB] uppercase tracking-wide">Lost IS (Rank)</p>
                    <p className="text-xl font-extrabold mt-1" style={{ color: MUTED.rose }}>{pct(s.lostRank)}</p>
                    <div className="mt-2"><Bar value={s.lostRank} color={MUTED.rose} /></div>
                  </div>
                  <div className="rounded-xl p-3.5 bg-[#F2F4F6]">
                    <p className="text-[10px] font-bold text-[#93A1AB] uppercase tracking-wide">Top Impr. Share</p>
                    <p className="text-xl font-extrabold mt-1" style={{ color: MUTED.slate }}>{pct(s.topShare)}</p>
                    <p className="text-[10px] text-[#A3ADB8] mt-1">Abs. Top {pct(s.absTopShare)}</p>
                  </div>
                </>
              )}
              <div className="rounded-xl p-3.5 bg-[#F7F5EF]">
                <p className="text-[10px] font-bold text-[#93A1AB] uppercase tracking-wide">Display Impr. Share</p>
                <p className="text-xl font-extrabold mt-1" style={{ color: MUTED.sand }}>{d ? pct(d.impressionShare) : 'N/A'}</p>
                {d && <div className="mt-2"><Bar value={d.impressionShare} color={MUTED.sand} /></div>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">ไม่มีข้อมูล Impression Share ในช่วงนี้ (แคมเปญไม่มี impressions หรือเป็น PMax)</p>
          )}

          {/* AI summary */}
          {data.aiSummary && (
            <div className="rounded-xl border border-[#DFEAE7] bg-[#F7FAF9] p-4">
              <p className="text-[10px] font-bold text-[#5B9E92] uppercase tracking-wide mb-1.5">สรุปสำหรับรายงานลูกค้า</p>
              <p className="text-sm text-[#3D4852] leading-relaxed">{data.aiSummary}</p>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-[#93A1AB] uppercase tracking-wide">Recommendations</p>
              {data.recommendations.map((r, i) => (
                <p key={i} className="text-xs text-[#3D4852] flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: MUTED.teal }} />{r}
                </p>
              ))}
            </div>
          )}

          {/* Campaign-level table */}
          {data.campaigns.length > 0 && (
            <div className="overflow-x-auto border border-[#EEF1F0] rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#FBFCFB] text-left text-[10px] text-[#93A1AB] uppercase tracking-wide">
                    <th className="px-3 py-2">Campaign</th>
                    <th className="px-3 py-2 text-right">Impr.</th>
                    <th className="px-3 py-2 text-right">Impr. Share</th>
                    <th className="px-3 py-2 text-right">Lost (Budget)</th>
                    <th className="px-3 py-2 text-right">Lost (Rank)</th>
                    <th className="px-3 py-2 text-right">Top</th>
                    <th className="px-3 py-2 text-right">Abs. Top</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F5F4]">
                  {data.campaigns.map((c, i) => (
                    <tr key={i} className="hover:bg-[#FBFCFB]">
                      <td className="px-3 py-2 max-w-[260px]">
                        <p className="truncate text-[#3D4852] font-medium">{c.name}</p>
                        <p className="text-[10px] text-[#A3ADB8]">{c.channel}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: MUTED.teal }}>{pct(c.impressionShare)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: MUTED.clay }}>{pct(c.lostBudget)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: MUTED.rose }}>{pct(c.lostRank)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(c.topShare)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(c.absTopShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Unavailable metrics */}
          {data.unavailable.length > 0 && (
            <p className="text-[10px] text-[#A3ADB8]">
              Metric ที่ไม่มีข้อมูล: {data.unavailable.join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
