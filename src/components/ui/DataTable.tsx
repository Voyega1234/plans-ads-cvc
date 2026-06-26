'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ColumnAlign = 'left' | 'right' | 'center'

export interface Column<T> {
  key: string
  label: string
  align?: ColumnAlign
  sortable?: boolean
  width?: string                         // e.g. "w-40"
  render?: (value: unknown, row: T) => React.ReactNode
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[]
  rows: T[]
  keyField?: string                      // field used as React key (default: first column key)
  pageSize?: number                      // default 10; set 0 to disable pagination
  searchable?: boolean                   // show search box
  selectable?: boolean                   // show checkboxes
  className?: string
  emptyMessage?: string
}

// ── Status badge helper (exported for reuse) ──────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  // Google Ads
  enabled:          'bg-green-100 text-green-700',
  paused:           'bg-yellow-100 text-yellow-700',
  removed:          'bg-red-100 text-red-600',
  ENABLED:          'bg-green-100 text-green-700',
  PAUSED:           'bg-yellow-100 text-yellow-700',
  REMOVED:          'bg-red-100 text-red-600',
  // Generic
  active:           'bg-green-100 text-green-700',
  completed:        'bg-green-100 text-green-700',
  Completed:        'bg-green-100 text-green-700',
  processing:       'bg-blue-100 text-blue-700',
  Processing:       'bg-blue-100 text-blue-700',
  'in progress':    'bg-blue-100 text-blue-700',
  'In Progress':    'bg-blue-100 text-blue-700',
  pending:          'bg-orange-100 text-orange-600',
  Pending:          'bg-orange-100 text-orange-600',
  cancelled:        'bg-red-100 text-red-600',
  Cancelled:        'bg-red-100 text-red-600',
  blocked:          'bg-red-100 text-red-600',
  Blocked:          'bg-red-100 text-red-600',
  failed:           'bg-red-100 text-red-600',
  running:          'bg-blue-100 text-blue-700',
  passed:           'bg-green-100 text-green-700',
  warning:          'bg-yellow-100 text-yellow-700',
  critical:         'bg-red-100 text-red-600',
  pushed:           'bg-purple-100 text-purple-700',
  // Campaign types
  SEARCH:           'bg-blue-100 text-blue-700',
  DISPLAY:          'bg-purple-100 text-purple-700',
  PERFORMANCE_MAX:  'bg-orange-100 text-orange-700',
  VIDEO:            'bg-pink-100 text-pink-700',
  SHOPPING:         'bg-teal-100 text-teal-700',
  DEMAND_GEN:       'bg-indigo-100 text-indigo-700',
}

export function StatusBadge({ value }: { value: string }) {
  const style = STATUS_STYLES[value] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={cn('inline-block text-xs font-medium px-2.5 py-1 rounded-full', style)}>
      {value}
    </span>
  )
}

// ── Main DataTable ────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  keyField,
  pageSize = 10,
  searchable = false,
  selectable = false,
  className,
  emptyMessage = 'No data',
}: DataTableProps<T>) {
  const [search,      setSearch]      = useState('')
  const [sortKey,     setSortKey]     = useState<string | null>(null)
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('asc')
  const [page,        setPage]        = useState(1)
  const [perPage,     setPerPage]     = useState(pageSize || 10)
  const [selected,    setSelected]    = useState<Set<string>>(new Set())

  const pk = keyField ?? columns[0]?.key ?? 'id'

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  }, [rows, search])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] as string | number
      const bv = b[sortKey] as string | number
      if (av === bv) return 0
      const gt = av > bv ? 1 : -1
      return sortDir === 'asc' ? gt : -gt
    })
  }, [filtered, sortKey, sortDir])

  // Paginate
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / perPage)) : 1
  const paginated  = pageSize > 0 ? sorted.slice((page - 1) * perPage, page * perPage) : sorted

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function toggleAll() {
    if (selected.size === paginated.length) setSelected(new Set())
    else setSelected(new Set(paginated.map((r) => String(r[pk]))))
  }

  function toggleRow(key: string) {
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Toolbar */}
      {(searchable || pageSize > 0) && (
        <div className="flex items-center justify-between mb-4 gap-4">
          {pageSize > 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              Show
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              >
                {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
          ) : <div />}

          {searchable && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 w-64"
              />
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {selectable && (
                  <th className="py-3.5 pl-4 pr-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === paginated.length && paginated.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'py-3.5 px-4 font-semibold text-gray-800',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      col.sortable && 'cursor-pointer select-none hover:text-gray-900',
                      col.width
                    )}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        sortKey === col.key
                          ? sortDir === 'asc'
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                          : <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="py-12 text-center text-gray-400 text-sm"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginated.map((row, i) => {
                  const rowKey = String(row[pk])
                  return (
                    <tr
                      key={rowKey || i}
                      className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      {selectable && (
                        <td className="py-4 pl-4 pr-3">
                          <input
                            type="checkbox"
                            checked={selected.has(rowKey)}
                            onChange={() => toggleRow(rowKey)}
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                          />
                        </td>
                      )}
                      {columns.map((col) => {
                        const val = row[col.key]
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              'py-4 px-4 text-gray-700',
                              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                            )}
                          >
                            {col.render
                              ? col.render(val, row)
                              : String(val ?? '—')
                            }
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pageSize > 0 && sorted.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            Showing {Math.min((page - 1) * perPage + 1, sorted.length)} to{' '}
            {Math.min(page * perPage, sorted.length)} of {sorted.length} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p = i + 1
              if (totalPages > 7) {
                const pages = [1, page - 1, page, page + 1, totalPages].filter((x) => x >= 1 && x <= totalPages)
                p = Array.from(new Set(pages)).sort((a, b) => a - b)[i] ?? i + 1
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-xl text-sm font-medium transition-colors',
                    page === p
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
