import { formatCurrency } from '@/lib/utils'
import { DataTable, StatusBadge, type Column } from '@/components/ui/DataTable'

interface Campaign {
  name: string
  type: string
  status: string
  budget: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpa: number
}

type Row = Campaign & Record<string, unknown>

const columns: Column<Row>[] = [
  { key: 'name',        label: 'Campaign',    sortable: true,  render: (v) => <span className="font-semibold text-gray-900">{String(v)}</span> },
  { key: 'type',        label: 'Type',        sortable: true,  render: (v) => <StatusBadge value={String(v)} /> },
  { key: 'status',      label: 'Status',      sortable: true,  render: (v) => <StatusBadge value={String(v)} /> },
  { key: 'budget',      label: 'Budget/mo',   align: 'right',  sortable: true, render: (v) => formatCurrency(Number(v)) },
  { key: 'impressions', label: 'Impressions', align: 'right',  sortable: true, render: (v) => Number(v).toLocaleString() },
  { key: 'clicks',      label: 'Clicks',      align: 'right',  sortable: true, render: (v) => Number(v).toLocaleString() },
  { key: 'conversions', label: 'Conv.',       align: 'right',  sortable: true, render: (v) => <span className="font-semibold text-gray-900">{String(v)}</span> },
  { key: 'ctr',         label: 'CTR',         align: 'right',  sortable: true, render: (v) => `${Number(v).toFixed(2)}%` },
  { key: 'cpa',         label: 'CPA',         align: 'right',  sortable: true, render: (v) => formatCurrency(Number(v)) },
]

export default function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div className="px-5 py-4">
      <DataTable<Row>
        columns={columns}
        rows={campaigns as Row[]}
        keyField="name"
        searchable
        pageSize={10}
        emptyMessage="ยังไม่มีข้อมูล campaign"
      />
    </div>
  )
}
