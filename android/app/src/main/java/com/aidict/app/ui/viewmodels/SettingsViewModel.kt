package com.aidict.app.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.LlmRepository
import com.aidict.app.data.entities.AppSetting
import com.aidict.app.data.entities.Profile
import com.aidict.app.utils.DefaultPrompts
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ProfileSettingItem(
    val key: String,
    val effectiveValue: String,
    val isCustom: Boolean,
    val globalValue: String,
    val defaultValue: String
)

data class ProfileAiConfig(
    val selectedProfileId: Int?,
    val selectedProfileName: String,
    val dictModel: ProfileSettingItem,
    val compareModel: ProfileSettingItem,
    val explainModel: ProfileSettingItem,
    val translateModel: ProfileSettingItem,
    val correctModel: ProfileSettingItem,
    val fallbackModels: ProfileSettingItem,
    val chatModel: ProfileSettingItem,
    val dictReasoning: ProfileSettingItem,
    val compareReasoning: ProfileSettingItem,
    val explainReasoning: ProfileSettingItem,
    val translateReasoning: ProfileSettingItem,
    val correctReasoning: ProfileSettingItem,
    val fallbackReasoning: ProfileSettingItem,
    val chatReasoning: ProfileSettingItem,
    val dictPrompt: ProfileSettingItem,
    val comparePrompt: ProfileSettingItem,
    val explainPrompt: ProfileSettingItem,
    val translatePrompt: ProfileSettingItem,
    val correctPrompt: ProfileSettingItem,
    val simpleLlmModel: ProfileSettingItem,
    val simpleLlmDefaultPrompt: ProfileSettingItem,
    val hasCustomOverrides: Boolean
)

class SettingsViewModel(
    private val database: AppDatabase,
    private val llmRepository: LlmRepository
) : ViewModel() {

    val apiKey = getSettingFlow("OPENROUTER_API_KEY", "")
    val isDarkMode = database.appDao().getSettingsFlow()
        .map { settings -> settings.find { it.key == "DARK_MODE" }?.value?.toBooleanStrictOrNull() ?: true }
        .stateIn(viewModelScope, SharingStarted.Lazily, true)

    val appTheme = getSettingFlow("APP_THEME", "tokyonight")


    val dictModel = getSettingFlow("DICT_MODEL", "deepseek/deepseek-v4-flash-0731")
    val compareModel = getSettingFlow("COMPARE_MODEL", "deepseek/deepseek-v4-flash-0731")
    val explainModel = getSettingFlow("EXPLAIN_MODEL", "deepseek/deepseek-v4-flash-0731")
    val translateModel = getSettingFlow("TRANSLATE_MODEL", "deepseek/deepseek-v4-flash-0731")
    val correctModel = getSettingFlow("CORRECT_MODEL", "deepseek/deepseek-v4-flash-0731")
    
    val dictReasoning = getSettingFlow("DICT_REASONING", "default")
    val compareReasoning = getSettingFlow("COMPARE_REASONING", "default")
    val explainReasoning = getSettingFlow("EXPLAIN_REASONING", "default")
    val translateReasoning = getSettingFlow("TRANSLATE_REASONING", "default")
    val correctReasoning = getSettingFlow("CORRECT_REASONING", "default")
    val fallbackReasoning = getSettingFlow("FALLBACK_REASONING", "default")
    val chatReasoning = getSettingFlow("CHAT_REASONING", "default")
    
    val autoNewSearch = getSettingFlow("AUTO_NEW_SEARCH", "false")
    val enterToSend = getSettingFlow("ENTER_TO_SEND", "false")
    val persistentBackground = getSettingFlow("PERSISTENT_BACKGROUND_SERVICE", "false")
    
    val fallbackModels = getSettingFlow("FALLBACK_MODELS", "google/gemini-3.8-flash")
    val chatModel = getSettingFlow("CHAT_MODEL", "deepseek/deepseek-v4-flash-0731")

    val dictPrompt = getSettingFlow("DICT_PROMPT", DefaultPrompts.DICT_PROMPT)
    val explainPrompt = getSettingFlow("EXPLAIN_PROMPT", DefaultPrompts.EXPLAIN_PROMPT)
    val starredLanguages = getSettingFlow("STARRED_LANGUAGES", "English, Vietnamese, German, French, Spanish, Japanese, Chinese, Korean, Russian, Italian, Portuguese")
    val allAvailableLanguages = database.appDao().getSettingsFlow().map { s -> com.aidict.app.utils.LanguageManager.getAllAvailable(s.find { it.key == "CUSTOM_LANGUAGES" }?.value) }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, com.aidict.app.utils.LanguageManager.getAllAvailable(null))
    val orderedLanguages = database.appDao().getSettingsFlow().map { s -> com.aidict.app.utils.LanguageManager.getOrderedLanguages(s.find { it.key == "STARRED_LANGUAGES" }?.value, s.find { it.key == "CUSTOM_LANGUAGES" }?.value) }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, com.aidict.app.utils.LanguageManager.getOrderedLanguages(null, null))

    val translatePrompt = getSettingFlow("TRANSLATE_PROMPT", DefaultPrompts.TRANSLATE_PROMPT)
    val comparePrompt = getSettingFlow("COMPARE_PROMPT", DefaultPrompts.COMPARE_PROMPT)
    val correctPrompt = getSettingFlow("CORRECT_PROMPT", DefaultPrompts.CORRECT_PROMPT)
    val simpleLlmModel = getSettingFlow("SIMPLE_LLM_MODEL", "inclusionai/ling-3.0-flash")
    val simpleLlmDefaultPrompt = getSettingFlow("SIMPLE_LLM_DEFAULT_PROMPT", "quick_glance")
    
    
    val profiles = database.appDao().getProfiles()
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    private val _selectedProfileId = MutableStateFlow<Int?>(null)
    val selectedProfileId: StateFlow<Int?> = _selectedProfileId.asStateFlow()

    fun selectProfileScope(profileId: Int?) {
        _selectedProfileId.value = profileId
    }

    val aiConfig: StateFlow<ProfileAiConfig> = combine(
        _selectedProfileId,
        database.appDao().getSettingsFlow(),
        profiles
    ) { selId, settings, profileList ->
        val profileName = if (selId == null) {
            "Global Defaults"
        } else {
            profileList.find { it.id == selId }?.name ?: "Profile #$selId"
        }

        fun resolveItem(key: String, defaultVal: String): ProfileSettingItem {
            val globalVal = settings.find { it.key == key }?.value?.trim()?.ifEmpty { null } ?: defaultVal
            if (selId == null) {
                return ProfileSettingItem(
                    key = key,
                    effectiveValue = globalVal,
                    isCustom = false,
                    globalValue = globalVal,
                    defaultValue = defaultVal
                )
            } else {
                val profileVal = settings.find { it.key == "PROFILE_${selId}_$key" }?.value?.trim()?.ifEmpty { null }
                val isCustom = profileVal != null
                return ProfileSettingItem(
                    key = key,
                    effectiveValue = profileVal ?: globalVal,
                    isCustom = isCustom,
                    globalValue = globalVal,
                    defaultValue = defaultVal
                )
            }
        }

        val dModel = resolveItem("DICT_MODEL", "deepseek/deepseek-v4-flash-0731")
        val cModel = resolveItem("COMPARE_MODEL", "deepseek/deepseek-v4-flash-0731")
        val eModel = resolveItem("EXPLAIN_MODEL", "deepseek/deepseek-v4-flash-0731")
        val tModel = resolveItem("TRANSLATE_MODEL", "deepseek/deepseek-v4-flash-0731")
        val crModel = resolveItem("CORRECT_MODEL", "deepseek/deepseek-v4-flash-0731")
        val fModel = resolveItem("FALLBACK_MODELS", "google/gemini-3.8-flash")
        val chModel = resolveItem("CHAT_MODEL", "deepseek/deepseek-v4-flash-0731")

        val dReasoning = resolveItem("DICT_REASONING", "default")
        val cReasoning = resolveItem("COMPARE_REASONING", "default")
        val eReasoning = resolveItem("EXPLAIN_REASONING", "default")
        val tReasoning = resolveItem("TRANSLATE_REASONING", "default")
        val crReasoning = resolveItem("CORRECT_REASONING", "default")
        val fReasoning = resolveItem("FALLBACK_REASONING", "default")
        val chReasoning = resolveItem("CHAT_REASONING", "default")

        val dPrompt = resolveItem("DICT_PROMPT", DefaultPrompts.DICT_PROMPT)
        val cPrompt = resolveItem("COMPARE_PROMPT", DefaultPrompts.COMPARE_PROMPT)
        val ePrompt = resolveItem("EXPLAIN_PROMPT", DefaultPrompts.EXPLAIN_PROMPT)
        val tPrompt = resolveItem("TRANSLATE_PROMPT", DefaultPrompts.TRANSLATE_PROMPT)
        val crPrompt = resolveItem("CORRECT_PROMPT", DefaultPrompts.CORRECT_PROMPT)
        val sLlmModel = resolveItem("SIMPLE_LLM_MODEL", "inclusionai/ling-3.0-flash")
        val sLlmDefaultPrompt = resolveItem("SIMPLE_LLM_DEFAULT_PROMPT", "quick_glance")

        val hasAnyCustom = selId != null && (
            dModel.isCustom || cModel.isCustom || eModel.isCustom || tModel.isCustom || crModel.isCustom ||
            fModel.isCustom || chModel.isCustom ||
            dReasoning.isCustom || cReasoning.isCustom || eReasoning.isCustom ||
            tReasoning.isCustom || crReasoning.isCustom || fReasoning.isCustom || chReasoning.isCustom ||
            dPrompt.isCustom || cPrompt.isCustom || ePrompt.isCustom || tPrompt.isCustom || crPrompt.isCustom ||
            sLlmModel.isCustom || sLlmDefaultPrompt.isCustom
        )

        ProfileAiConfig(
            selectedProfileId = selId,
            selectedProfileName = profileName,
            dictModel = dModel,
            compareModel = cModel,
            explainModel = eModel,
            translateModel = tModel,
            correctModel = crModel,
            fallbackModels = fModel,
            chatModel = chModel,
            dictReasoning = dReasoning,
            compareReasoning = cReasoning,
            explainReasoning = eReasoning,
            translateReasoning = tReasoning,
            correctReasoning = crReasoning,
            fallbackReasoning = fReasoning,
            chatReasoning = chReasoning,
            dictPrompt = dPrompt,
            comparePrompt = cPrompt,
            explainPrompt = ePrompt,
            translatePrompt = tPrompt,
            correctPrompt = crPrompt,
            simpleLlmModel = sLlmModel,
            simpleLlmDefaultPrompt = sLlmDefaultPrompt,
            hasCustomOverrides = hasAnyCustom
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.Lazily,
        ProfileAiConfig(
            selectedProfileId = null,
            selectedProfileName = "Global Defaults",
            dictModel = ProfileSettingItem("DICT_MODEL", "deepseek/deepseek-v4-flash-0731", false, "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"),
            compareModel = ProfileSettingItem("COMPARE_MODEL", "deepseek/deepseek-v4-flash-0731", false, "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"),
            explainModel = ProfileSettingItem("EXPLAIN_MODEL", "deepseek/deepseek-v4-flash-0731", false, "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"),
            translateModel = ProfileSettingItem("TRANSLATE_MODEL", "deepseek/deepseek-v4-flash-0731", false, "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"),
            correctModel = ProfileSettingItem("CORRECT_MODEL", "deepseek/deepseek-v4-flash-0731", false, "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"),
            fallbackModels = ProfileSettingItem("FALLBACK_MODELS", "google/gemini-3.8-flash", false, "google/gemini-3.8-flash", "google/gemini-3.8-flash"),
            chatModel = ProfileSettingItem("CHAT_MODEL", "deepseek/deepseek-v4-flash-0731", false, "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"),
            dictReasoning = ProfileSettingItem("DICT_REASONING", "default", false, "default", "default"),
            compareReasoning = ProfileSettingItem("COMPARE_REASONING", "default", false, "default", "default"),
            explainReasoning = ProfileSettingItem("EXPLAIN_REASONING", "default", false, "default", "default"),
            translateReasoning = ProfileSettingItem("TRANSLATE_REASONING", "default", false, "default", "default"),
            correctReasoning = ProfileSettingItem("CORRECT_REASONING", "default", false, "default", "default"),
            fallbackReasoning = ProfileSettingItem("FALLBACK_REASONING", "default", false, "default", "default"),
            chatReasoning = ProfileSettingItem("CHAT_REASONING", "default", false, "default", "default"),
            dictPrompt = ProfileSettingItem("DICT_PROMPT", DefaultPrompts.DICT_PROMPT, false, DefaultPrompts.DICT_PROMPT, DefaultPrompts.DICT_PROMPT),
            comparePrompt = ProfileSettingItem("COMPARE_PROMPT", DefaultPrompts.COMPARE_PROMPT, false, DefaultPrompts.COMPARE_PROMPT, DefaultPrompts.COMPARE_PROMPT),
            explainPrompt = ProfileSettingItem("EXPLAIN_PROMPT", DefaultPrompts.EXPLAIN_PROMPT, false, DefaultPrompts.EXPLAIN_PROMPT, DefaultPrompts.EXPLAIN_PROMPT),
            translatePrompt = ProfileSettingItem("TRANSLATE_PROMPT", DefaultPrompts.TRANSLATE_PROMPT, false, DefaultPrompts.TRANSLATE_PROMPT, DefaultPrompts.TRANSLATE_PROMPT),
            correctPrompt = ProfileSettingItem("CORRECT_PROMPT", DefaultPrompts.CORRECT_PROMPT, false, DefaultPrompts.CORRECT_PROMPT, DefaultPrompts.CORRECT_PROMPT),
            simpleLlmModel = ProfileSettingItem("SIMPLE_LLM_MODEL", "inclusionai/ling-3.0-flash", false, "inclusionai/ling-3.0-flash", "inclusionai/ling-3.0-flash"),
            simpleLlmDefaultPrompt = ProfileSettingItem("SIMPLE_LLM_DEFAULT_PROMPT", "quick_glance", false, "quick_glance", "quick_glance"),
            hasCustomOverrides = false
        )
    )

    fun saveAiSetting(key: String, value: String) {
        val selId = _selectedProfileId.value
        viewModelScope.launch {
            if (selId == null) {
                database.appDao().insertSetting(AppSetting(key, value))
            } else {
                database.appDao().insertSetting(AppSetting("PROFILE_${selId}_$key", value))
            }
        }
    }

    fun resetAiSetting(key: String) {
        val selId = _selectedProfileId.value
        viewModelScope.launch {
            if (selId != null) {
                database.appDao().deleteSetting("PROFILE_${selId}_$key")
            } else {
                database.appDao().deleteSetting(key)
            }
        }
    }

    fun resetCurrentProfileToDefaults() {
        val selId = _selectedProfileId.value ?: return
        viewModelScope.launch {
            database.appDao().deleteProfileSettings(selId)
        }
    }

    fun copyAiSettings(fromProfileId: Int?, toProfileId: Int) {
        viewModelScope.launch {
            val keys = listOf(
                "DICT_MODEL", "COMPARE_MODEL", "EXPLAIN_MODEL", "TRANSLATE_MODEL", "CORRECT_MODEL",
                "FALLBACK_MODELS", "CHAT_MODEL",
                "DICT_REASONING", "COMPARE_REASONING", "EXPLAIN_REASONING", "TRANSLATE_REASONING", "CORRECT_REASONING",
                "FALLBACK_REASONING", "CHAT_REASONING",
                "DICT_PROMPT", "COMPARE_PROMPT", "EXPLAIN_PROMPT", "TRANSLATE_PROMPT", "CORRECT_PROMPT",
                "SIMPLE_LLM_MODEL", "SIMPLE_LLM_DEFAULT_PROMPT",
                "SIMPLE_LLM_CUSTOM_LENSES", "SIMPLE_LLM_DELETED_LENSES"
            )
            for (k in keys) {
                val value = if (fromProfileId == null) {
                    database.appDao().getSetting(k)?.value
                } else {
                    database.appDao().getSetting("PROFILE_${fromProfileId}_$k")?.value
                        ?: database.appDao().getSetting(k)?.value
                }
                if (value != null) {
                    database.appDao().insertSetting(AppSetting("PROFILE_${toProfileId}_$k", value))
                }
            }
        }
    }

    private val _availableModels = MutableStateFlow<List<String>>(emptyList())
    val availableModels: StateFlow<List<String>> = _availableModels

    init {
        viewModelScope.launch {
            try {
                val oldModels = setOf("inclusionai/ling-3.0-flash", "~deepseek/deepseek-v4-flash-latest")
                val newDefaultModel = "deepseek/deepseek-v4-flash-0731"
                val newFallbackModel = "google/gemini-3.8-flash"
                val allSettings = database.appDao().getAllSettings()
                for (setting in allSettings) {
                    if (setting.value in oldModels) {
                        database.appDao().insertSetting(setting.copy(value = newDefaultModel))
                    } else if (setting.key.endsWith("FALLBACK_MODELS") && (setting.value in oldModels || setting.value == newDefaultModel)) {
                        database.appDao().insertSetting(setting.copy(value = newFallbackModel))
                    }
                }
            } catch (ignored: Exception) {}

            _availableModels.value = llmRepository.fetchModels()
        }
    }

    fun getSettingFlow(key: String, default: String): StateFlow<String> {
        return database.appDao().getSettingsFlow()
            .map { settings -> settings.find { it.key == key }?.value ?: default }
            .stateIn(viewModelScope, SharingStarted.Lazily, default)
    }

    fun refreshModels() {
        viewModelScope.launch {
            _availableModels.value = llmRepository.fetchModels()
        }
    }

    fun saveSetting(key: String, value: String) {
        viewModelScope.launch {
            database.appDao().insertSetting(AppSetting(key, value))
        }
    }

    fun toggleDarkMode(isDark: Boolean) {
        saveSetting("DARK_MODE", isDark.toString())
    }

    fun createProfile(name: String) {
        viewModelScope.launch {
            val maxRank = profiles.value.maxOfOrNull { it.rank } ?: -1
            database.appDao().insertProfile(Profile(name = name, rank = maxRank + 1, isDefault = false))
        }
    }

    fun renameProfile(profile: Profile, newName: String) {
        viewModelScope.launch {
            database.appDao().insertProfile(profile.copy(name = newName))
        }
    }

    fun deleteProfile(profile: Profile) {
        viewModelScope.launch {
            database.appDao().deleteProfileSettings(profile.id)
            database.appDao().deleteProfile(profile)
            if (_selectedProfileId.value == profile.id) {
                _selectedProfileId.value = null
            }
        }
    }

    fun getDatabase(): AppDatabase = database

    fun setDefaultProfile(profile: Profile) {
        viewModelScope.launch {
            val allProfiles = profiles.value
            allProfiles.forEach { p ->
                if (p.id == profile.id) {
                    database.appDao().insertProfile(p.copy(isDefault = true))
                } else if (p.isDefault) {
                    database.appDao().insertProfile(p.copy(isDefault = false))
                }
            }
        }
    }

    private suspend fun normalizeRanks(allProfiles: List<com.aidict.app.data.entities.Profile>): List<com.aidict.app.data.entities.Profile> {
        var needsUpdate = false
        val updated = allProfiles.mapIndexed { index, p -> 
            if (p.rank != index) needsUpdate = true
            p.copy(rank = index) 
        }
        if (needsUpdate) {
            updated.forEach { database.appDao().insertProfile(it) }
        }
        return updated
    }

    fun moveProfileUp(profile: com.aidict.app.data.entities.Profile) {
        viewModelScope.launch {
            val allProfiles = normalizeRanks(profiles.value.sortedBy { it.rank })
            val index = allProfiles.indexOfFirst { it.id == profile.id }
            if (index > 0) {
                val above = allProfiles[index - 1]
                val pToUpdate = allProfiles[index]
                
                val currentRank = pToUpdate.rank
                database.appDao().insertProfile(pToUpdate.copy(rank = above.rank))
                database.appDao().insertProfile(above.copy(rank = currentRank))
            }
        }
    }

    fun moveProfileDown(profile: com.aidict.app.data.entities.Profile) {
        viewModelScope.launch {
            val allProfiles = normalizeRanks(profiles.value.sortedBy { it.rank })
            val index = allProfiles.indexOfFirst { it.id == profile.id }
            if (index < allProfiles.size - 1) {
                val below = allProfiles[index + 1]
                val pToUpdate = allProfiles[index]
                
                val currentRank = pToUpdate.rank
                database.appDao().insertProfile(pToUpdate.copy(rank = below.rank))
                database.appDao().insertProfile(below.copy(rank = currentRank))
            }
        }
    }


    val bgDict = getSettingFlow("BG_DICT", "").map { it.ifBlank { null } }.stateIn(viewModelScope, SharingStarted.Lazily, null)
    val bgCompare = getSettingFlow("BG_COMPARE", "").map { it.ifBlank { null } }.stateIn(viewModelScope, SharingStarted.Lazily, null)
    val bgTranslate = getSettingFlow("BG_TRANSLATE", "").map { it.ifBlank { null } }.stateIn(viewModelScope, SharingStarted.Lazily, null)
    val bgExplain = getSettingFlow("BG_EXPLAIN", "").map { it.ifBlank { null } }.stateIn(viewModelScope, SharingStarted.Lazily, null)
    val bgCorrect = getSettingFlow("BG_CORRECT", "").map { it.ifBlank { null } }.stateIn(viewModelScope, SharingStarted.Lazily, null)
    
    val bgBlurRadius = getSettingFlow("BG_BLUR_RADIUS", "10.0").map { it.toFloatOrNull() ?: 10f }.stateIn(viewModelScope, SharingStarted.Lazily, 10f)
    val bgOpacity = getSettingFlow("BG_OPACITY", "1.0").map { it.toFloatOrNull() ?: 1f }.stateIn(viewModelScope, SharingStarted.Lazily, 1f)
    
    val bgUniversal = getSettingFlow("BG_UNIVERSAL", "").map { it.ifBlank { null } }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, null)
    val quoteStyle = getSettingFlow("QUOTE_STYLE", "Serif")
    val customQuotes = getSettingFlow("CUSTOM_QUOTES", "")
    val allQuotes = customQuotes.map { custom ->
        val defaults = listOf("Per studium ad sapientiam", "Labor omnia vincit", "Assiduitas mater scientiae", "Nulla dies sine linea", "Carpe diem", "Vincit qui se vincit")
        val customs = custom.split("|").filter { it.isNotBlank() }
        defaults + customs
    }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, listOf("Per studium ad sapientiam", "Labor omnia vincit", "Assiduitas mater scientiae", "Nulla dies sine linea", "Carpe diem", "Vincit qui se vincit"))
    val shuffleEnabledQuotes = database.appDao().getSettingsFlow().map { settings ->
        val jsonStr = settings.find { it.key == "SHUFFLE_ENABLED_QUOTES" }?.value
        if (!jsonStr.isNullOrBlank()) {
            try { kotlinx.serialization.json.Json.decodeFromString<List<String>>(jsonStr) } catch(e: Exception) { null }
        } else null
    }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, null)


    fun addCustomQuote(quote: String) {
        viewModelScope.launch {
            val current = database.appDao().getSetting("CUSTOM_QUOTES")?.value ?: ""
            val newCustom = if (current.isBlank()) quote else "$current|$quote"
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("CUSTOM_QUOTES", newCustom))
        }
    }
    val quoteMode = getSettingFlow("QUOTE_MODE", "None")

    fun addCustomLanguage(name: String, flagIso: String) {
        viewModelScope.launch {
            val current = database.appDao().getSetting("CUSTOM_LANGUAGES")?.value ?: ""
            val newEntry = "${name.trim()}|${flagIso.trim()}"
            val newCustom = if (current.isBlank()) newEntry else "$current,$newEntry"
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("CUSTOM_LANGUAGES", newCustom))
        }
    }

    fun saveCustomLens(lens: com.aidict.app.utils.QuickLlmLens, profileId: Int?) {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val key = if (profileId != null) "PROFILE_${profileId}_SIMPLE_LLM_CUSTOM_LENSES" else "SIMPLE_LLM_CUSTOM_LENSES"
            val raw = database.appDao().getSetting(key)?.value ?: database.appDao().getSetting("SIMPLE_LLM_CUSTOM_LENSES")?.value ?: ""
            val list = com.aidict.app.utils.DefaultPrompts.parseCustomLenses(raw).toMutableList()
            val idx = list.indexOfFirst { it.id == lens.id }
            if (idx >= 0) list[idx] = lens else list.add(lens)
            val newJson = com.aidict.app.utils.DefaultPrompts.serializeCustomLenses(list)
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting(key, newJson))
            if (profileId != null) database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("SIMPLE_LLM_CUSTOM_LENSES", newJson))

            // Un-delete if deleted
            val delKey = if (profileId != null) "PROFILE_${profileId}_SIMPLE_LLM_DELETED_LENSES" else "SIMPLE_LLM_DELETED_LENSES"
            val delRaw = database.appDao().getSetting(delKey)?.value ?: database.appDao().getSetting("SIMPLE_LLM_DELETED_LENSES")?.value ?: ""
            val deleted = com.aidict.app.utils.DefaultPrompts.parseDeletedLenses(delRaw).toMutableSet()
            if (deleted.remove(lens.id)) {
                val newDelJson = com.aidict.app.utils.DefaultPrompts.serializeDeletedLenses(deleted)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting(delKey, newDelJson))
                if (profileId != null) database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("SIMPLE_LLM_DELETED_LENSES", newDelJson))
            }
        }
    }

    fun deleteLens(lensId: String, profileId: Int?) {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val key = if (profileId != null) "PROFILE_${profileId}_SIMPLE_LLM_CUSTOM_LENSES" else "SIMPLE_LLM_CUSTOM_LENSES"
            val raw = database.appDao().getSetting(key)?.value ?: database.appDao().getSetting("SIMPLE_LLM_CUSTOM_LENSES")?.value ?: ""
            val list = com.aidict.app.utils.DefaultPrompts.parseCustomLenses(raw).toMutableList()
            val wasCustom = list.any { it.id == lensId }
            if (wasCustom) {
                list.removeAll { it.id == lensId }
                val newJson = com.aidict.app.utils.DefaultPrompts.serializeCustomLenses(list)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting(key, newJson))
                if (profileId != null) database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("SIMPLE_LLM_CUSTOM_LENSES", newJson))
            }

            val delKey = if (profileId != null) "PROFILE_${profileId}_SIMPLE_LLM_DELETED_LENSES" else "SIMPLE_LLM_DELETED_LENSES"
            val delRaw = database.appDao().getSetting(delKey)?.value ?: database.appDao().getSetting("SIMPLE_LLM_DELETED_LENSES")?.value ?: ""
            val deleted = com.aidict.app.utils.DefaultPrompts.parseDeletedLenses(delRaw).toMutableSet()
            deleted.add(lensId)
            val newDelJson = com.aidict.app.utils.DefaultPrompts.serializeDeletedLenses(deleted)
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting(delKey, newDelJson))
            if (profileId != null) database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("SIMPLE_LLM_DELETED_LENSES", newDelJson))
        }
    }

    fun resetAllLenses(profileId: Int?) {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            if (profileId != null) database.appDao().deleteSetting("PROFILE_${profileId}_SIMPLE_LLM_DELETED_LENSES")
            database.appDao().deleteSetting("SIMPLE_LLM_DELETED_LENSES")
        }
    }
}
