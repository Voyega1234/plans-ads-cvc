import AppShell from '@/components/layout/AppShell'
import BriefForm from '@/components/brief/BriefForm'

interface Props {
  searchParams: { mode?: string }
}

export default function NewBriefPage({ searchParams }: Props) {
  const mode = searchParams.mode

  const modeLabels: Record<string, string> = {
    'media-plan': 'สร้าง Media Plan',
    'campaign-builder': 'Build Campaign อัตโนมัติ',
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {modeLabels[mode ?? ''] ?? 'New Brief'}
          </h1>
          <p className="text-gray-500 mt-1">
            กรอกข้อมูลธุรกิจและแคมเปญ AI จะสร้าง Media Plan ให้โดยอัตโนมัติ
          </p>
        </div>
        <BriefForm mode={mode} />
      </div>
    </AppShell>
  )
}
