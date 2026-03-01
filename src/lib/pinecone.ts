/**
 * Pinecone vector store helpers
 *
 * Index configuration: dimension=1536 (text-embedding-3-small), metric=cosine
 * Set PINECONE_INDEX_NAME in env vars.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { PineconeMetadata } from '@/types'

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------
let _client: Pinecone | null = null

function getPineconeClient(): Pinecone {
  if (!_client) {
    if (!process.env.PINECONE_API_KEY) throw new Error('PINECONE_API_KEY is not set')
    _client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
  }
  return _client
}

function getIndex() {
  const name = process.env.PINECONE_INDEX_NAME
  if (!name) throw new Error('PINECONE_INDEX_NAME is not set')
  return getPineconeClient().index(name)
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------
/**
 * Upsert a memory embedding into Pinecone.
 * The `content` field is trimmed to 1 000 chars to stay within metadata limits.
 */
export async function upsertMemoryEmbedding(
  memoryId: string,
  embedding: number[],
  metadata: PineconeMetadata,
): Promise<void> {
  const index = getIndex()
  await index.upsert([
    {
      id: memoryId,
      values: embedding,
      metadata: {
        ...metadata,
        content: metadata.content.slice(0, 1000),
        tags: metadata.tags,
      },
    },
  ])
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------
export interface PineconeMatch {
  id: string
  score: number
  metadata: Record<string, unknown>
}

export async function queryMemories(
  embedding: number[],
  topK = 5,
): Promise<PineconeMatch[]> {
  const index = getIndex()
  const result = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
  })
  return (result.matches ?? []).map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    metadata: (m.metadata as Record<string, unknown>) ?? {},
  }))
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteMemoryEmbedding(memoryId: string): Promise<void> {
  const index = getIndex()
  await index.deleteOne(memoryId)
}
