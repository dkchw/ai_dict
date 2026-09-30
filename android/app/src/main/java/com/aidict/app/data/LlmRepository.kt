package com.aidict.app.data

import com.aidict.app.api.ChatRequest
import com.aidict.app.api.ChatMessageDto
import com.aidict.app.data.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
class LlmRepository(private val database: AppDatabase) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
        .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(180, java.util.concurrent.TimeUnit.SECONDS)
        .callTimeout(240, java.util.concurrent.TimeUnit.SECONDS)
        .pingInterval(15, java.util.concurrent.TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .connectionPool(okhttp3.ConnectionPool(10, 5, java.util.concurrent.TimeUnit.MINUTES))
        .dispatcher(okhttp3.Dispatcher().apply {
            maxRequests = 32
            maxRequestsPerHost = 10
        })
        .build()
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private suspend fun waitForNetwork(maxWaitMs: Long = 15_000L) {
        val start = System.currentTimeMillis()
        while (!com.aidict.app.services.BackgroundSyncService.isNetworkOnline.value) {
            if (System.currentTimeMillis() - start >= maxWaitMs) {
                break
            }
            delay(1000)
        }
    }

    private fun buildReasoning(effort: String?): com.aidict.app.api.ReasoningDto? {
        if (effort.isNullOrBlank() || effort.equals("default", ignoreCase = true)) {
            return null
        }
        val clean = effort.lowercase().trim()
        if (clean == "none") {
            return com.aidict.app.api.ReasoningDto(effort = "none", exclude = true)
        }
        return com.aidict.app.api.ReasoningDto(effort = clean)
    }

    private suspend fun getApiKey(): String {
        return database.appDao().getSetting("OPENROUTER_API_KEY")?.value?.trim() ?: ""
    }

    private suspend fun executeRequest(jsonBody: String): String = withContext(Dispatchers.IO) {
        val apiKey = getApiKey()
        if (apiKey.isBlank()) {
            throw Exception("API Key is missing. Please set it in Settings.")
        }

        // Keep CPU awake and network connection alive during full LLM streaming/waiting
        com.aidict.app.services.BackgroundSyncService.acquireWakeLock(
            com.aidict.app.AiDictApplication.instance,
            240_000L
        )

        try {
            val request = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .post(jsonBody.toRequestBody("application/json".toMediaType()))
                .addHeader("Authorization", "Bearer $apiKey")
                .addHeader("HTTP-Referer", "https://github.com/aidict")
                .addHeader("X-Title", "AI Dict")
                .build()

            var lastException: Exception? = null

            for (attempt in 1..4) {
                val call = client.newCall(request)
                try {
                    val response = suspendCancellableCoroutine { continuation ->
                        continuation.invokeOnCancellation {
                            try {
                                call.cancel()
                            } catch (ignored: Throwable) {}
                        }
                        call.enqueue(object : okhttp3.Callback {
                            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                                continuation.resumeWith(Result.success(response))
                            }
                            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                                continuation.resumeWith(Result.failure(e))
                            }
                        })
                    }

                    val bodyStr = response.body?.string()

                    if (response.isSuccessful && bodyStr != null) {
                        val obj = try {
                            json.decodeFromString<JsonObject>(bodyStr)
                        } catch (e: Exception) {
                            throw Exception("Failed to parse response: ${e.localizedMessage ?: e.message}")
                        }
                        val message = obj["choices"]?.jsonArray?.firstOrNull()?.jsonObject?.get("message")?.jsonObject
                        val content = message?.get("content")?.jsonPrimitive?.content

                        if (!content.isNullOrBlank()) {
                            return@withContext content
                        } else {
                            val reasoningContent = message?.get("reasoning_content")?.jsonPrimitive?.content
                                ?: message?.get("reasoning")?.jsonPrimitive?.content
                            if (!reasoningContent.isNullOrBlank()) {
                                return@withContext reasoningContent
                            }
                            val errorElement = obj["error"]
                            val errMsg = when (errorElement) {
                                is JsonObject -> errorElement["message"]?.jsonPrimitive?.content ?: errorElement.toString()
                                is kotlinx.serialization.json.JsonPrimitive -> errorElement.content
                                else -> errorElement?.toString()
                            }
                            throw Exception("Model returned empty content: ${errMsg ?: "Check model selection"}")
                        }
                    } else {
                        // Transient server or rate-limit errors: retry with backoff
                        if (attempt < 4 && response.code in listOf(429, 500, 502, 503, 504, 520, 521, 522, 523, 524)) {
                            waitForNetwork(15_000L)
                            delay(1500L * attempt)
                            continue
                        }

                        var errMessage: String? = null
                        if (bodyStr != null) {
                            try {
                                val obj = json.decodeFromString<JsonObject>(bodyStr)
                                val errorElement = obj["error"]
                                if (errorElement != null) {
                                    if (errorElement is JsonObject) {
                                        errMessage = errorElement["message"]?.jsonPrimitive?.content ?: errorElement.toString()
                                    } else if (errorElement is kotlinx.serialization.json.JsonPrimitive) {
                                        errMessage = errorElement.content
                                    } else {
                                        errMessage = errorElement.toString()
                                    }
                                } else {
                                    errMessage = obj["message"]?.jsonPrimitive?.content
                                }
                            } catch (e: Exception) {}
                        }
                        val finalMessage = errMessage ?: bodyStr?.take(200) ?: "${response.code} ${response.message}"
                        throw Exception("API Error (${response.code}): $finalMessage")
                    }
                } catch (e: Exception) {
                    lastException = e
                    if (e is kotlinx.coroutines.CancellationException) {
                        throw e
                    }
                    if (attempt < 4 && (e is java.net.SocketTimeoutException || e is java.io.IOException || e is javax.net.ssl.SSLException)) {
                        waitForNetwork(15_000L)
                        delay(1200L * attempt)
                        continue
                    }
                    break
                }
            }

            val finalEx = lastException ?: Exception("Network request failed")
            val friendlyMessage = when (finalEx) {
                is java.net.SocketTimeoutException -> "Request timed out waiting for AI response (server took too long)."
                is java.net.UnknownHostException -> "Cannot connect to server. Check your internet connection."
                is javax.net.ssl.SSLException -> "SSL / Connection handshake interrupted (${finalEx.localizedMessage ?: "SSL error"})."
                is java.io.IOException -> "Network connection interrupted (${finalEx.localizedMessage ?: "I/O closed"})."
                else -> finalEx.localizedMessage?.takeIf { it.isNotBlank() } ?: finalEx.message?.takeIf { it.isNotBlank() } ?: "Request failed (${finalEx.javaClass.simpleName})"
            }
            throw Exception(friendlyMessage, finalEx)
        } finally {
            com.aidict.app.services.BackgroundSyncService.releaseWakeLock()
        }
    }

    private suspend fun getProfileOrGlobalSetting(profileId: Int, key: String, default: String): String {
        val profileVal = database.appDao().getSetting("PROFILE_${profileId}_$key")?.value?.trim()
        if (!profileVal.isNullOrBlank()) return profileVal
        val globalVal = database.appDao().getSetting(key)?.value?.trim()
        if (!globalVal.isNullOrBlank()) return globalVal
        return default
    }

    fun streamExplanation(term: String, sourceLang: String, targetLang: String, profileId: Int = 1): Flow<String> = flow {
        val model = getProfileOrGlobalSetting(profileId, "DICT_MODEL", "deepseek/deepseek-v4-flash-0731")
        val promptTemplate = getProfileOrGlobalSetting(profileId, "DICT_PROMPT", com.aidict.app.utils.DefaultPrompts.DICT_PROMPT)
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val modelsList = if (fallbackModel.isNotBlank() && fallbackModel != model) listOf(model, fallbackModel) else null
        val singleModel = if (modelsList == null) model else null
        val reasoningEffort = getProfileOrGlobalSetting(profileId, "DICT_REASONING", "default")
            .ifBlank { getProfileOrGlobalSetting(profileId, "MAIN_REASONING", "default") }

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = listOf(
                ChatMessageDto(role = "system", content = promptTemplate),
                ChatMessageDto(role = "user", content = "Word/Phrase: $term\nSource language: $sourceLang\nTarget language: $targetLang")
            ),
            stream = false,
            reasoning = buildReasoning(reasoningEffort)
        )
        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)

    fun streamExplain(text: String, sourceLang: String, targetLang: String, profileId: Int = 1): Flow<String> = flow {
        val model = getProfileOrGlobalSetting(profileId, "EXPLAIN_MODEL", "deepseek/deepseek-v4-flash-0731")
        val promptTemplate = getProfileOrGlobalSetting(profileId, "EXPLAIN_PROMPT", com.aidict.app.utils.DefaultPrompts.EXPLAIN_PROMPT)
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val modelsList = if (fallbackModel.isNotBlank() && fallbackModel != model) listOf(model, fallbackModel) else null
        val singleModel = if (modelsList == null) model else null
        val reasoningEffort = getProfileOrGlobalSetting(profileId, "EXPLAIN_REASONING", "default")

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = listOf(
                ChatMessageDto(role = "system", content = promptTemplate),
                ChatMessageDto(role = "user", content = "Source language: $sourceLang\nTarget language: $targetLang\nPlease explain this sentence/paragraph:\n$text")
            ),
            stream = false,
            reasoning = buildReasoning(reasoningEffort)
        )
        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)

    fun streamTranslation(sourceText: String, sourceLang: String, targetLang: String, profileId: Int = 1): Flow<String> = flow {
        val model = getProfileOrGlobalSetting(profileId, "TRANSLATE_MODEL", "deepseek/deepseek-v4-flash-0731")
        val promptTemplate = getProfileOrGlobalSetting(profileId, "TRANSLATE_PROMPT", com.aidict.app.utils.DefaultPrompts.TRANSLATE_PROMPT)
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val modelsList = if (fallbackModel.isNotBlank() && fallbackModel != model) listOf(model, fallbackModel) else null
        val singleModel = if (modelsList == null) model else null
        val reasoningEffort = getProfileOrGlobalSetting(profileId, "TRANSLATE_REASONING", "default")
            .ifBlank { getProfileOrGlobalSetting(profileId, "TRANSLATION_REASONING", "default") }

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = listOf(
                ChatMessageDto(role = "system", content = promptTemplate),
                ChatMessageDto(role = "user", content = "Source language: $sourceLang\nTarget language: $targetLang\nConcept: $sourceText")
            ),
            stream = false,
            reasoning = buildReasoning(reasoningEffort)
        )
        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)

    fun streamCompare(words: String, sourceLang: String, targetLang: String, profileId: Int = 1): Flow<String> = flow {
        val model = getProfileOrGlobalSetting(profileId, "COMPARE_MODEL", "deepseek/deepseek-v4-flash-0731")
        val promptTemplate = getProfileOrGlobalSetting(profileId, "COMPARE_PROMPT", com.aidict.app.utils.DefaultPrompts.COMPARE_PROMPT)
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val modelsList = if (fallbackModel.isNotBlank() && fallbackModel != model) listOf(model, fallbackModel) else null
        val singleModel = if (modelsList == null) model else null
        val reasoningEffort = getProfileOrGlobalSetting(profileId, "COMPARE_REASONING", "default")

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = listOf(
                ChatMessageDto(role = "system", content = promptTemplate),
                ChatMessageDto(role = "user", content = "Source language: $sourceLang\nTarget language: $targetLang\nPlease compare the following words:\n$words")
            ),
            stream = false,
            reasoning = buildReasoning(reasoningEffort)
        )
        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)

    fun streamCorrect(text: String, sourceLang: String, targetLang: String, isCorrectionOnly: Boolean, profileId: Int = 1): Flow<String> = flow {
        val model = getProfileOrGlobalSetting(profileId, "CORRECT_MODEL", "deepseek/deepseek-v4-flash-0731")
        val promptTemplate = getProfileOrGlobalSetting(profileId, "CORRECT_PROMPT", com.aidict.app.utils.DefaultPrompts.CORRECT_PROMPT)
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val modelsList = if (fallbackModel.isNotBlank() && fallbackModel != model) listOf(model, fallbackModel) else null
        val singleModel = if (modelsList == null) model else null
        val reasoningEffort = getProfileOrGlobalSetting(profileId, "CORRECT_REASONING", "default")

        val userContent = if (isCorrectionOnly) {
            "Source language: $sourceLang\nMode: Correction-Only (Do not translate; provide only corrected source text, improved natural edition and explanations)\nText to correct:\n$text"
        } else {
            "Source language: $sourceLang\nTarget language: $targetLang\nMode: Correction and Translation\nText to correct and translate:\n$text"
        }

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = listOf(
                ChatMessageDto(role = "system", content = promptTemplate),
                ChatMessageDto(role = "user", content = userContent)
            ),
            stream = false,
            reasoning = buildReasoning(reasoningEffort)
        )
        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)

    fun streamQuickLlm(
        text: String,
        sourceLang: String,
        targetLang: String,
        promptKey: String = "quick_glance",
        customPrompt: String? = null,
        profileId: Int = 1
    ): Flow<String> = flow {
        val configuredModel = getProfileOrGlobalSetting(profileId, "SIMPLE_LLM_MODEL", "inclusionai/ling-3.0-flash")
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val modelsList = if (fallbackModel.isNotBlank() && fallbackModel != configuredModel) listOf(configuredModel, fallbackModel) else null
        val singleModel = if (modelsList == null) configuredModel else null

        val basePrompt = if (!customPrompt.isNullOrBlank()) {
            customPrompt.trim()
        } else {
            com.aidict.app.utils.DefaultPrompts.QUICK_LLM_PRESETS[promptKey]?.prompt
                ?: com.aidict.app.utils.DefaultPrompts.DEFAULT_SIMPLE_LLM_PROMPT
        }

        val langConstraints = mutableListOf(
            "CRITICAL LANGUAGE MANDATE FOR THIS REQUEST:",
            "- Target Language: $targetLang",
            "- Write all definitions, explanations, breakdowns, and example translations strictly in $targetLang.",
            "- STRICTLY FORBIDDEN: Do NOT write explanations in English or any unselected language unless $targetLang is English."
        )
        if (sourceLang.isNotBlank() && !sourceLang.equals("Auto Detect", ignoreCase = true)) {
            langConstraints.add("- Source Language of input: $sourceLang")
        }

        val fullSystemPrompt = basePrompt + "\n\n# MANDATORY LANGUAGE CONSTRAINTS:\n" + langConstraints.joinToString("\n")
        val userContent = "Input: [$text]\n\nCRITICAL REQUIREMENT: Write definitions and explanations strictly in $targetLang."

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = listOf(
                ChatMessageDto(role = "system", content = fullSystemPrompt),
                ChatMessageDto(role = "user", content = userContent)
            ),
            stream = false,
            reasoning = null
        )
        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)

    fun streamChat(word: com.aidict.app.data.entities.Word, messages: List<com.aidict.app.data.entities.ChatMessage>, forceFallback: Boolean = false): Flow<String> = flow {
        val profileId = word.profileId
        val defaultModelKey = if (messages.isEmpty()) {
            when (word.mode) {
                "dict" -> "DICT_MODEL"
                "translate" -> "TRANSLATE_MODEL"
                "explain" -> "EXPLAIN_MODEL"
                "compare" -> "COMPARE_MODEL"
                "correct" -> "CORRECT_MODEL"
                else -> "CHAT_MODEL"
            }
        } else {
            "CHAT_MODEL"
        }
        val defaultReasoningKey = if (messages.isEmpty()) {
            when (word.mode) {
                "dict" -> "DICT_REASONING"
                "translate" -> "TRANSLATE_REASONING"
                "explain" -> "EXPLAIN_REASONING"
                "compare" -> "COMPARE_REASONING"
                "correct" -> "CORRECT_REASONING"
                else -> "CHAT_REASONING"
            }
        } else {
            "CHAT_REASONING"
        }
        val configuredModel = getProfileOrGlobalSetting(profileId, defaultModelKey, getProfileOrGlobalSetting(profileId, "CHAT_MODEL", "deepseek/deepseek-v4-flash-0731"))
        val fallbackModel = getProfileOrGlobalSetting(profileId, "FALLBACK_MODELS", "google/gemini-3.8-flash")
        val model = if (forceFallback && fallbackModel.isNotBlank()) fallbackModel else configuredModel
        val modelsList = if (!forceFallback && fallbackModel.isNotBlank() && fallbackModel != model) listOf(model, fallbackModel) else null
        val singleModel = if (modelsList == null) model else null

        val reasoningEffort = if (forceFallback) {
            getProfileOrGlobalSetting(profileId, "FALLBACK_REASONING", "default")
        } else {
            getProfileOrGlobalSetting(profileId, defaultReasoningKey, "default")
        }

        val initialContext = mutableListOf<ChatMessageDto>()
        when (word.mode) {
            "dict" -> {
                val prompt = getProfileOrGlobalSetting(profileId, "DICT_PROMPT", com.aidict.app.utils.DefaultPrompts.DICT_PROMPT)
                initialContext.add(ChatMessageDto(role = "system", content = prompt))
                val langs = word.language?.split(" -> ")
                val src = langs?.getOrNull(0) ?: ""
                val tgt = langs?.getOrNull(1) ?: ""
                initialContext.add(ChatMessageDto(role = "user", content = "Word/Phrase: ${word.term}\nSource language: $src\nTarget language: $tgt"))
            }
            "translate" -> {
                val prompt = getProfileOrGlobalSetting(profileId, "TRANSLATE_PROMPT", com.aidict.app.utils.DefaultPrompts.TRANSLATE_PROMPT)
                initialContext.add(ChatMessageDto(role = "system", content = prompt))
                val langs = word.language?.split(" -> ")
                val src = langs?.getOrNull(0) ?: ""
                val tgt = langs?.getOrNull(1) ?: ""
                initialContext.add(ChatMessageDto(role = "user", content = "Source language: $src\nTarget language: $tgt\nConcept: ${word.term}"))
            }
            "explain" -> {
                val prompt = getProfileOrGlobalSetting(profileId, "EXPLAIN_PROMPT", com.aidict.app.utils.DefaultPrompts.EXPLAIN_PROMPT)
                initialContext.add(ChatMessageDto(role = "system", content = prompt))
                initialContext.add(ChatMessageDto(role = "user", content = "Please explain this sentence/paragraph:\n${word.term}"))
            }
            "compare" -> {
                val prompt = getProfileOrGlobalSetting(profileId, "COMPARE_PROMPT", com.aidict.app.utils.DefaultPrompts.COMPARE_PROMPT)
                initialContext.add(ChatMessageDto(role = "system", content = prompt))
                initialContext.add(ChatMessageDto(role = "user", content = "Please compare the following words:\n${word.term}"))
            }
            "correct" -> {
                val prompt = getProfileOrGlobalSetting(profileId, "CORRECT_PROMPT", com.aidict.app.utils.DefaultPrompts.CORRECT_PROMPT)
                initialContext.add(ChatMessageDto(role = "system", content = prompt))
                val langs = word.language?.split(" -> ")
                val src = langs?.getOrNull(0) ?: ""
                val tgt = langs?.getOrNull(1) ?: ""
                val isCorrectionOnly = tgt.equals("Correction-Only", ignoreCase = true) || tgt.isBlank()
                val userContent = if (isCorrectionOnly) {
                    "Source language: $src\nMode: Correction-Only\nText to correct:\n${word.term}"
                } else {
                    "Source language: $src\nTarget language: $tgt\nMode: Correction and Translation\nText to correct and translate:\n${word.term}"
                }
                initialContext.add(ChatMessageDto(role = "user", content = userContent))
            }
            else -> {}
        }

        val mappedMessages = initialContext + messages.map { ChatMessageDto(role = it.role, content = it.content) }

        val requestBody = ChatRequest(
            model = singleModel,
            models = modelsList,
            messages = mappedMessages,
            stream = false,
            reasoning = buildReasoning(reasoningEffort)
        )

        val content = executeRequest(json.encodeToString(requestBody))
        emit(content)
    }.flowOn(Dispatchers.IO)




    suspend fun fetchModels(): List<String> {
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("https://openrouter.ai/api/v1/models")
                    .get()
                    .build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val bodyStr = response.body?.string() ?: return@withContext emptyList()
                    val obj = json.decodeFromString<JsonObject>(bodyStr)
                    obj["data"]?.jsonArray?.mapNotNull { 
                        it.jsonObject["id"]?.jsonPrimitive?.content 
                    } ?: emptyList()
                } else {
                    emptyList()
                }
            } catch (e: Exception) {
                emptyList()
            }
        }
    }
}
