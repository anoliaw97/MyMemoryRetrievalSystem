/**
 * Memory processing pipeline
 *
 * processMemory(memoryId)
 *   1. Load memory from Supabase DB
 *   2. Route to vision or text pipeline
 *   3. Create embedding + upsert to Pinecone
 *   4. Update DB with extracted fields and status='ready'
 *   Retries once on failure; marks status='failed' if both attempts fail.
 *
 * For images: groqVisionExtract(signedUrl)
 * For links:  fetch page → strip HTML → groqSummarize
 * For text:   groqSummarize(raw_text)
 */

import { createSupabaseAdmin, getImageSignedUrl } from './supabase'
import { groqVisionExtract, groqSummarize } from './groq'
import { createEmbedding, buildEmbeddingText } from './embeddings'
import { upsertMemoryEmbedding } from './pinecone'
import { checkGroqRateLimit } from './redis'
import { GroqExtractionResult } from '@/types'

// ---------------------------------------------------------------------------
// HTML text extraction (no external parser needed)
// ---------------------------------------------------------------------------
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Inner processing logic (called up to 2 times via retry)
// ---------------------------------------------------------------------------
async function runProcessing(memoryId: string): Promise<void> {
  const supabase = createSupabaseAdmin()

  const { data: memory, error: fetchErr } = await supabase
    .from('memories')
    .select('*')
    .eq('id', memoryId)
    .single()

  if (fetchErr || !memory) {
    throw new Error(`Memory not found: ${memoryId}`)
  }

  // Check Groq rate limit before any API call
  await checkGroqRateLimit('global')

  let extraction: GroqExtractionResult

  // ── Image ────────────────────────────────────────────────────────────────
  if (memory.memory_type === 'image') {
    if (!memory.image_url) throw new Error('Image memory has no image_url')

    const signedUrl = await getImageSignedUrl(memory.image_url, 300) // 5-min URL is enough
    extraction = await groqVisionExtract(signedUrl, memory.user_notes ?? undefined)
    extraction.memory_type = 'image'
  }

  // ── Link ─────────────────────────────────────────────────────────────────
  else if (memory.memory_type === 'link') {
    if (!memory.source_url) throw new Error('Link memory has no source_url')

    const pageRes = await fetch(memory.source_url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MyMemoryBot/1.0; +https://mymemory.app)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!pageRes.ok) {
      throw new Error(`Failed to fetch URL (${pageRes.status}): ${memory.source_url}`)
    }
    const html = await pageRes.text()
    const pageText = stripHtml(html)

    extraction = await groqSummarize(`Source URL: ${memory.source_url}\n\n${pageText}`)
    extraction.memory_type = 'link'
  }

  // ── Text ─────────────────────────────────────────────────────────────────
  else {
    if (!memory.raw_text) throw new Error('Text memory has no raw_text')
    extraction = await groqSummarize(memory.raw_text)
    extraction.memory_type = 'text'
  }

  // ── Embedding ─────────────────────────────────────────────────────────────
  const embeddingText = buildEmbeddingText({
    title: extraction.title,
    extracted_text: extraction.extracted_text,
    summary_bullets: extraction.summary_bullets,
    user_notes: memory.user_notes,
    raw_text: memory.raw_text,
  })

  const embedding = await createEmbedding(embeddingText)

  // ── Pinecone upsert ───────────────────────────────────────────────────────
  await upsertMemoryEmbedding(memoryId, embedding, {
    title: extraction.title ?? 'Untitled',
    content: embeddingText,
    tags: extraction.tags ?? [],
    memory_type: extraction.memory_type ?? memory.memory_type,
    category: extraction.category ?? 'other',
  })

  // ── DB update ─────────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('memories')
    .update({
      status: 'ready',
      title: extraction.title,
      extracted_text: extraction.extracted_text,
      summary_bullets: extraction.summary_bullets,
      tags: extraction.tags,
      category: extraction.category,
      confidence: extraction.confidence,
      language: extraction.language,
      entities: extraction.entities,
      memory_type: extraction.memory_type ?? memory.memory_type,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)

  if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)
}

// ---------------------------------------------------------------------------
// Public: processMemory – with retry + failure marking
// ---------------------------------------------------------------------------
export async function processMemory(memoryId: string): Promise<void> {
  const supabase = createSupabaseAdmin()
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await runProcessing(memoryId)
      return // success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Wait briefly before retry (exponential-lite: 0 ms, then 2 s)
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000))
    }
  }

  // Both attempts failed – mark as failed
  await supabase
    .from('memories')
    .update({
      status: 'failed',
      error_message: lastError?.message ?? 'Unknown processing error',
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)
}
