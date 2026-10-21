import { fileURLToPath } from "node:url"

const projectDir = fileURLToPath(new URL("..", import.meta.url))
export { projectDir }
