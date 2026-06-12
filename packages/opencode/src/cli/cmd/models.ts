import { EOL } from "os"
import { Effect } from "effect"
import { ModelsDev } from "@opencode-ai/core/models"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"

export const ModelsCommand = effectCmd({
  command: "models [provider]",
  describe: "list all available models",
  instance: false, // kilocode_change - avoid project bootstrap for catalog-only command
  builder: (yargs) =>
    yargs
      .positional("provider", {
        describe: "provider ID to filter models by",
        type: "string",
        array: false,
      })
      .option("verbose", {
        describe: "use more verbose model output (includes metadata like costs)",
        type: "boolean",
      })
      .option("refresh", {
        describe: "refresh the models cache from models.dev",
        type: "boolean",
      }),
  handler: Effect.fn("Cli.models")(function* (args) {
    if (args.refresh) {
      yield* ModelsDev.Service.use((s) => s.refresh(true))
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
    }

    const svc = yield* ModelsDev.Service
    const providers = yield* svc.get()

    const print = (id: string, verbose?: boolean) => {
      const p = providers[id]
      const sorted = Object.entries(p.models).sort(([a], [b]) => a.localeCompare(b))
      for (const [modelID, model] of sorted) {
        process.stdout.write(`${id}/${modelID}`)
        process.stdout.write(EOL)
        if (verbose) {
          process.stdout.write(JSON.stringify(model, null, 2))
          process.stdout.write(EOL)
        }
      }
    }

    if (args.provider) {
      if (!providers[args.provider]) return yield* fail(`Provider not found: ${args.provider}`)
      print(args.provider, args.verbose)
      return
    }

    // kilocode_change start
    const ids = Object.keys(providers).sort((a, b) => {
      const aIsKilo = a === "kilo" || a.startsWith("opencode")
      const bIsKilo = b === "kilo" || b.startsWith("opencode")
      if (aIsKilo && !bIsKilo) return -1
      if (!aIsKilo && bIsKilo) return 1
      return a.localeCompare(b)
    })
    // kilocode_change end

    for (const id of ids) print(id, args.verbose)
  }),
})
