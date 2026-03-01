/**
 * GET    /api/memories/:id  – fetch a single memory (with fresh signed URL)
 * DELETE /api/memories/:id  – delete memory from DB, Storage, and Pinecone
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin, getImageSignedUrl, deleteImageFromStorage } from '@/lib/supabase'
import { deleteMemoryEmbedding } from '@/lib/pinecone'
import { Memory } from '@/types'

type RouteContext = { params: { id: string } }

async function attachSignedUrl(memory: Memory): Promise<Memory> {
  if (!memory.image_url) return memory
  try {
    const url = await getImageSignedUrl(memory.image_url)
    return { ...memory, image_signed_url: url }
  } catch {
    return memory
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }

  const memory = await attachSignedUrl(data as Memory)
  return NextResponse.json(memory)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const supabase = createSupabaseAdmin()

  // Fetch memory first to get image_url
  const { data, error: fetchErr } = await supabase
    .from('memories')
    .select('id, image_url')
    .eq('id', params.id)
    .single()

  if (fetchErr || !data) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }

  // Delete from DB
  const { error: deleteErr } = await supabase
    .from('memories')
    .delete()
    .eq('id', params.id)

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  // Best-effort: delete from Storage and Pinecone (don't fail if these error)
  await Promise.allSettled([
    data.image_url ? deleteImageFromStorage(data.image_url) : Promise.resolve(),
    deleteMemoryEmbedding(params.id),
  ])

  return NextResponse.json({ success: true })
}
