// Upstash Redis REST API wrapper — no npm dependency needed
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

const CACHE_KEY = "viral:picks"
const SCAN_TS_KEY = "viral:lastScan"
const SCAN_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes — pick up fresh news faster
const TTL_SECONDS = 25 * 60 * 60 // 25 hours (buffer over 24h display window)

function getEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function redisCmd(cmd: string[]): Promise<any> {
  const env = getEnv()
  if (!env) return null

  const res = await fetch(`${env.url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) throw new Error(`Redis error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.result
}

export async function shouldRefresh(): Promise<boolean> {
  const env = getEnv()
  if (!env) return true // no Redis → always refresh (fallback to live-only)

  const lastScan = await redisCmd(["GET", SCAN_TS_KEY])
  if (!lastScan) return true

  const elapsed = Date.now() - Number(lastScan)
  return elapsed >= SCAN_INTERVAL_MS
}

export async function getCachedPicks(): Promise<any[] | null> {
  const env = getEnv()
  if (!env) return null

  const raw = await redisCmd(["GET", CACHE_KEY])
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function savePicks(newPicks: any[]): Promise<void> {
  const env = getEnv()
  if (!env) return

  // Load existing cached picks
  const existing = await getCachedPicks() || []

  // Merge: combine existing + new, dedup by title prefix, keep highest score
  const merged = new Map<string, any>()
  for (const p of existing) {
    const key = (p.title || "").slice(0, 30)
    merged.set(key, p)
  }
  for (const p of newPicks) {
    const key = (p.title || "").slice(0, 30)
    const old = merged.get(key)
    if (!old || (p.finalScore || 0) > (old.finalScore || 0)) {
      merged.set(key, p)
    }
  }

  // Score-based retention: high-scoring news lives longer, low-scoring gets culled
  // Grade S (≥30): keep 24h, Grade A (≥20): keep 18h, Grade B (≥13): keep 12h
  // Grade C (≥8): keep 6h, Grade D (<8): keep 3h
  const now = Date.now()
  const filtered = Array.from(merged.values()).filter((p) => {
    const fs = p.finalScore || 0
    let maxAge: number
    if (fs >= 30) maxAge = 24 * 60 * 60 * 1000
    else if (fs >= 20) maxAge = 18 * 60 * 60 * 1000
    else if (fs >= 13) maxAge = 12 * 60 * 60 * 1000
    else if (fs >= 8) maxAge = 6 * 60 * 60 * 1000
    else maxAge = 3 * 60 * 60 * 1000

    const itemTime = p.pubDate || p._scanTime
    if (itemTime) return (now - itemTime) < maxAge
    // No time info → only keep if score is decent (≥8)
    return fs >= 8
  })

  // Sort by finalScore
  filtered.sort((a: any, b: any) => (b.finalScore || 0) - (a.finalScore || 0))

  // Stamp scanTime on items without pubDate
  const stamped = filtered.map(p => ({
    ...p,
    _scanTime: p._scanTime || now,
  }))

  // Save to Redis with TTL
  await redisCmd(["SET", CACHE_KEY, JSON.stringify(stamped), "EX", String(TTL_SECONDS)])
  await redisCmd(["SET", SCAN_TS_KEY, String(now), "EX", String(TTL_SECONDS)])
}

export function isRedisConfigured(): boolean {
  return !!getEnv()
}
