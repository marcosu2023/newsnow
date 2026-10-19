import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { recordAdoption, recordRecommendations } from "../server/lib/news4-recommendations"
import { scoreAndRank } from "../server/lib/viral-scorer"

const root = resolve(".test-output")
let directory: string
const now = Date.parse("2026-10-19T00:00:00Z")
function snapshot() {
  return {
    fetchedAt: now,
    totalScanned: 1,
    sourcesScanned: 1,
    picks: scoreAndRank([{ title: "美国企业成本上升", summary: "消费者支出下滑", sourceId: "reuters", sourceName: "路透社", url: "https://example.com/a", pubDate: now }], now),
  }
}
it("records an adoption once under concurrent retries, using trusted batch metadata", async () => {
  const batch = await recordRecommendations(snapshot(), directory)
  const id = `${batch.recommendationBatchId}:1`
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => recordAdoption(id, directory, new Date(now + i * 1000).toISOString())))
  expect(results.filter(r => !r.alreadyRecorded)).toHaveLength(1)
  expect(new Set(results.map(r => r.clickedAt)).size).toBe(1)
  const names = await readdir(join(directory, "adoptions"))
  expect(names).toEqual([`${batch.recommendationBatchId}-1.json`])
  const record = JSON.parse(await readFile(join(directory, "adoptions", names[0]), "utf8"))
  expect(record).toMatchObject({ recommendationId: id, batchSha: batch.recommendationBatchId, title: snapshot().picks[0].title, url: snapshot().picks[0].url, score: snapshot().picks[0].finalScore, scorerVersion: snapshot().picks[0].scorerVersion })
})
it("rejects missing, malformed, out-of-range and corrupted recommendations", async () => {
  await expect(recordAdoption("../escape:1", directory)).rejects.toThrow("Invalid")
  await expect(recordAdoption(`${"a".repeat(64)}:1`, directory)).rejects.toThrow()
  const batch = await recordRecommendations(snapshot(), directory)
  await expect(recordAdoption(`${batch.recommendationBatchId}:2`, directory)).rejects.toThrow("Invalid recommendation")
  await writeFile(join(directory, `${batch.recommendationBatchId}.json`), "{}")
  await expect(recordAdoption(`${batch.recommendationBatchId}:1`, directory)).rejects.toThrow("corruption")
})
it("does not pretend a failed adoption write succeeded", async () => {
  const batch = await recordRecommendations(snapshot(), directory)
  await writeFile(join(directory, "adoptions"), "not a directory")
  await expect(recordAdoption(`${batch.recommendationBatchId}:1`, directory)).rejects.toThrow()
})
beforeEach(async () => {
  await mkdir(root, { recursive: true })
  directory = await mkdtemp(join(root, "receipts-"))
})
afterEach(async () => {
  if (!resolve(directory).startsWith(root + sep)) throw new Error("Unsafe test cleanup")
  await rm(directory, { recursive: true, force: true })
})
it("persists the exact score, input, provenance and immutable version with verifiable content ID", async () => {
  const data = snapshot()
  const receipt = await recordRecommendations(data, directory)
  const bytes = await readFile(join(directory, `${receipt.recommendationBatchId}.json`), "utf8")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(receipt.recommendationBatchId)
  expect(JSON.parse(bytes).records[0]).toMatchObject({
    title: data.picks[0].title,
    summary: data.picks[0].summary,
    score: data.picks[0].finalScore,
    scorerVersion: data.picks[0].scorerVersion,
    inputSha256: data.picks[0].inputSha256,
    rulesSha256: data.picks[0].rulesSha256,
    weightsSha256: data.picks[0].weightsSha256,
  })
})
it("deduplicates concurrent identical requests without leaving temporary files", async () => {
  const receipts = await Promise.all(Array.from({ length: 8 }, () => recordRecommendations(snapshot(), directory)))
  expect(new Set(receipts.map(x => x.recommendationBatchId)).size).toBe(1)
  expect(await readdir(directory)).toEqual([`${receipts[0].recommendationBatchId}.json`])
})
it("rejects corruption without overwriting it", async () => {
  const receipt = await recordRecommendations(snapshot(), directory)
  const path = join(directory, `${receipt.recommendationBatchId}.json`)
  await writeFile(path, "corrupt")
  await expect(recordRecommendations(snapshot(), directory)).rejects.toThrow("corruption")
  expect(await readFile(path, "utf8")).toBe("corrupt")
})
it("rejects an invalid score before creating a receipt", async () => {
  const data = snapshot()
  data.picks[0].finalScore = Number.NaN
  await expect(recordRecommendations(data, directory)).rejects.toThrow("Invalid")
  expect(await readdir(directory)).toEqual([])
})
