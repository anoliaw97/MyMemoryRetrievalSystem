/**
 * Supabase helpers – SERVER SIDE ONLY
 *
 * Uses the service-role key (SUPABASE_SERVICE_ROLE_KEY) which must never be
 * sent to the browser. All storage operations go through this admin client.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Admin client singleton (service-role key)
// ---------------------------------------------------------------------------
let _adminClient: SupabaseClient | null = null

export function createSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars',
      )
    }
    _adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _adminClient
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const BUCKET = 'memory-images'

/**
 * Upload an image Buffer to the private Supabase Storage bucket.
 * Returns the storage path (not a URL) so it can be stored in the DB.
 */
export async function uploadImageToStorage(
  buffer: Buffer | Uint8Array,
  originalName: string,
  contentType: string,
): Promise<string> {
  const supabase = createSupabaseAdmin()
  // Sanitise filename: replace spaces and special chars
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `memories/${Date.now()}_${safeName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false })

  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`)
  return path
}

/**
 * Generate a short-lived signed URL for a storage path.
 * Default expiry: 3600 s (1 hour).
 */
export async function getImageSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error) throw new Error(`Failed to create signed URL: ${error.message}`)
  return data.signedUrl
}

/**
 * Delete a file from Supabase Storage by its path.
 */
export async function deleteImageFromStorage(storagePath: string): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (error) throw new Error(`Storage delete failed: ${error.message}`)
}
