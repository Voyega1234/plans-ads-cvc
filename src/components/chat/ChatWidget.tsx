'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, Send, Bot, Minimize2, Maximize2,
  ChevronDown, Trash2, Globe, Paperclip,
  FileText, ImageIcon, FileSpreadsheet, Plus, RefreshCw,
  Sparkles, WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttachedFile {
  name: string; type: string; size: number; content: string; mimeType: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  files?: AttachedFile[]
  model?: string
}

interface Account {
  id: string; name: string; currencyCode?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-3.5 h-3.5" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel')) return <FileSpreadsheet className="w-3.5 h-3.5" />
  return <FileText className="w-3.5 h-3.5" />
}
function fileSizeStr(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

async function readFile(file: File): Promise<AttachedFile> {
  const mimeType = file.type || 'application/octet-stream'
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    mimeType.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file, 'utf-8')
  })
  return { name: file.name, type: file.type, size: file.size, content, mimeType }
}

// ── FileChip ──────────────────────────────────────────────────────────────────

function FileChip({ file, onRemove }: { file: AttachedFile; onRemove?: () => void }) {
  const isImage = file.mimeType.startsWith('image/')
  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs max-w-[180px]',
      onRemove ? 'bg-blue-700 text-blue-100' : 'bg-gray-100 text-gray-600'
    )}>
      {isImage && file.content.startsWith('data:')
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={file.content} alt={file.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
        : <span className={onRemove ? 'text-blue-200' : 'text-gray-400'}>{fileIcon(file.mimeType)}</span>
      }
      <span className="truncate font-medium">{file.name}</span>
      <span className={cn('flex-shrink-0 text-[10px]', onRemove ? 'text-blue-300' : 'text-gray-400')}>{fileSizeStr(file.size)}</span>
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 flex-shrink-0 text-blue-200 hover:text-white">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ── MarkdownMessage ───────────────────────────────────────────────────────────

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="text-sm leading-6 space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <p key={i} className="font-bold text-gray-900 mt-2">{line.slice(4)}</p>
        if (line.startsWith('## '))  return <p key={i} className="font-bold text-gray-900 mt-2">{line.slice(3)}</p>
        if (line.startsWith('# '))   return <p key={i} className="font-bold text-gray-900 text-base mt-2">{line.slice(2)}</p>
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-gray-900">{line.slice(2, -2)}</p>
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const text = line.slice(2)
          const parts = text.split(/(\*\*[^*]+\*\*)/)
          return (
            <p key={i} className="pl-3 flex gap-2">
              <span className="text-gray-400 flex-shrink-0">•</span>
              <span>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}</span>
            </p>
          )
        }
        if (line.match(/^\d+\. /)) {
          const num  = line.match(/^(\d+)/)?.[1]
          const text = line.replace(/^\d+\. /, '')
          return <p key={i} className="pl-3 flex gap-2"><span className="text-gray-400 flex-shrink-0">{num}.</span><span>{text}</span></p>
        }
        if (line.startsWith('`') && line.endsWith('`')) {
          return <code key={i} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">{line.slice(1, -1)}</code>
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        if (parts.length > 1) return <p key={i}>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}</p>
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}

// ── ChatWidget ────────────────────────────────────────────────────────────────

const LS_MESSAGES_KEY = 'mercy_chat_messages'
const LS_SESSION_KEY  = 'mercy_chat_session'
const LS_ACCOUNT_KEY  = 'mercy_chat_account'

function lsGet<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null } catch { return null }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota exceeded — ignore */ }
}
function lsDel(key: string) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export default function ChatWidget() {
  const [open, setOpen]               = useState(false)
  const [expanded, setExpanded]       = useState(false)
  const [messages, setMessages]       = useState<Message[]>([])
  const [sessionId, setSessionId]     = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [unread, setUnread]           = useState(0)
  const [accounts, setAccounts]       = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<Account | null | 'loading'>('loading')
  const [showAccounts, setShowAccounts]       = useState(false)
  const [pendingFiles, setPendingFiles] = useState<AttachedFile[]>([])

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname     = usePathname()
  const mediaPlanId  = pathname?.match(/\/review\/([^/]+)/)?.[1] ?? undefined

  // Load accounts on mount
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => {
        const list: Account[] = (data.accounts ?? []).map((a: { id: string; descriptiveName?: string; name?: string; currencyCode?: string }) => ({
          id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
        }))
        setAccounts(list)
        setSelectedAccount(list.length > 0 ? list[0] : null)
      })
      .catch(() => { setSelectedAccount(null) })
  }, [])

  // Load history when account ready — localStorage first (instant), then API in background
  useEffect(() => {
    if (selectedAccount === 'loading') return
    const cid = typeof selectedAccount === 'object' && selectedAccount ? selectedAccount.id : undefined

    // Restore from localStorage immediately so chat doesn't look empty after navigation
    const lsMsgs = lsGet<Message[]>(LS_MESSAGES_KEY)
    const lsSid  = lsGet<string>(LS_SESSION_KEY)
    const lsAcc  = lsGet<string>(LS_ACCOUNT_KEY)
    if (lsMsgs && lsMsgs.length > 0 && lsAcc === (cid ?? 'none')) {
      setMessages(lsMsgs)
      if (lsSid) setSessionId(lsSid)
      setHistoryLoaded(true)
      return  // Skip API call — already have fresh data
    }

    // No local cache for this account — fetch from API
    const url = cid ? `/api/chat/history?customerId=${cid}` : '/api/chat/history'
    setHistoryLoaded(false)
    fetch(url)
      .then((r) => r.json())
      .then((data: { sessionId: string | null; messages: Array<{ role: string; content: string; model?: string; filesJson?: string }> }) => {
        setSessionId(data.sessionId)
        const msgs = data.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          model: m.model,
          files: m.filesJson ? (JSON.parse(m.filesJson) as AttachedFile[]) : undefined,
        }))
        setMessages(msgs)
        // Seed localStorage so next mount is instant
        lsSet(LS_MESSAGES_KEY, msgs)
        lsSet(LS_SESSION_KEY, data.sessionId)
        lsSet(LS_ACCOUNT_KEY, cid ?? 'none')
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true))
  }, [selectedAccount])

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => inputRef.current?.focus(), 100) }
  }, [open])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (!historyLoaded) return
    const acc = selectedAccount === 'loading' ? null : selectedAccount
    const cid = acc?.id ?? 'none'
    if (messages.length > 0) {
      // Strip file content (base64) before storing to avoid quota issues
      const stripped = messages.map((m) => ({
        ...m,
        files: m.files?.map(({ name, mimeType, size }) => ({ name, mimeType, size, content: '' })),
      }))
      lsSet(LS_MESSAGES_KEY, stripped)
      lsSet(LS_ACCOUNT_KEY, cid)
      if (sessionId) lsSet(LS_SESSION_KEY, sessionId)
    }
  }, [messages, historyLoaded, selectedAccount, sessionId])

  // Debounced history save
  const saveHistory = useCallback((msgs: Message[], sid: string | null, acc: Account | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sid,
            customerId: acc?.id,
            accountName: acc?.name,
            messages: msgs.map((m) => ({
              role: m.role, content: m.content, model: m.model,
              filesJson: m.files
                ? JSON.stringify(m.files.map(({ name, mimeType, size }) => ({ name, mimeType, size, content: '' })))
                : undefined,
            })),
          }),
        })
        const data = await res.json() as { sessionId?: string }
        if (data.sessionId && !sid) setSessionId(data.sessionId)
      } catch { /* silent */ }
      finally { setSaving(false) }
    }, 800)
  }, [])

  const clearChat = useCallback(async () => {
    setMessages([])
    lsDel(LS_MESSAGES_KEY)
    lsDel(LS_SESSION_KEY)
    lsDel(LS_ACCOUNT_KEY)
    const acc = selectedAccount === 'loading' ? null : selectedAccount
    const cid = acc?.id
    const url = sessionId
      ? `/api/chat/history?sessionId=${sessionId}`
      : cid ? `/api/chat/history?customerId=${cid}` : '/api/chat/history'
    await fetch(url, { method: 'DELETE' }).catch(() => {})
    setSessionId(null)
  }, [selectedAccount, sessionId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const valid = files.filter((f) => f.size <= 10 * 1024 * 1024)
    if (valid.length < files.length) alert('ไฟล์บางไฟล์ใหญ่เกิน 10MB ถูกข้ามไป')
    const read = await Promise.all(valid.map(readFile))
    setPendingFiles((prev) => [...prev, ...read])
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter((f) => f.size <= 10 * 1024 * 1024)
    if (!files.length) return
    const read = await Promise.all(files.map(readFile))
    setPendingFiles((prev) => [...prev, ...read])
  }

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if ((!msg && pendingFiles.length === 0) || loading) return

    const filesToSend = [...pendingFiles]
    const userMsg: Message = {
      role: 'user',
      content: msg || `[แนบไฟล์ ${filesToSend.map((f) => f.name).join(', ')}]`,
      files: filesToSend.length > 0 ? filesToSend : undefined,
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setPendingFiles([])
    setLoading(true)
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const acc = selectedAccount === 'loading' ? null : selectedAccount
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role, content: m.content,
            files: m.files?.map((f) => ({ name: f.name, mimeType: f.mimeType, size: f.size, content: f.content })),
          })),
          customerId: acc?.id,
          accountName: acc?.name,
          mediaPlanId,
        }),
      })
      const data  = await res.json()
      const reply: Message = {
        role: 'assistant',
        content: data.content ?? `ขอโทษครับ เกิดข้อผิดพลาด (${res.status})`,
        model: data.model,
      }
      const updated = [...newMessages, reply]
      setMessages(updated)
      if (!open) setUnread((n) => n + 1)
      saveHistory(updated, sessionId, acc)
    } catch {
      const updated = [...newMessages, { role: 'assistant' as const, content: 'ขอโทษครับ ไม่สามารถเชื่อมต่อได้ในขณะนี้' }]
      setMessages(updated)
      saveHistory(updated, sessionId, acc)
    } finally {
      setLoading(false)
    }
  }, [input, pendingFiles, loading, messages, selectedAccount, sessionId, mediaPlanId, open, saveHistory])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const acc = selectedAccount === 'loading' ? null : selectedAccount

  const QUICK = [
    'วิเคราะห์ performance account นี้',
    'Campaign ไหนควรเพิ่ม budget?',
    'แนะนำ keyword strategy',
    'ช่วยเขียน ad copy ให้หน่อย',
  ]

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-200',
          open ? 'bg-gray-800 text-white scale-95' : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
        )}
        aria-label="Chat with Mercy Expert"
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          /* Robot / AI agent icon */
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Antenna */}
            <line x1="14" y1="2" x2="14" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="14" cy="2" r="1.5" fill="white"/>
            {/* Head */}
            <rect x="5" y="6" width="18" height="14" rx="4" fill="white" fillOpacity="0.95"/>
            {/* Eyes */}
            <circle cx="10" cy="13" r="2" fill="#2563eb"/>
            <circle cx="18" cy="13" r="2" fill="#2563eb"/>
            {/* Mouth bar */}
            <rect x="10" y="17" width="8" height="1.5" rx="0.75" fill="#2563eb"/>
            {/* Ears / side bolts */}
            <rect x="3" y="11" width="2" height="4" rx="1" fill="white" fillOpacity="0.8"/>
            <rect x="23" y="11" width="2" height="4" rx="1" fill="white" fillOpacity="0.8"/>
            {/* Body hint */}
            <rect x="10" y="20" width="8" height="3" rx="1.5" fill="white" fillOpacity="0.6"/>
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            'fixed bottom-24 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden transition-all duration-200',
            expanded ? 'w-[600px] h-[760px]' : 'w-[420px] h-[600px]'
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-950 text-white flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">Mercy Expert</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Google Ads AI Advisor</p>
            </div>
            {/* Clear chat */}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-red-400"
                title="ล้างแชท"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Account selector */}
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 relative flex-shrink-0">
            <button
              onClick={() => setShowAccounts((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 text-xs transition-colors"
            >
              {selectedAccount === 'loading' ? (
                <span className="text-gray-400">กำลังโหลด...</span>
              ) : acc ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="flex-1 text-left text-gray-700 font-medium truncate">{acc.name}</span>
                  <span className="text-gray-400 font-mono">{acc.id}</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 text-gray-400" />
                  <span className="flex-1 text-left text-gray-500 font-medium">ทั่วไป (ไม่เลือก account)</span>
                </>
              )}
              <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
            </button>

            {showAccounts && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-20 max-h-56 overflow-y-auto">
                {/* General option */}
                <button
                  onClick={() => { setSelectedAccount(null); setShowAccounts(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-gray-50 transition-colors text-left border-b border-gray-100',
                    acc === null ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-600'
                  )}
                >
                  <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium">ทั่วไป (ไม่เลือก account)</p>
                    <p className="text-[10px] text-gray-400">ตอบแบบ general — ไม่อิง account ใดๆ</p>
                  </div>
                </button>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedAccount(a); setShowAccounts(false) }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-blue-50 transition-colors text-left',
                      acc?.id === a.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="flex-1 truncate font-medium">{a.name}</span>
                    <span className="text-gray-400 font-mono">{a.id}</span>
                  </button>
                ))}
                {accounts.length === 0 && selectedAccount !== 'loading' && (
                  <p className="px-3 py-3 text-xs text-gray-400 text-center">ยังไม่มี account</p>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            onClick={() => setShowAccounts(false)}
          >
            {messages.length === 0 && (
              <div className="py-4">
                <div className="text-center mb-4">
                  <Bot className="w-8 h-8 mx-auto text-blue-300 mb-2" />
                  <p className="text-sm font-semibold text-gray-700">สวัสดีครับ! ผม Mercy Expert</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {acc ? `กำลังดูข้อมูลของ ${acc.name}` : 'Google Ads & Marketing Consultant'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">แนบไฟล์ CSV, Excel, รูป, PDF ได้เลย</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-full hover:bg-blue-100 transition-colors border border-blue-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                )}>
                  {/* Files */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.files.map((f, fi) => <FileChip key={fi} file={f} />)}
                    </div>
                  )}
                  {msg.role === 'assistant'
                    ? <MarkdownMessage content={msg.content} />
                    : msg.content && <p className="text-sm leading-5">{msg.content}</p>
                  }
                  {msg.role === 'assistant' && msg.model && (
                    <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                      {msg.model === 'mock' ? <WifiOff className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
                      {msg.model}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Pending files */}
          {pendingFiles.length > 0 && (
            <div className="flex-shrink-0 flex flex-wrap gap-1.5 px-3 py-2 border-t border-gray-100 bg-gray-50">
              {pendingFiles.map((f, i) => (
                <FileChip key={i} file={f} onRemove={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))} />
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 px-3 py-3 border-t border-gray-100 bg-white">
            <input
              ref={fileInputRef as React.RefObject<HTMLInputElement>}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.json,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp,.md"
              className="sr-only"
              onChange={handleFileChange}
            />
            <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
              {/* Attach button */}
              <button
                type="button"
                onClick={() => (fileInputRef as React.RefObject<HTMLInputElement>).current?.click()}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors mb-0.5"
                title="แนบไฟล์ (CSV, Excel, รูป, PDF)"
              >
                {pendingFiles.length > 0
                  ? <Plus className="w-4 h-4 text-blue-500" />
                  : <Paperclip className="w-4 h-4 text-gray-400" />
                }
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  if (inputRef.current) {
                    inputRef.current.style.height = 'auto'
                    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 96) + 'px'
                  }
                }}
                onKeyDown={handleKey}
                placeholder={pendingFiles.length > 0 ? 'เพิ่มคำถามหรือกด Send เลย...' : 'ถามเรื่อง Google Ads, strategy, performance...'}
                rows={1}
                className="flex-1 text-sm text-gray-800 placeholder-gray-400 bg-transparent resize-none outline-none leading-5"
                style={{ minHeight: '20px', maxHeight: '96px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && pendingFiles.length === 0) || loading}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-700 transition-colors mb-0.5"
              >
                {loading
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />
                }
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่ · ลากไฟล์มาวางได้
              {saving && <span className="ml-1 text-gray-300"> · บันทึก...</span>}
              {!saving && historyLoaded && messages.length > 0 && <span className="ml-1 text-gray-300"> · บันทึกแล้ว</span>}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
