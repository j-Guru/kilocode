// kilocode_change - new file
import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

interface LenientXmlParsingControlProps {
	enableXmlToolParsing?: boolean
	onChange: (field: "enableXmlToolParsing", value: any) => void
}

export const LenientXmlParsingControl: React.FC<LenientXmlParsingControlProps> = ({
	enableXmlToolParsing = false,
	onChange,
}) => {
	const { t } = useAppTranslation()

	const handleXmlToolParsingChange = useCallback(
		(e: any) => {
			onChange("enableXmlToolParsing", e.target.checked)
		},
		[onChange],
	)

	return (
		<div className="flex flex-col gap-1">
			<div>
				<VSCodeCheckbox checked={enableXmlToolParsing} onChange={handleXmlToolParsingChange}>
					<span className="font-medium">{t("settings:advanced.lenientXmlParsing.label")}</span>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm">
					{t("settings:advanced.lenientXmlParsing.description")}
				</div>
			</div>
		</div>
	)
}
