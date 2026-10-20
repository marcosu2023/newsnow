import { createHash } from "node:crypto"
import process from "node:process"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { createApp, createError, createRouter, defineEventHandler, getHeader, getRequestURL, toNodeListener } from "h3"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { recordAdoption, recordRecommendations } from "../server/lib/news4-recommendations"
import { scoreAndRank } from "../server/lib/viral-scorer"
import adoption from "../server/api/news4-adoptions.post"

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

// Real HTTP parsing, global auth, adoption handler and filesystem writes.
// Only cwd is redirected so production's default storage path uses a temp directory.
async function withAdoptionApp(check: (base: string, id: string, storage: string) => Promise<void>) {
  const cwd = join(directory, "app")
  const storage = join(cwd, ".data", "news4-recommendations")
  const batch = await recordRecommendations(snapshot(), storage)
  // Supply Nitro's auto-imports using the real H3 implementations.
  for (const [name, value] of Object.entries({ defineEventHandler, getHeader, getRequestURL, createError })) vi.stubGlobal(name, value)
  const { default: auth } = await import("../server/middleware/auth")
  const app = createApp()
  app.use(auth)
  app.use(createRouter().post("/api/news4-adoptions", adoption))
  const server = createServer(toNodeListener(app))
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwd)
  for (const key of ["JWT_SECRET", "G_CLIENT_ID", "G_CLIENT_SECRET"]) vi.stubEnv(key, "")
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing HTTP listener")
    await check(`http://127.0.0.1:${address.port}`, `${batch.recommendationBatchId}:1`, storage)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    cwdSpy.mockRestore()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  }
}

function adoptOverHttp(base: string, id: string, headers = {}, extra = {}) {
  return fetch(`${base}/api/news4-adoptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ recommendationId: id, ...extra }),
  })
}

it("allows a valid adoption through global auth without login and persists trusted metadata", async () => {
  await withAdoptionApp(async (base, id, storage) => {
    const response = await adoptOverHttp(base, id, { Origin: base })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ recommendationId: id, status: "recorded", alreadyRecorded: false })
    const record = JSON.parse(await readFile(join(storage, "adoptions", `${id.replace(":", "-")}.json`), "utf8"))
    expect(record).toMatchObject({ recommendationId: id, title: snapshot().picks[0].title, score: snapshot().picks[0].finalScore })
  })
})

it("rejects cross-origin and cross-site adoption requests through the full chain", async () => {
  await withAdoptionApp(async (base, id, storage) => {
    expect((await adoptOverHttp(base, id, { Origin: "https://untrusted.invalid" })).status).toBe(403)
    expect((await adoptOverHttp(base, id, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403)
    await expect(readdir(join(storage, "adoptions"))).rejects.toMatchObject({ code: "ENOENT" })
  })
})

it("rejects invalid IDs and caller-supplied metadata through real body parsing", async () => {
  await withAdoptionApp(async (base, id, storage) => {
    expect((await adoptOverHttp(base, "../invalid")).status).toBe(400)
    expect((await adoptOverHttp(base, id, {}, { score: 999 })).status).toBe(400)
    await expect(readdir(join(storage, "adoptions"))).rejects.toMatchObject({ code: "ENOENT" })
  })
})

it("keeps other non-allowlisted API requests blocked without login configuration", async () => {
  await withAdoptionApp(async (base) => {
    expect((await fetch(`${base}/api/me`)).status).toBe(506)
    expect((await fetch(`${base}/api/unlisted`, { method: "POST" })).status).toBe(506)
  })
})

it("keeps repeated and concurrent HTTP adoptions idempotent", async () => {
  await withAdoptionApp(async (base, id, storage) => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => adoptOverHttp(base, id)))
    expect(responses.every(r => r.status === 200)).toBe(true)
    const records = await Promise.all(responses.map(r => r.json()))
    expect(records.filter(r => !r.alreadyRecorded)).toHaveLength(1)
    expect(new Set(records.map(r => r.clickedAt)).size).toBe(1)
    expect(await readdir(join(storage, "adoptions"))).toEqual([`${id.replace(":", "-")}.json`])
  })
})

it("returns 503 for actual filesystem failure through the full HTTP chain", async () => {
  await withAdoptionApp(async (base, id, storage) => {
    await writeFile(join(storage, "adoptions"), "not a directory")
    const response = await adoptOverHttp(base, id)
    expect(response.status).toBe(503)
    expect(await response.json()).not.toMatchObject({ status: "recorded" })
    expect(await readFile(join(storage, "adoptions"), "utf8")).toBe("not a directory")
  })
})
