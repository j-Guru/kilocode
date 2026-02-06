// kilocode_change - new file
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LenientXmlParsingControl } from "../LenientXmlParsingControl"

// Mock the translation context
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"settings:advanced.lenientXmlParsing.label": "Enable lenient XML tool parsing",
				"settings:advanced.lenientXmlParsing.description":
					"When enabled, Kilo Code will attempt to recover tool calls from malformed XML responses. This is useful for models like DeepSeek that may generate imperfect XML formatting. Automatically enabled for compatible models.",
			}
			return translations[key] || key
		},
	}),
}))

describe("LenientXmlParsingControl", () => {
	it("should render the control with checkbox", () => {
		const onChange = vi.fn()
		render(<LenientXmlParsingControl enableXmlToolParsing={false} onChange={onChange} />)

		expect(screen.getByText("Enable lenient XML tool parsing")).toBeInTheDocument()
		expect(
			screen.getByText(
				/When enabled, Kilo Code will attempt to recover tool calls from malformed XML responses/i,
			),
		).toBeInTheDocument()
	})

	it("should render with unchecked checkbox by default", () => {
		const onChange = vi.fn()
		render(<LenientXmlParsingControl enableXmlToolParsing={false} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).not.toBeChecked()
	})

	it("should render with checked checkbox when enabled", () => {
		const onChange = vi.fn()
		render(<LenientXmlParsingControl enableXmlToolParsing={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).toBeChecked()
	})

	it("should call onChange with correct arguments when checkbox is clicked", async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(<LenientXmlParsingControl enableXmlToolParsing={false} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		await user.click(checkbox)

		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenCalledWith("enableXmlToolParsing", true)
	})

	it("should call onChange with false when unchecking", async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(<LenientXmlParsingControl enableXmlToolParsing={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		await user.click(checkbox)

		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenCalledWith("enableXmlToolParsing", false)
	})

	it("should use false as default when enableXmlToolParsing is undefined", () => {
		const onChange = vi.fn()
		render(<LenientXmlParsingControl onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).not.toBeChecked()
	})
})
