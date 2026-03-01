export type MemoryType = 'image' | 'text' | 'link'
export type MemoryStatus = 'processing' | 'ready' | 'failed'

export interface Entities {
  people: string[]
  orgs: string[]
  places: string[]
  products: string[]
}

/**
 * Represents a single memory record stored in Supabase.
 * `image_signed_url` is generated server-side on read and is NOT persisted.
 */
export interface Memory {
  id: string
  user_id: string | null
  memory_type: MemoryType
  status: MemoryStatus

  // Raw content
  raw_text: string | null
  user_notes: string | null
  source_url: string | null
  /** Storage path inside the 'memory-images' bucket, e.g. memories/ts_name.png */
  image_url: string | null
  /** Ephemeral signed URL – generated on every GET, not stored in DB */
  image_signed_url: string | null

  // Groq-extracted fields
  title: string | null
  extracted_text: string | null
  summary_bullets: string[] | null
  tags: string[] | null
  category: string | null
  confidence: number | null
  language: string | null
  entities: Entities | null

  // Lifecycle
  error_message: string | null
  created_at: string
  updated_at: string
}

/**
 * Structured JSON that every Groq extraction (vision or text) returns.
 */
export interface GroqExtractionResult {
  title: string
  extracted_text: string
  summary_bullets: string[]
  tags: string[]
  category: string
  memory_type: string
  confidence: number
  language: string
  entities: Entities
}

export interface Citation {
  id: string
  title: string
  excerpt: string
}

export interface AskResponse {
  answer: string
  citations: Citation[]
}

export interface PineconeMetadata {
  title: string
  content: string
  tags: string[]
  memory_type: string
  category: string
}
