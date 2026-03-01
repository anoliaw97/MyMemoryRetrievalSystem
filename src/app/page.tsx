'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
} from 'react'
import Image from 'next/image'
import { Memory } from '@/types'

// ─── tiny icon components (inline SVG) ───────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function BrainIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Memory['status'] }) {
  const map = {
    processing: 'bg-amber-100 text-amber-700 border-amber-200',
    ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {status === 'processing' && <Spinner size={10} />}
      {status}
    </span>
  )
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 border border-indigo-100">
      #{label}
    </span>
  )
}

// ─── Memory card ──────────────────────────────────────────────────────────────

function MemoryCard({
  memory,
  onDelete,
}: {
  memory: Memory
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Delete this memory?')) return
    setDeleting(true)
    try {
      await fetch(`/api/memories/${memory.id}`, { method: 'DELETE' })
      onDelete(memory.id)
    } finally {
      setDeleting(false)
    }
  }

  const typeIcon =
    memory.memory_type === 'image'
      ? '🖼️'
      : memory.memory_type === 'link'
        ? '🔗'
        : '📝'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Thumbnail */}
      {memory.image_signed_url && (
        <div className="relative h-40 bg-gray-100">
          <Image
            src={memory.image_signed_url}
            alt={memory.title ?? 'Memory image'}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base">{typeIcon}</span>
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {memory.title ?? (memory.status === 'processing' ? 'Analyzing…' : 'Untitled')}
            </h3>
          </div>
          <StatusBadge status={memory.status} />
        </div>

        {/* Processing overlay */}
        {memory.status === 'processing' && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <Spinner size={12} /> Extracting text &amp; generating summary with Groq AI…
          </p>
        )}

        {/* Failed */}
        {memory.status === 'failed' && memory.error_message && (
          <p className="text-xs text-red-600 bg-red-50 rounded p-2">
            {memory.error_message}
          </p>
        )}

        {/* Ready: summary bullets */}
        {memory.status === 'ready' && memory.summary_bullets && (
          <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
            {memory.summary_bullets.slice(0, expanded ? undefined : 2).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        {/* Tags */}
        {memory.tags && memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {memory.tags.slice(0, expanded ? undefined : 4).map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
        )}

        {/* Expanded details */}
        {expanded && memory.status === 'ready' && (
          <div className="space-y-2 mt-1 border-t border-gray-100 pt-2">
            {memory.extracted_text && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Extracted Text
                </p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-10">
                  {memory.extracted_text}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
              {memory.category && (
                <>
                  <span className="font-medium text-gray-600">Category</span>
                  <span>{memory.category}</span>
                </>
              )}
              {memory.language && (
                <>
                  <span className="font-medium text-gray-600">Language</span>
                  <span>{memory.language}</span>
                </>
              )}
              {memory.confidence !== null && memory.confidence !== undefined && (
                <>
                  <span className="font-medium text-gray-600">Confidence</span>
                  <span>{Math.round(memory.confidence * 100)}%</span>
                </>
              )}
            </div>

            {memory.entities && (
              <div className="text-xs text-gray-500 space-y-0.5">
                {memory.entities.people.length > 0 && (
                  <p><span className="font-medium text-gray-600">People: </span>{memory.entities.people.join(', ')}</p>
                )}
                {memory.entities.orgs.length > 0 && (
                  <p><span className="font-medium text-gray-600">Orgs: </span>{memory.entities.orgs.join(', ')}</p>
                )}
                {memory.entities.places.length > 0 && (
                  <p><span className="font-medium text-gray-600">Places: </span>{memory.entities.places.join(', ')}</p>
                )}
                {memory.entities.products.length > 0 && (
                  <p><span className="font-medium text-gray-600">Products: </span>{memory.entities.products.join(', ')}</p>
                )}
              </div>
            )}

            {memory.source_url && (
              <a
                href={memory.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline truncate block"
              >
                {memory.source_url}
              </a>
            )}

            {memory.user_notes && (
              <p className="text-xs text-gray-500 italic">&ldquo;{memory.user_notes}&rdquo;</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2">
          {memory.status === 'ready' && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <span>{new Date(memory.created_at).toLocaleDateString()}</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-400 hover:text-red-600 disabled:opacity-50"
              title="Delete"
            >
              {deleting ? <Spinner size={12} /> : '✕'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TabType = 'text' | 'image' | 'link'

export default function Home() {
  // ── Memories state ──────────────────────────────────────────────────────────
  const [memories, setMemories] = useState<Memory[]>([])
  const [loadingMemories, setLoadingMemories] = useState(true)

  // ── Create form state ───────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabType>('text')
  const [textInput, setTextInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [userNotes, setUserNotes] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Ask state ───────────────────────────────────────────────────────────────
  const [question, setQuestion] = useState('')
  const [askResult, setAskResult] = useState<{
    answer: string
    citations: Array<{ id: string; title: string; excerpt: string }>
  } | null>(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  // ── Fetch memories ──────────────────────────────────────────────────────────
  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch('/api/memories')
      if (res.ok) setMemories(await res.json())
    } catch {
      // silently fail
    } finally {
      setLoadingMemories(false)
    }
  }, [])

  useEffect(() => {
    fetchMemories()
  }, [fetchMemories])

  // ── Image selection ─────────────────────────────────────────────────────────
  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Save memory ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaveError(null)
    if (tab === 'image' && !imageFile) {
      setSaveError('Please select an image.')
      return
    }
    if (tab === 'text' && !textInput.trim()) {
      setSaveError('Please enter some text.')
      return
    }
    if (tab === 'link' && !urlInput.trim()) {
      setSaveError('Please enter a URL.')
      return
    }

    setSaving(true)

    try {
      const fd = new FormData()
      fd.append('type', tab)
      if (userNotes.trim()) fd.append('user_notes', userNotes.trim())

      if (tab === 'image' && imageFile) {
        fd.append('file', imageFile)
      } else if (tab === 'text') {
        fd.append('text', textInput.trim())
      } else if (tab === 'link') {
        fd.append('url', urlInput.trim())
      }

      const res = await fetch('/api/memories', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const newMemory: Memory = await res.json()
      setMemories((prev) => [newMemory, ...prev])

      // Reset form
      setTextInput('')
      setUrlInput('')
      setUserNotes('')
      clearImage()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save memory')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete memory ───────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  // ── Ask ─────────────────────────────────────────────────────────────────────
  const handleAsk = async () => {
    if (!question.trim() || asking) return
    setAskError(null)
    setAskResult(null)
    setAsking(true)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setAskResult(await res.json())
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Failed to get answer')
    } finally {
      setAsking(false)
    }
  }

  // ── Tab button helper ───────────────────────────────────────────────────────
  const TabBtn = ({ value, label }: { value: TabType; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        tab === value
          ? 'bg-indigo-600 text-white shadow'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-indigo-600 text-white">
          <BrainIcon />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">MyMemory</h1>
          <p className="text-sm text-gray-500">AI-powered memory retrieval · Groq + Pinecone</p>
        </div>
      </header>

      {/* ── Create Memory ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Create Memory</h2>

        {/* Tabs */}
        <div className="flex gap-2 bg-gray-100 rounded-full p-1 w-fit">
          <TabBtn value="text" label="📝 Text" />
          <TabBtn value="image" label="🖼️ Image" />
          <TabBtn value="link" label="🔗 Link" />
        </div>

        {/* ── Text input ──────────────────────────────────────────────────── */}
        {tab === 'text' && (
          <textarea
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            rows={5}
            placeholder="Paste notes, articles, code snippets, or any text you want to remember…"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
        )}

        {/* ── Image upload ─────────────────────────────────────────────────── */}
        {tab === 'image' && (
          <div className="space-y-3">
            {imagePreview ? (
              <div className="relative w-full max-w-sm">
                {/* Thumbnail preview */}
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100 h-52">
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <button
                  onClick={clearImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                  title="Remove image"
                >
                  ✕
                </button>
                <p className="mt-1.5 text-xs text-gray-500 truncate">{imageFile?.name}</p>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-40 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                <span className="text-3xl mb-2">📁</span>
                <span className="text-sm text-gray-500">Click to upload an image or screenshot</span>
                <span className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP, GIF up to 10 MB</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </label>
            )}
          </div>
        )}

        {/* ── Link input ───────────────────────────────────────────────────── */}
        {tab === 'link' && (
          <input
            type="url"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="https://example.com/article"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
        )}

        {/* Notes field (all types) */}
        <input
          type="text"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Notes or context for AI (optional)"
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
        />

        {/* Error */}
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <>
              <Spinner size={14} />
              Processing with Groq AI…
            </>
          ) : (
            'Save Memory'
          )}
        </button>
      </section>

      {/* ── Memories grid ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            Your Memories
            {memories.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">({memories.length})</span>
            )}
          </h2>
          <button
            onClick={fetchMemories}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Refresh
          </button>
        </div>

        {loadingMemories ? (
          <div className="flex justify-center py-12 text-gray-400">
            <Spinner size={24} />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">🧠</p>
            <p className="text-sm">No memories yet. Save your first one above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memories.map((m) => (
              <MemoryCard key={m.id} memory={m} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </section>

      {/* ── Ask My Memory ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Ask My Memory</h2>
        <p className="text-xs text-gray-500">
          Ask any question – Groq searches your saved memories and answers with citations.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="What did I save about machine learning?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          />
          <button
            onClick={handleAsk}
            disabled={asking || !question.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {asking ? <Spinner size={14} /> : 'Ask'}
          </button>
        </div>

        {askError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{askError}</p>
        )}

        {askResult && (
          <div className="space-y-3">
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {askResult.answer}
              </p>
            </div>

            {askResult.citations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Sources
                </p>
                <div className="space-y-1.5">
                  {askResult.citations.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2"
                    >
                      <p className="text-xs font-semibold text-gray-700">{c.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.excerpt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="text-center text-xs text-gray-400 pb-4">
        Built with Groq · Supabase · Pinecone · Next.js
      </footer>
    </div>
  )
}
