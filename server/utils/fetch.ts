import process from "node:process"
import { $fetch } from "ofetch"

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
}

export const myFetch = $fetch.create({
  headers: defaultHeaders,
  timeout: 10000,
  retry: 3,
})

/**
 * Proxy-aware fetch for sources blocked in China (Reuters, FT, Google Translate, etc.)
 * Reads HTTPS_PROXY / HTTP_PROXY env var. Falls back to direct fetch if unset.
 */
let _proxyFetchInstance: Promise<typeof $fetch> | null = null

function initProxyFetch(): Promise<typeof $fetch> {
  if (_proxyFetchInstance) return _proxyFetchInstance

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (!proxyUrl) {
    _proxyFetchInstance = Promise.resolve(myFetch)
    return _proxyFetchInstance
  }

  _proxyFetchInstance = import("undici").then(({ ProxyAgent }) => {
    return $fetch.create({
      headers: defaultHeaders,
      timeout: 15000,
      retry: 3,
      dispatcher: new ProxyAgent(proxyUrl),
    })
  }).catch((error) => {
    console.error("[proxyFetch] Failed to initialize proxy dispatcher; falling back to direct fetch", error)
    return myFetch
  })

  return _proxyFetchInstance
}

export async function proxyFetch(url: string, opts?: any) {
  const pf = await initProxyFetch()
  return pf(url, opts)
}
