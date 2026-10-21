import _sources from "./sources.json"
import type { Source, SourceID } from "./types"

const sources = _sources as Record<SourceID, Source>
export { sources }
export default sources
