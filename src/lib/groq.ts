/**
 * Groq client wrapper
 *
 * Uses Groq's OpenAI-compatible API (https://api.groq.com/openai/v1)
 * via the `openai` SDK with a custom baseURL + GROQ_API_KEY.
 *
 * Exported functions:
 *   groqVisionExtract(imageInput, userHint?) → GroqExtractionResult
 *   groqSummarize(text)                      → GroqExtractionResult
 *   groqAnswer(question, memories)           → string
 */

import OpenAI from 'openai'
import { GroqExtractionResult } from '@/types'

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------
let _client: OpenAI | null = null

function getGroqClient(): OpenAI {
  if (!_client) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set')
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }
  return _client
}

// ---------------------------------------------------------------------------
// Model config
// ---------------------------------------------------------------------------
const VISION_MODEL =
  process.env.GROQ_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct'
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL ?? 'llama-3.3-70b-versatile'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const EXTRACTION_SCHEMA = `{
  "title": "concise descriptive title (string)",
  "extracted_text": "all meaningful text content verbatim (string)",
  "summary_bullets": ["key point 1", "key point 2", "key point 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "category": "one of: document|screenshot|photo|diagram|chart|code|receipt|note|article|reference|other",
  "memory_type": "image|text|link",
  "confidence": 0.95,
  "language": "ISO-639-1 code e.g. en",
  "entities": {
    "people": [],
    "orgs": [],
    "places": [],
    "products": []
  }
}`

function parseGroqJson(raw: string): GroqExtractionResult {
  // Strip markdown code fences if present
  const stripped = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON object found in Groq response: ${raw.slice(0, 300)}`)

  try {
    return JSON.parse(match[0]) as GroqExtractionResult
  } catch {
    throw new Error(`JSON parse error in Groq response: ${match[0].slice(0, 300)}`)
  }
}

// ---------------------------------------------------------------------------
// groqVisionExtract
// ---------------------------------------------------------------------------
/**
 * Extract structured information from an image using a Groq vision model.
 *
 * @param imageInput - An HTTPS image URL or a base64 data URL (data:image/…;base64,…)
 * @param userHint   - Optional free-text hint from the user (e.g. "this is a recipe")
 */
export async function groqVisionExtract(
  imageInput: string,
  userHint?: string,
): Promise<GroqExtractionResult> {
  const client = getGroqClient()

  const systemPrompt = [
    'You are an AI memory extraction assistant.',
    'Analyze the provided image thoroughly and return ONLY a valid JSON object.',
    'Do NOT include markdown, explanation, or any text outside the JSON.',
    'Follow this exact schema:',
    EXTRACTION_SCHEMA,
  ].join('\n')

  const userText = userHint
    ? `Analyze this image. User hint: "${userHint}"\n\nReturn the JSON extraction.`
    : 'Analyze this image and return the JSON extraction.'

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: imageInput, detail: 'high' },
        },
        { type: 'text', text: userText },
      ],
    },
  ]

  const response = await client.chat.completions.create({
    model: VISION_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 1024,
    temperature: 0.1,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Groq vision returned empty response')

  const result = parseGroqJson(content)
  result.memory_type = 'image'
  return result
}

// ---------------------------------------------------------------------------
// groqSummarize
// ---------------------------------------------------------------------------
/**
 * Summarize and tag a text string using a Groq text model.
 *
 * @param text - The raw text to analyze (will be truncated to 8 000 chars)
 */
export async function groqSummarize(text: string): Promise<GroqExtractionResult> {
  const client = getGroqClient()

  const systemPrompt = [
    'You are an AI memory extraction assistant.',
    'Analyze the provided text and return ONLY a valid JSON object.',
    'Do NOT include markdown, explanation, or any text outside the JSON.',
    'Follow this exact schema:',
    EXTRACTION_SCHEMA,
  ].join('\n')

  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Extract and analyze the following content:\n\n${text.slice(0, 8000)}`,
      },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Groq text model returned empty response')

  return parseGroqJson(content)
}

// ---------------------------------------------------------------------------
// groqAnswer
// ---------------------------------------------------------------------------
/**
 * Generate a grounded answer to a question using retrieved memories.
 *
 * @param question          - The user's question
 * @param retrievedMemories - Array of memories retrieved from Pinecone, each with id/title/content/score
 */
export async function groqAnswer(
  question: string,
  retrievedMemories: Array<{ id: string; title: string; content: string; score: number }>,
): Promise<string> {
  const client = getGroqClient()

  const memoryContext = retrievedMemories
    .map(
      (m, i) =>
        `[Memory ${i + 1}] (ID: ${m.id})\nTitle: ${m.title}\nContent: ${m.content}`,
    )
    .join('\n\n---\n\n')

  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content: [
          'You are a helpful assistant that answers questions from the user\'s saved memories.',
          'Use ONLY the memories provided. Cite them inline as [Memory 1], [Memory 2], etc.',
          'If the answer is not in the memories, clearly say so.',
          'Be concise, accurate, and format your response in clear prose.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Memories:\n\n${memoryContext}\n\n---\n\nQuestion: ${question}`,
      },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  })

  return response.choices[0]?.message?.content ?? 'Unable to generate an answer.'
}
