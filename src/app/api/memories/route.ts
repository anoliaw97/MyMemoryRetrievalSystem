/**
 * POST /api/memories  – create a new memory
 * GET  /api/memories  – list all memories (newest first)
 *
 * POST accepts multipart/form-data:
 *   type        : 'image' | 'text' | 'link'
 *   file        : File          (image only)
 *   text        : string        (text only)
 *   url         : string        (link only)
 *   user_notes  : string        (optional, any type)
 *
 * Processing runs synchronously:
 *   1. Upload image to Supabase Storage (image type)
 *   2. Insert DB row with status='processing'
 *   3. Run Groq extraction + embedding + Pinecone upsert
 *   4. Return final memory object (status='ready' or 'failed')
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin, uploadImageToStorage, getImageSignedUrl } from '@/lib/supabase'
import { processMemory } from '@/lib/processing'
import { Memory } from '@/types'

// Vercel max function duration (seconds). Requires Pro plan for > 60 s.
export const maxDuration = 300

// ── helpers ──────────────────────────────────────────────────────────────────

async function attachSignedUrl(memory: Memory): Promise<Memory> {
  if (!memory.image_url) return memory
  try {
    const url = await getImageSignedUrl(memory.image_url)
    return { ...memory, image_signed_url: url }
  } catch {
    return memory
  }
}

// ── GET /api/memories ─────────────────────────────────────────────────────────

export async function GET() {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attach signed URLs for image memories
  const withUrls = await Promise.all(
    (data as Memory[]).map((m) => attachSignedUrl(m)),
  )

  return NextResponse.json(withUrls)
}

// ── POST /api/memories ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createSupabaseAdmin()

  try {
    const formData = await req.formData()
    const memoryType = formData.get('type') as string
    const userNotes = (formData.get('user_notes') as string | null) || null

    if (!['image', 'text', 'link'].includes(memoryType)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    let imageStoragePath: string | null = null
    let rawText: string | null = null
    let sourceUrl: string | null = null

    // ── Upload image ──────────────────────────────────────────────────────────
    if (memoryType === 'image') {
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file provided for image type' }, { status: 400 })
      }
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      imageStoragePath = await uploadImageToStorage(buffer, file.name, file.type)

    } else if (memoryType === 'text') {
      rawText = (formData.get('text') as string | null) || null
      if (!rawText?.trim()) {
        return NextResponse.json({ error: 'No text provided' }, { status: 400 })
      }

    } else if (memoryType === 'link') {
      sourceUrl = (formData.get('url') as string | null) || null
      if (!sourceUrl?.trim()) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
      }
    }

    // ── Insert DB row ─────────────────────────────────────────────────────────
    const { data: memory, error: insertErr } = await supabase
      .from('memories')
      .insert({
        memory_type: memoryType,
        status: 'processing',
        image_url: imageStoragePath,
        raw_text: rawText,
        source_url: sourceUrl,
        user_notes: userNotes,
      })
      .select()
      .single()

    if (insertErr || !memory) {
      throw new Error(insertErr?.message ?? 'Failed to insert memory')
    }

    // ── Process (Groq + embeddings + Pinecone) ────────────────────────────────
    await processMemory(memory.id)

    // ── Return updated memory ─────────────────────────────────────────────────
    const { data: finalMemory, error: fetchErr } = await supabase
      .from('memories')
      .select('*')
      .eq('id', memory.id)
      .single()

    if (fetchErr || !finalMemory) {
      throw new Error('Failed to retrieve processed memory')
    }

    const withUrl = await attachSignedUrl(finalMemory as Memory)
    return NextResponse.json(withUrl, { status: 201 })

  } catch (err) {
    console.error('[POST /api/memories]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
