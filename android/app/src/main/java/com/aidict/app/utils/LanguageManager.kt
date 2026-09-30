package com.aidict.app.utils

object LanguageManager {
    val defaultLanguages = listOf(
        "Auto Detect", "English", "Vietnamese", "German", "French", "Spanish", 
        "Japanese", "Chinese", "Korean", "Russian", "Italian", "Portuguese", 
        "Dutch", "Arabic", "Hindi", "Bengali", "Turkish", "Polish", "Thai", "Swedish"
    )

    private val FLAG_MAP = mutableMapOf(
        "Auto Detect" to "🤖 Auto",
        "English" to "🇬🇧 EN",
        "Vietnamese" to "🇻🇳 VI",
        "French" to "🇫🇷 FR",
        "Spanish" to "🇪🇸 ES",
        "German" to "🇩🇪 DE",
        "Japanese" to "🇯🇵 JA",
        "Chinese" to "🇨🇳 ZH",
        "Korean" to "🇰🇷 KO",
        "Russian" to "🇷🇺 RU",
        "Italian" to "🇮🇹 IT",
        "Portuguese" to "🇵🇹 PT",
        "Dutch" to "🇳🇱 NL",
        "Arabic" to "🇸🇦 AR",
        "Hindi" to "🇮🇳 HI",
        "Bengali" to "🇧🇩 BN",
        "Turkish" to "🇹🇷 TR",
        "Polish" to "🇵🇱 PL",
        "Thai" to "🇹🇭 TH",
        "Swedish" to "🇸🇪 SV"
    )

    fun getAllAvailable(customLanguagesCsv: String?): List<String> {
        val customMap = customLanguagesCsv?.split(",")?.mapNotNull { val parts = it.split("|"); if (parts.size == 2) parts[0].trim() to parts[1].trim() else null }?.toMap() ?: emptyMap()
        return (defaultLanguages + customMap.keys).distinct()
    }

    fun getOrderedLanguages(starredCsv: String?, customLanguagesCsv: String?): List<String> {
        val customMap = customLanguagesCsv?.split(",")?.mapNotNull { 
            val parts = it.split("|")
            if (parts.size == 2) parts[0].trim() to parts[1].trim() else null 
        }?.toMap() ?: emptyMap()
        
        FLAG_MAP.putAll(customMap)

        val allAvailable = (defaultLanguages + customMap.keys).distinct()

        val starred = starredCsv?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() } ?: listOf("English", "Vietnamese", "German", "Spanish", "French")
        
        val autoDetect = if (starred.contains("Auto Detect")) emptyList() else listOf("Auto Detect")
        val orderedStarred = autoDetect + starred
        
        val remaining = allAvailable.filter { !orderedStarred.contains(it) }
        return orderedStarred + remaining
    }

    fun getDisplayFlag(language: String): String {
        return FLAG_MAP[language] ?: language.take(4).uppercase()
    }
}
