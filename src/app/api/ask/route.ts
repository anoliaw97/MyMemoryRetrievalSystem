/**
 * POST /api/ask
 *
 * Ask a question about stored memories.
 *
 * Body: { "question": string }
 *
 * Pipeline:
 *   1. Rate-limit via Upstash Redis (same Groq limiter)
 *   2. Embed the question with OpenAI text-embedding-3-small
 *   3. Query Pinecone for top-5 semantically similar memories
 *   4. Enrich matches with DB metadata (title, extracted_text)
 *   5. Call groqAnswer to draft a grounded answer
 *   6. Return { answer, citations }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createEmbedding } from '@/lib/embeddings'
import { queryMemories } from '@/lib/pinecone'
import { groqAnswer } from '@/lib/groq'
import { checkGroqRateLimit } from '@/lib/redis'
import { createSupabaseAdmin } from '@/lib/supabase'
import { AskResponse, Citation } from '@/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  let body: { question?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  try {
    // ── Rate limit ──────────────────────────────────────────────────────────
    // Use client IP as identifier when available; fall back to 'global'
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'global'
    await checkGroqRateLimit(ip)

    // ── Embed question ──────────────────────────────────────────────────────
    const embedding = await createEmbedding(question)

    // ── Pinecone similarity search ──────────────────────────────────────────
    const matches = await queryMemories(embedding, 5)

    if (matches.length === 0) {
      const response: AskResponse = {
        answer:
          "I couldn't find any relevant memories for that question. Try saving some content first!",
        citations: [],
      }
      return NextResponse.json(response)
    }

    // ── Enrich matches from Supabase DB ─────────────────────────────────────
    const supabase = createSupabaseAdmin()
    const ids = matches.map((m) => m.id)

    const { data: dbMemories } = await supabase
      .from('memories')
      .select('id, title, extracted_text, raw_text, summary_bullets, source_url')
      .in('id', ids)

    const memoryMap = new Map(
      (dbMemories ?? []).map((m: Record<string, unknown>) => [m.id as string, m]),
    )

    // Build retrieval context for Groq
    const retrievedMemories = matches.map((m) => {
      const db = memoryMap.get(m.id)
      const title =
        (db?.title as string | undefined) ??
        (m.metadata.title as string | undefined) ??
        'Untitled'
      const content =
        (db?.extracted_text as string | undefined) ??
        (db?.raw_text as string | undefined) ??
        (m.metadata.content as string | undefined) ??
        ''
      return { id: m.id, title, content, score: m.score }
    })

    // ── Groq answer ─────────────────────────────────────────────────────────
    const answer = await groqAnswer(question, retrievedMemories)

    // ── Build citations ─────────────────────────────────────────────────────
    const citations: Citation[] = retrievedMemories
      .filter((m) => m.score > 0.5) // only cite reasonably relevant results
      .slice(0, 3)
      .map((m) => ({
        id: m.id,
        title: m.title,
        excerpt: m.content.slice(0, 200) + (m.content.length > 200 ? '…' : ''),
      }))

    const response: AskResponse = { answer, citations }
    return NextResponse.json(response)

  } catch (err) {
    console.error('[POST /api/ask]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Rate limit') ? 429 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
