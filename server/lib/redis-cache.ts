import { scoreAndRank, type CandidateInput, type ScoredItem } from "./viral-scorer"

// Versioned keys isolate legacy scores/provenance and make rollback independent.
export const CACHE_KEY = "viral:picks:v2"
const SCAN_INTERVAL_MS = 30 * 60 * 1000
const TTL_SECONDS = 25 * 60 * 60

export interface ScanMetadata {
  fetchedAt: number
  totalScanned: number
  sourcesScanned: number
}

interface CachedObservation extends CandidateInput {
  lastSeen: number
}

interface CacheEnvelope extends ScanMetadata {
  version: 2
  observations: CachedObservation[]
}

export interface CachedSnapshot extends ScanMetadata {
  picks: ScoredItem[]
}

function getEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function redisCmd(cmd: string[]): Promise<unknown> {
  const env = getEnv()
  if (!env) return null
  const res = await fetch(env.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) throw new Error(`Redis error: ${res.status}`)
  const data = await res.json() as { result?: unknown, error?: string }
  if (data.error) throw new Error("Redis command failed")
  return data.result
}

function isObservation(value: unknown): value is CachedObservation {
  if (!value || typeof value !== "object") return false
  const p = value as Partial<CachedObservation>
  return typeof p.title === "string" && typeof p.url === "string"
    && typeof p.sourceId === "string" && typeof p.sourceName === "string"
    && typeof p._scanTime === "number" && Number.isFinite(p._scanTime)
    && typeof p.lastSeen === "number" && Number.isFinite(p.lastSeen)
    && (p.pubDate === undefined || typeof p.pubDate === "number" && Number.isFinite(p.pubDate))
    && (p.dateStatus === undefined || ["valid", "missing", "invalid", "future"].includes(p.dateStatus))
}

async function readEnvelope(): Promise<CacheEnvelope | null> {
  if (!getEnv()) return null
  const raw = await redisCmd(["GET", CACHE_KEY])
  if (typeof raw !== "string") return null
  try {
    const value = JSON.parse(raw) as CacheEnvelope
    if (value?.version !== 2 || !Array.isArray(value.observations) || !value.observations.every(isObservation)) return null
    if (![value.fetchedAt, value.totalScanned, value.sourcesScanned].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null
    return value
  } catch {
    return null
  }
}

export async function getCachedSnapshot(now = Date.now()): Promise<CachedSnapshot | null> {
  const cached = await readEnvelope()
  if (!cached || cached.fetchedAt > now) return null
  return {
    fetchedAt: cached.fetchedAt,
    totalScanned: cached.totalScanned,
    sourcesScanned: cached.sourcesScanned,
    picks: scoreAndRank(cached.observations, now).slice(0, 50),
  }
}

export async function shouldRefresh(now = Date.now()): Promise<boolean> {
  const cached = await readEnvelope()
  return !cached || cached.fetchedAt > now || now - cached.fetchedAt >= SCAN_INTERVAL_MS
}

export async function getCachedPicks(now = Date.now()): Promise<ScoredItem[] | null> {
  return (await getCachedSnapshot(now))?.picks ?? null
}

/** Replace source observations, never merge historical maximum scores. */
export async function savePicks(newPicks: ScoredItem[], metadata?: ScanMetadata, now = Date.now()): Promise<ScoredItem[]> {
  if (!getEnv()) return newPicks
  const cached = await readEnvelope()
  const observations = new Map<string, CachedObservation>()
  const keyFor = (p: CandidateInput) => `${p.sourceId}\n${p.url}`
  // Retain expired observations for 25h after last sighting as tombstones: a repeated
  // undated URL must not acquire a new first-observed time after crossing 8h.
  for (const p of cached?.observations ?? []) {
    if (p.lastSeen <= now && now - p.lastSeen < TTL_SECONDS * 1000) observations.set(keyFor(p), p)
  }
  for (const p of newPicks.flatMap(p => p.sources ?? [{ title: p.title, url: p.url, sourceId: p.sourceId, sourceName: p.source, pubDate: p.pubDate, dateStatus: p.dateStatus, _scanTime: p._scanTime }])) {
    const key = keyFor(p)
    const old = observations.get(key)
    observations.set(key, { ...p, _scanTime: Math.min(old?._scanTime ?? now, p._scanTime ?? now), lastSeen: now })
  }
  const envelope: CacheEnvelope = {
    version: 2,
    fetchedAt: metadata?.fetchedAt ?? now,
    totalScanned: metadata?.totalScanned ?? newPicks.length,
    sourcesScanned: metadata?.sourcesScanned ?? new Set(newPicks.map(p => p.sourceId)).size,
    observations: [...observations.values()],
  }
  const picks = scoreAndRank(envelope.observations, now).slice(0, 50)
  // Store metadata and observations in one operation, so the freshness clock never
  // advances without its payload. Errors leave the caller using the fresh scan.
  await redisCmd(["SET", CACHE_KEY, JSON.stringify(envelope), "EX", String(TTL_SECONDS)])
  return picks
}

export function isRedisConfigured(): boolean {
  return !!getEnv()
}
