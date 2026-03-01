/**
 * Embedding helpers – uses OpenAI text-embedding-3-small (dim=1536)
 *
 * Groq does not expose an embeddings endpoint, so we use the OpenAI SDK
 * pointing at the standard OpenAI API for this step only.
 */

import OpenAI from 'openai'

let _client: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

const EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Create a 1536-dimensional embedding for the given text.
 * Input is truncated to 8 000 characters to stay within token limits.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  })
  return response.data[0].embedding
}

/**
 * Build the text that gets embedded for a memory.
 * Combines the richest signal: extracted_text, title, summary, and user notes.
 */
export function buildEmbeddingText(fields: {
  extracted_text?: string | null
  title?: string | null
  summary_bullets?: string[] | null
  user_notes?: string | null
  raw_text?: string | null
}): string {
  return [
    fields.title,
    fields.extracted_text ?? fields.raw_text,
    (fields.summary_bullets ?? []).join(' '),
    fields.user_notes,
  ]
    .filter(Boolean)
    .join('\n')
}
