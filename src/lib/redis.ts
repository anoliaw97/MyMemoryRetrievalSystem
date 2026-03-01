/**
 * Upstash Redis helpers
 *
 * - Redis singleton for general key-value operations
 * - groqRateLimiter: sliding-window rate limiter for all Groq API calls
 *   (10 requests per minute globally; adjust as needed)
 */

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// ---------------------------------------------------------------------------
// Redis singleton
// ---------------------------------------------------------------------------
let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      throw new Error(
        'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars',
      )
    }
    _redis = new Redis({ url, token })
  }
  return _redis
}

// ---------------------------------------------------------------------------
// Groq rate limiter  (10 req / 60 s sliding window)
// ---------------------------------------------------------------------------
let _groqRateLimiter: Ratelimit | null = null

function getGroqRateLimiter(): Ratelimit {
  if (!_groqRateLimiter) {
    _groqRateLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      prefix: 'groq_rl',
      analytics: true,
    })
  }
  return _groqRateLimiter
}

/**
 * Check the Groq rate limit for a given identifier.
 * Throws an error with a human-readable message if the limit is exceeded.
 *
 * @param identifier - e.g. IP address, user ID, or "global"
 */
export async function checkGroqRateLimit(identifier = 'global'): Promise<void> {
  const limiter = getGroqRateLimiter()
  const { success, limit, remaining, reset } = await limiter.limit(identifier)
  if (!success) {
    const resetsAt = new Date(reset).toISOString()
    throw new Error(
      `Groq rate limit exceeded (${limit} req/min). Resets at ${resetsAt}. Remaining: ${remaining}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Job queue helpers (simple Redis list-based queue)
// ---------------------------------------------------------------------------
const PROCESS_QUEUE_KEY = 'memory:process_queue'

export async function enqueueProcessJob(memoryId: string): Promise<void> {
  await getRedis().rpush(PROCESS_QUEUE_KEY, memoryId)
}

export async function dequeueProcessJob(): Promise<string | null> {
  return getRedis().lpop<string>(PROCESS_QUEUE_KEY)
}
