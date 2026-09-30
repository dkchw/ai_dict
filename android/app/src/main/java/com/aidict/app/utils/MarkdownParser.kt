package com.aidict.app.utils

object MarkdownParser {
    fun extractMetadata(markdown: String): Pair<String?, String?> {
        val langRegex = Regex("""\*\s*\*\*Language\*\*:\s*([^\n]+)""")
        val lemmaRegex = Regex("""\*\s*\*\*Base form \(lemma\)\*\*:\s*([^\n]+)""")

        val language = langRegex.find(markdown)?.groupValues?.get(1)?.trim()
        val lemma = lemmaRegex.find(markdown)?.groupValues?.get(1)?.trim()

        return Pair(language, lemma)
    }
}
