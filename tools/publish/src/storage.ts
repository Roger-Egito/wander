/**
 * The Alpha group's snapshot goes to the private Storage bucket `alpha` (its migration
 * lives in the egito-backend repository). The bucket has no write policy,
 * so only the server's secret key can write it: it bypasses Row Level Security
 * (supabase.com/docs/guides/storage/security/access-control). The key lives in GitHub
 * Secrets. `x-upsert` replaces a file of the same name, so a failed run can be retried.
 */
export async function uploadAlpha(supabaseUrl: string, secretKey: string, path: string, json: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`${supabaseUrl}/storage/v1/object/alpha/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: json,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(`Supabase Storage ${response.status}: ${body.message ?? body.error ?? response.statusText}`);
  }
}
