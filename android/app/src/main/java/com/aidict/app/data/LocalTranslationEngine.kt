package com.aidict.app.data

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.Locale

object LocalTranslationEngine {

    enum class Tier(val id: String, val displayName: String, val description: String) {
        NORMAL("normal", "Normal (Offline Opus-MT / ML Kit)", "Instant, lightweight, on-device offline translation"),
        STRONG("strong", "Strong (NLLB-200)", "High-capacity deep translation")
    }

    data class TranslationResult(
        val translatedText: String,
        val detectedSourceLang: String?,
        val sourceLanguageName: String,
        val targetLanguageName: String,
        val tier: Tier,
        val isOffline: Boolean = true
    )

    private val LANGUAGE_NAME_TO_TAG = mapOf(
        "English" to TranslateLanguage.ENGLISH,
        "German" to TranslateLanguage.GERMAN,
        "Vietnamese" to TranslateLanguage.VIETNAMESE,
        "French" to TranslateLanguage.FRENCH,
        "Spanish" to TranslateLanguage.SPANISH,
        "Japanese" to TranslateLanguage.JAPANESE,
        "Chinese" to TranslateLanguage.CHINESE,
        "Korean" to TranslateLanguage.KOREAN,
        "Russian" to TranslateLanguage.RUSSIAN,
        "Italian" to TranslateLanguage.ITALIAN,
        "Portuguese" to TranslateLanguage.PORTUGUESE,
        "Dutch" to TranslateLanguage.DUTCH,
        "Arabic" to TranslateLanguage.ARABIC,
        "Hindi" to TranslateLanguage.HINDI,
        "Bengali" to TranslateLanguage.BENGALI,
        "Turkish" to TranslateLanguage.TURKISH,
        "Polish" to TranslateLanguage.POLISH,
        "Thai" to TranslateLanguage.THAI,
        "Swedish" to TranslateLanguage.SWEDISH,
        "Czech" to TranslateLanguage.CZECH,
        "Danish" to TranslateLanguage.DANISH,
        "Greek" to TranslateLanguage.GREEK,
        "Indonesian" to TranslateLanguage.INDONESIAN,
        "Ukrainian" to TranslateLanguage.UKRAINIAN,
        "Romanian" to TranslateLanguage.ROMANIAN,
        "Hungarian" to TranslateLanguage.HUNGARIAN,
        "Finnish" to TranslateLanguage.FINNISH,
        "Norwegian" to TranslateLanguage.NORWEGIAN
    )

    private val TAG_TO_LANGUAGE_NAME = LANGUAGE_NAME_TO_TAG.entries.associate { (name, tag) -> tag to name }

    fun getLanguageTag(languageName: String): String? {
        val trimmed = languageName.trim()
        LANGUAGE_NAME_TO_TAG[trimmed]?.let { return it }
        // Case-insensitive lookup
        LANGUAGE_NAME_TO_TAG.entries.find { it.key.equals(trimmed, ignoreCase = true) }?.let { return it.value }
        // Try direct BCP-47 tag matching
        val directTag = TranslateLanguage.fromLanguageTag(trimmed.lowercase())
        if (directTag != null) return directTag
        return null
    }

    fun getLanguageNameFromTag(tag: String): String {
        return TAG_TO_LANGUAGE_NAME[tag] ?: Locale(tag).displayLanguage.ifBlank { tag }
    }

    fun getSupportedLanguages(): List<String> {
        return LANGUAGE_NAME_TO_TAG.keys.sorted()
    }

    suspend fun detectLanguage(text: String): String? = withContext(Dispatchers.IO) {
        try {
            val identifier = LanguageIdentification.getClient()
            val detectedTag = identifier.identifyLanguage(text).await()
            if (detectedTag != "und") detectedTag else null
        } catch (e: Exception) {
            null
        }
    }

    suspend fun translate(
        text: String,
        sourceLanguage: String,
        targetLanguage: String,
        tier: Tier = Tier.NORMAL,
        requireWifi: Boolean = false,
        onDownloadingModel: ((Boolean) -> Unit)? = null
    ): Result<TranslationResult> = withContext(Dispatchers.IO) {
        try {
            val trimmedText = text.trim()
            if (trimmedText.isBlank()) {
                return@withContext Result.failure(IllegalArgumentException("Input text is empty"))
            }

            var srcTag = if (sourceLanguage.equals("Auto Detect", ignoreCase = true) || sourceLanguage.isBlank()) {
                detectLanguage(trimmedText) ?: TranslateLanguage.ENGLISH
            } else {
                getLanguageTag(sourceLanguage) ?: TranslateLanguage.ENGLISH
            }

            val tgtTag = getLanguageTag(targetLanguage) ?: TranslateLanguage.ENGLISH

            if (srcTag == tgtTag) {
                // If same language, return as-is
                return@withContext Result.success(
                    TranslationResult(
                        translatedText = trimmedText,
                        detectedSourceLang = srcTag,
                        sourceLanguageName = getLanguageNameFromTag(srcTag),
                        targetLanguageName = getLanguageNameFromTag(tgtTag),
                        tier = tier
                    )
                )
            }

            val options = TranslatorOptions.Builder()
                .setSourceLanguage(srcTag)
                .setTargetLanguage(tgtTag)
                .build()

            val translator = Translation.getClient(options)
            try {
                val conditionsBuilder = DownloadConditions.Builder()
                if (requireWifi) {
                    conditionsBuilder.requireWifi()
                }
                val conditions = conditionsBuilder.build()

                onDownloadingModel?.invoke(true)
                translator.downloadModelIfNeeded(conditions).await()
                onDownloadingModel?.invoke(false)
                refreshDownloadedModels()

                val translated = translator.translate(trimmedText).await()

                Result.success(
                    TranslationResult(
                        translatedText = translated,
                        detectedSourceLang = srcTag,
                        sourceLanguageName = getLanguageNameFromTag(srcTag),
                        targetLanguageName = getLanguageNameFromTag(tgtTag),
                        tier = tier
                    )
                )
            } finally {
                translator.close()
            }
        } catch (e: Exception) {
            onDownloadingModel?.invoke(false)
            Result.failure(e)
        }
    }

    data class ModelLanguageInfo(
        val name: String,
        val tag: String,
        val isDownloaded: Boolean,
        val isDownloading: Boolean = false
    )

    fun getAllLanguagesWithTags(): List<Pair<String, String>> {
        return LANGUAGE_NAME_TO_TAG.entries.map { it.key to it.value }.sortedBy { it.first }
    }

    private val _downloadedModelsFlow = MutableStateFlow<Set<String>>(emptySet())
    val downloadedModelsFlow: StateFlow<Set<String>> = _downloadedModelsFlow.asStateFlow()

    init {
        CoroutineScope(Dispatchers.IO).launch {
            refreshDownloadedModels()
        }
    }

    suspend fun refreshDownloadedModels(): Set<String> = withContext(Dispatchers.IO) {
        val models = getDownloadedModels()
        _downloadedModelsFlow.value = models
        models
    }

    fun isLanguageDownloaded(languageName: String, downloadedTags: Set<String>): Boolean {
        if (languageName.equals("Auto Detect", ignoreCase = true)) return true
        val tag = getLanguageTag(languageName) ?: return false
        return downloadedTags.contains(tag)
    }

    fun isTagDownloaded(tag: String, downloadedTags: Set<String>): Boolean {
        return downloadedTags.contains(tag)
    }

    suspend fun getDownloadedModels(): Set<String> = withContext(Dispatchers.IO) {
        try {
            val modelManager = RemoteModelManager.getInstance()
            val models = modelManager.getDownloadedModels(TranslateRemoteModel::class.java).await()
            val set = models.map { it.language }.toSet()
            _downloadedModelsFlow.value = set
            set
        } catch (e: Exception) {
            emptySet()
        }
    }

    suspend fun getModelStatuses(): List<ModelLanguageInfo> = withContext(Dispatchers.IO) {
        val downloadedTags = refreshDownloadedModels()
        LANGUAGE_NAME_TO_TAG.entries.map { (name, tag) ->
            ModelLanguageInfo(
                name = name,
                tag = tag,
                isDownloaded = downloadedTags.contains(tag)
            )
        }.sortedWith(compareByDescending<ModelLanguageInfo> { it.isDownloaded }.thenBy { it.name })
    }

    suspend fun deleteModel(languageTag: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val modelManager = RemoteModelManager.getInstance()
            val model = TranslateRemoteModel.Builder(languageTag).build()
            modelManager.deleteDownloadedModel(model).await()
            refreshDownloadedModels()
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun downloadModel(languageTag: String, requireWifi: Boolean = false): Boolean = withContext(Dispatchers.IO) {
        try {
            val modelManager = RemoteModelManager.getInstance()
            val model = TranslateRemoteModel.Builder(languageTag).build()
            val conditionsBuilder = DownloadConditions.Builder()
            if (requireWifi) {
                conditionsBuilder.requireWifi()
            }
            modelManager.download(model, conditionsBuilder.build()).await()
            refreshDownloadedModels()
            true
        } catch (e: Exception) {
            false
        }
    }
}
