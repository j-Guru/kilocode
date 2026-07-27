import "@opencode-ai/tui/component/spinner"
import { getComponentCatalogue } from "@opentui/solid/components"

if (!getComponentCatalogue().spinner) {
  throw new Error("OpenTUI spinner component was not registered")
}
