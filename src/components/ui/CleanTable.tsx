'use client'

import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react'

interface CleanTableProps {
  headers: string[]
  rows: (string | React.ReactNode)[][]
  searchable?: boolean
  pagination?: boolean
  pageSize?: number
}

function StatusPill({ value }: { value: string }) {
  const styles: Record<string, string> = {
    active:      'bg-emerald-50 text-emerald-700',
    enabled:     'bg-emerald-50 text-emerald-700',
    completed:   'bg-emerald-50 text-emerald-700',
    connected:   'bg-emerald-50 text-emerald-700',
    firing:      'bg-emerald-50 text-emerald-700',
    ready:       'bg-emerald-50 text-emerald-700',
    processing:  'bg-blue-50 text-blue-700',
    pending:     'bg-amber-50 text-amber-700',
    draft:       'bg-neutral-100 text-neutral-600',
    limited:     'bg-amber-50 text-amber-700',
    warning:     'bg-amber-50 text-amber-700',
    blocked:     'bg-red-50 text-red-700',
    error:       'bg-red-50 text-red-700',
    paused:      'bg-neutral-100 text-neutral-500',
    rejected:    'bg-red-50 text-red-700',
    approved:    'bg-emerald-50 text-emerald-700',
    sent:        'bg-blue-50 text-blue-700',
    high:        'bg-red-50 text-red-700',
    medium:      'bg-amber-50 text-amber-700',
    low:         'bg-neutral-100 text-neutral-600',
    missing:     'bg-red-50 text-red-700',
  }
  const key = value.toLowerCase()
  const cls = styles[key] ?? 'bg-neutral-100 text-neutral-600'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {value}
    </span>
  )
}

const STATUS_WORDS = new Set([
  'active', 'enabled', 'completed', 'connected', 'firing', 'ready',
  'processing', 'pending', 'draft', 'limited', 'warning', 'blocked',
  'error', 'paused', 'rejected', 'approved', 'sent', 'high', 'medium', 'low', 'missing',
])

function renderCell(cell: string | React.ReactNode): React.ReactNode {
  if (typeof cell !== 'string') return cell
  if (STATUS_WORDS.has(cell.toLowerCase())) return <StatusPill value={cell} />
  return cell
}

export default function CleanTable({
  headers,
  rows,
  searchable = false,
  pagination = false,
  pageSize = 10,
}: CleanTableProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(pageSize)

  const filtered = search
    ? rows.filter((row) =>
        row.some((cell) => typeof cell === 'string' && cell.toLowerCase().includes(search.toLowerCase()))
      )
    : rows

  const totalPages = Math.ceil(filtered.length / perPage)
  const paged = pagination ? filtered.slice(page * perPage, (page + 1) * perPage) : filtered

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span>Show</span>
            <div className="relative">
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0) }}
                className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none"
              >
                {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
            <span>entries</span>
          </div>
          <div className="relative w-full sm:w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-300"
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-white text-left">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, ri) => (
                <tr key={ri} className="border-b border-neutral-100 last:border-0 hover:bg-gray-50/60 transition-colors">
                  {headers.map((header, ci) => {
                    const cell = header === 'Actions'
                      ? <button className="p-1 rounded hover:bg-neutral-100 transition-colors"><MoreHorizontal size={15} className="text-neutral-400" /></button>
                      : row[ci]
                    return (
                      <td key={ci} className="px-4 py-3 text-neutral-700 align-middle">
                        {renderCell(cell as string | React.ReactNode)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={headers.length} className="px-4 py-10 text-center text-sm text-neutral-400">
                    No results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div>
            Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-neutral-200 bg-white disabled:opacity-40"
            >
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium ${
                    p === page
                      ? 'bg-neutral-950 text-white'
                      : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-gray-50'
                  }`}
                >
                  {p + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-neutral-200 bg-white disabled:opacity-40"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
