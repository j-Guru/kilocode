import { expect, test } from "bun:test"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import path from "node:path"
import { tmpdir } from "../../../fixture/fixture"

test("compiled TUI registers the spinner component", async () => {
  await using tmp = await tmpdir()
  const out = path.join(tmp.path, "spinner-registration.exe")
  const entry = path.join(import.meta.dir, "../../fixture/spinner-registration.ts")
  const result = await Bun.build({
    entrypoints: [entry],
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadPackageJson: true,
      autoloadTsconfig: true,
      outfile: out,
      target: "bun-windows-x64",
    },
    conditions: ["bun", "node"],
    format: "esm",
    minify: true,
    plugins: [createSolidTransformPlugin()],
  })

  expect(result.success).toBe(true)
  const proc = Bun.spawn([out], {
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    env: {
      ...process.env,
      HOME: tmp.path,
      KILO_TEST_HOME: tmp.path,
      XDG_CACHE_HOME: path.join(tmp.path, "cache"),
      XDG_CONFIG_HOME: path.join(tmp.path, "config"),
      XDG_DATA_HOME: path.join(tmp.path, "data"),
      XDG_STATE_HOME: path.join(tmp.path, "state"),
    },
  })
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])

  expect(code, stderr).toBe(0)
  expect(stderr).toBe("")
})
