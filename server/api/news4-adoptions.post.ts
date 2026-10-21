import { createError, defineEventHandler, getHeader, getRequestURL, readBody } from "h3"
import { recordAdoption } from "../lib/news4-recommendations"

export default defineEventHandler(async (event) => {
  const origin = getHeader(event, "origin")
  if ((origin && origin !== getRequestURL(event).origin) || getHeader(event, "sec-fetch-site") === "cross-site") {
    throw createError({ statusCode: 403, statusMessage: "Same-origin request required" })
  }
  const body = await readBody(event)
  if (!body || typeof body.recommendationId !== "string" || !/^[a-f0-9]{64}:[1-9]\d{0,8}$/.test(body.recommendationId) || Object.keys(body).length !== 1) {
    throw createError({ statusCode: 400, statusMessage: "Valid recommendationId required" })
  }
  try {
    return await recordAdoption(body.recommendationId)
  } catch {
    throw createError({ statusCode: 503, statusMessage: "Adoption not recorded" })
  }
})
