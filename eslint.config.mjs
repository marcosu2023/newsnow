import { ourongxing, react } from "@ourongxing/eslint-config"

/** @type {ReturnType<typeof ourongxing>} */
const config = ourongxing({
  type: "app",
  // 貌似不能 ./ 开头，
  ignores: ["src/routeTree.gen.ts", "imports.app.d.ts", "public/", ".vscode", "**/*.json"],
}).append(react({
  files: ["src/**"],
}))

export default config
