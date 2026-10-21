import process from "node:process"
import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, open, readFile, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { scorerIdentity } from "./news4-v1/scorer.mjs"
import type { ScoredItem } from "./viral-scorer"

interface Snapshot {
  fetchedAt: number
  totalScanned: number
  sourcesScanned: number
  picks: ScoredItem[]
}

/**
 * Persist immutable API recommendation batches. Identical cache responses reuse IDs.
 * No expiry/delete policy here: monthly export retention belongs to the audit workflow.
 * Atomic exclusive hard-link publication prevents readers seeing partial JSON.
 */
export async function recordRecommendations(snapshot: Snapshot, directory = resolve(process.cwd(), ".data", "news4-recommendations")) {
  const payload = {
    schemaVersion: 1,
    kind: "api-recommendation-batch",
    ...scorerIdentity,
    fetchedAt: snapshot.fetchedAt,
    totalScanned: snapshot.totalScanned,
    sourcesScanned: snapshot.sourcesScanned,
    records: snapshot.picks.map((p, i) => ({
      position: i + 1,
      title: p.title,
      summary: p.summary ?? null,
      url: p.url,
      sourceId: p.sourceId,
      source: p.source,
      pubDate: p.pubDate ?? null,
      observedAt: p._scanTime,
      dateStatus: p.dateStatus,
      score: p.finalScore,
      displayScore: p.displayScore,
      scorerVersion: p.scorerVersion,
      inputSha256: p.inputSha256,
      rulesSha256: p.rulesSha256,
      weightsSha256: p.weightsSha256,
      matchedRules: p.matchedRules,
      appliedRules: p.appliedRules,
      sources: p.sources ?? [],
    })),
  }
  if (!Number.isFinite(payload.fetchedAt) || payload.records.some(p => !Number.isFinite(p.score) || p.scorerVersion !== scorerIdentity.scorerVersion)) throw new Error("Invalid recommendation payload")
  const bytes = `${JSON.stringify(payload)}\n`
  const batchId = createHash("sha256").update(bytes).digest("hex")
  const folder = resolve(directory)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const target = join(folder, `${batchId}.json`)
  const temporary = join(folder, `.${batchId}.${randomUUID()}.tmp`)
  let handle
  let created = false
  try {
    handle = await open(temporary, "wx", 0o600)
    created = true
    await handle.writeFile(bytes, "utf8")
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      await link(temporary, target)
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error
      if (await readFile(target, "utf8") !== bytes) throw new Error("Recommendation content hash collision/corruption")
    }
  } finally {
    if (handle) await handle.close()
    if (created) await unlink(temporary)
  }
  return { recommendationBatchId: batchId, recommendationRecordStatus: "persisted" as const, scorerVersion: scorerIdentity.scorerVersion }
}

/** Metadata is recovered from the immutable batch, never from the caller. */
export async function recordAdoption(recommendationId: string, directory = resolve(process.cwd(), ".data", "news4-recommendations"), clickedAt = new Date().toISOString()) {
  const match = /^([a-f0-9]{64}):([1-9]\d{0,8})$/.exec(recommendationId)
  if (!match || !Number.isFinite(Date.parse(clickedAt))) throw new Error("Invalid adoption input")
  const [, batchSha, positionText] = match
  const position = Number(positionText)
  const folder = resolve(directory)
  const bytes = await readFile(join(folder, `${batchSha}.json`), "utf8")
  if (createHash("sha256").update(bytes).digest("hex") !== batchSha) throw new Error("Recommendation batch corruption")
  const batch = JSON.parse(bytes)
  const source = batch.records?.[position - 1]
  if (batch.schemaVersion !== 1 || batch.kind !== "api-recommendation-batch" || !source || source.position !== position
    || typeof source.title !== "string" || typeof source.url !== "string" || !Number.isFinite(source.score)
    || typeof source.scorerVersion !== "string") {
    throw new Error("Invalid recommendation record")
  }
  const record = {
    schemaVersion: 1,
    kind: "explicit-adoption",
    recommendationId,
    batchSha,
    position,
    title: source.title,
    url: source.url,
    score: source.score,
    scorerVersion: source.scorerVersion,
    inputSha256: source.inputSha256,
    rulesSha256: source.rulesSha256,
    weightsSha256: source.weightsSha256,
  }
  const adoptions = join(folder, "adoptions")
  await mkdir(adoptions, { recursive: true, mode: 0o700 })
  const target = join(adoptions, `${batchSha}-${position}.json`)
  const temporary = join(adoptions, `.${randomUUID()}.tmp`)
  let handle
  let created = false
  try {
    handle = await open(temporary, "wx", 0o600)
    created = true
    await handle.writeFile(`${JSON.stringify({ ...record, clickedAt })}\n`, "utf8")
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      await link(temporary, target)
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error
      const { clickedAt: firstClick, ...identity } = JSON.parse(await readFile(target, "utf8"))
      if (JSON.stringify(identity) !== JSON.stringify(record) || typeof firstClick !== "string" || !Number.isFinite(Date.parse(firstClick))) throw new Error("Adoption record corruption")
      return { recommendationId, clickedAt: firstClick, status: "recorded" as const, alreadyRecorded: true }
    }
    return { recommendationId, clickedAt, status: "recorded" as const, alreadyRecorded: false }
  } finally {
    if (handle) await handle.close()
    if (created) await unlink(temporary)
  }
}
