/**
 * POST /api/process
 *
 * Internal endpoint to (re-)process a memory that is stuck in 'processing'
 * or 'failed' state. Also used by Upstash QStash webhooks.
 *
 * Body: { "id": "<memory-uuid>" }
 *
 * Protected by PROCESS_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { processMemory } from '@/lib/processing'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  // Validate internal secret
  const secret = req.headers.get('x-process-secret')
  if (secret !== process.env.PROCESS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // Verify the memory exists
  const { data: memory, error } = await supabase
    .from('memories')
    .select('id, status')
    .eq('id', id)
    .single()

  if (error || !memory) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }

  // Re-process (with retry)
  await processMemory(id)

  const { data: updated } = await supabase
    .from('memories')
    .select('id, status, error_message')
    .eq('id', id)
    .single()

  return NextResponse.json({ success: true, memory: updated })
}
