'use client'

import { useRef, useState, useCallback } from 'react'
import { X, FileSpreadsheet, File } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface UploadedFile {
  file: File
  objectUrl?: string
  progress?: number // 0–100, undefined = complete
}

interface Props {
  title?: string
  accept?: string               // e.g. "image/*" or ".csv,.xlsx,.xls"
  acceptLabel?: string          // e.g. "CSV, XLSX or XLS files"
  maxSizeMB?: number
  multiple?: boolean
  maxFiles?: number
  files: UploadedFile[]
  onAdd: (files: UploadedFile[]) => void
  onRemove: (index: number) => void
  onCancel?: () => void
  onUpload?: () => void
  className?: string
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    return (
      <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
        <FileSpreadsheet className="w-5 h-5 text-gray-500" />
      </div>
    )
  }
  if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
    return (
      <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
        <File className="w-5 h-5 text-gray-500" />
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
      <File className="w-5 h-5 text-gray-500" />
    </div>
  )
}

export function FileUpload({
  title = 'File Upload',
  accept,
  acceptLabel,
  maxSizeMB = 10,
  multiple = false,
  maxFiles,
  files,
  onAdd,
  onRemove,
  onCancel,
  onUpload,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const processFiles = useCallback((raw: FileList | null) => {
    if (!raw) return
    const available = maxFiles ? maxFiles - files.length : Infinity
    const toAdd: UploadedFile[] = []
    for (let i = 0; i < Math.min(raw.length, available); i++) {
      const f = raw[i]
      if (maxSizeMB && f.size > maxSizeMB * 1024 * 1024) continue
      toAdd.push({
        file: f,
        objectUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        progress: undefined,
      })
    }
    if (toAdd.length) onAdd(toAdd)
  }, [files.length, maxFiles, maxSizeMB, onAdd])

  const canAdd = !maxFiles || files.length < maxFiles

  return (
    <div className={cn('w-full', className)}>
      {title && (
        <h3 className="text-base font-bold text-gray-900 mb-3">{title}</h3>
      )}

      {/* Drop zone */}
      {canAdd && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'w-full border border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 py-10 px-6 cursor-pointer transition-colors',
            dragging
              ? 'border-gray-400 bg-gray-50'
              : 'border-gray-300 bg-white hover:bg-gray-50'
          )}
        >
          {/* File icon */}
          <svg width="44" height="48" viewBox="0 0 44 48" fill="none" className="text-gray-400">
            <path
              d="M6 4C6 1.79 7.79 0 10 0H28L44 16V44C44 46.21 42.21 48 40 48H10C7.79 48 6 46.21 6 44V4Z"
              fill="currentColor"
              fillOpacity="0.1"
            />
            <path
              d="M28 0L44 16H32C29.79 16 28 14.21 28 12V0Z"
              fill="currentColor"
              fillOpacity="0.25"
            />
            <path
              d="M10 0H28V12C28 14.21 29.79 16 32 16H44V44C44 46.21 42.21 48 40 48H10C7.79 48 6 46.21 6 44V4C6 1.79 7.79 0 10 0Z"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>

          <p className="text-sm text-gray-500">
            Drag and drop or{' '}
            <span className="font-bold text-gray-800">choose file</span>
            {' '}to upload
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(e) => processFiles(e.target.files)}
          />
        </div>
      )}

      {/* Meta info */}
      {(acceptLabel || maxSizeMB) && (
        <div className="flex items-center justify-between mt-2 px-0.5">
          {acceptLabel && (
            <p className="text-xs text-gray-400">
              Accepted file types: {acceptLabel}
            </p>
          )}
          {maxSizeMB && (
            <p className="text-xs text-gray-400 ml-auto">
              Max. size: {maxSizeMB}MB
            </p>
          )}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="bg-gray-100 rounded-2xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <FileIcon name={f.file.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{f.file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatSize(f.file.size)}</p>
                </div>
                <button
                  onClick={() => onRemove(i)}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress bar */}
              {f.progress !== undefined && (
                <div className="mt-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-300 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full transition-all duration-300"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-9 text-right">{f.progress}%</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {(onCancel || onUpload) && (
        <div className="flex items-center justify-end gap-3 mt-6">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
          {onUpload && (
            <button
              onClick={onUpload}
              disabled={files.length === 0}
              className={cn(
                'px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors',
                files.length > 0
                  ? 'bg-gray-700 hover:bg-gray-800 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              )}
            >
              Upload
            </button>
          )}
        </div>
      )}
    </div>
  )
}
