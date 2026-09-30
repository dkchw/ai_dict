package com.aidict.app.ui.viewmodels

import com.aidict.app.AiDictApplication
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.LlmRepository
import com.aidict.app.data.entities.ChatMessage
import com.aidict.app.data.entities.Word
import com.aidict.app.utils.MarkdownParser
import com.aidict.app.data.LocalTranslationEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SearchState(
    val isLoading: Boolean = false,
    val word: Word? = null,
    val chatMessages: List<ChatMessage> = emptyList(),
    val currentStream: String = "",
    val error: String? = null
)

class SearchViewModel(
    private val llmRepository: LlmRepository,
    private val database: AppDatabase
) : ViewModel() {
    private val bgScope = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.Dispatchers.IO + kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.CoroutineExceptionHandler { _, throwable ->
            android.util.Log.e("SearchViewModel", "Background task exception caught safely", throwable)
        }
    )

    private val _suggestions = MutableStateFlow<List<com.aidict.app.data.entities.Word>>(emptyList())
    val suggestions: StateFlow<List<com.aidict.app.data.entities.Word>> = _suggestions.asStateFlow()

    val isRestartingWordId = MutableStateFlow<Int?>(null)

    fun clearError(mode: String) {
        val _uiState = getUiState(mode)
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun formatFailureMarkdown(errorDetail: String): String {
        return "⚠️ **Generation Failed**\n\n*Error details:* $errorDetail\n\n*Please check your network connection, API key in Settings, or try with the Fallback Model.*"
    }

    private suspend fun updateSuggestions(mode: String, query: String) {
        if (query.isBlank()) {
            _suggestions.value = emptyList()
            return
        }
        val profileIdStr = database.appDao().getSetting("ACTIVE_PROFILE_ID")?.value
        val profileId = profileIdStr?.toIntOrNull() ?: 1
        _suggestions.value = database.appDao().getWordSuggestions(profileId, mode, query)
    }

    private var dictJob: kotlinx.coroutines.Job? = null
    private var translateJob: kotlinx.coroutines.Job? = null
    private var explainJob: kotlinx.coroutines.Job? = null
    private var compareJob: kotlinx.coroutines.Job? = null
    private var correctJob: kotlinx.coroutines.Job? = null

    private val activeStreamJobs = java.util.concurrent.ConcurrentHashMap<Int, kotlinx.coroutines.Job>()
    private val activeStreamTexts = java.util.concurrent.ConcurrentHashMap<Int, String>()

    val activeStreamJobIds = kotlinx.coroutines.flow.MutableStateFlow<Set<Int>>(emptySet())
    fun isWordGenerating(wordId: Int): Boolean = activeStreamJobs[wordId]?.isActive == true
    fun getWordStream(wordId: Int): String = activeStreamTexts[wordId] ?: ""

    private fun notifyBackgroundStatus(activeTitle: String? = null) {
        activeStreamJobIds.value = activeStreamJobs.keys().toList().toSet()
        try {
            val count = activeStreamJobs.size
            if (count > 1) {
                com.aidict.app.services.BackgroundSyncService.updateNotification(
                    com.aidict.app.AiDictApplication.instance,
                    "AI Dict: $count background tasks active..."
                )
            } else if (count == 1 && activeTitle != null) {
                com.aidict.app.services.BackgroundSyncService.updateNotification(
                    com.aidict.app.AiDictApplication.instance,
                    "AI Dict: $activeTitle..."
                )
            } else if (count == 0) {
                com.aidict.app.services.BackgroundSyncService.updateNotification(
                    com.aidict.app.AiDictApplication.instance,
                    "Online - Background search & API ready."
                )
            }
        } catch (ignored: Exception) {}
    }

    private var _searchInput = mutableStateOf("")
    var searchInput: String
        get() = _searchInput.value
        set(value) {
            _searchInput.value = value
            dictJob?.cancel()
            dictJob = viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("DICT_DRAFT", value))
                updateSuggestions("dict", value)
            }
        }

    private var _translateInput = mutableStateOf("")
    var translateInput: String
        get() = _translateInput.value
        set(value) {
            _translateInput.value = value
            translateJob?.cancel()
            translateJob = viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("TRANSLATE_DRAFT", value))
                updateSuggestions("translate", value)
            }
        }

    private var _explainInput = mutableStateOf("")
    var explainInput: String
        get() = _explainInput.value
        set(value) {
            _explainInput.value = value
            explainJob?.cancel()
            explainJob = viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("EXPLAIN_DRAFT", value))
                updateSuggestions("explain", value)
            }
        }

    private var _compareInput = mutableStateOf("")
    var compareInput: String
        get() = _compareInput.value
        set(value) {
            _compareInput.value = value
            compareJob?.cancel()
            compareJob = viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("COMPARE_DRAFT", value))
                updateSuggestions("compare", value)
            }
        }

    private var _correctInput = mutableStateOf("")
    var correctInput: String
        get() = _correctInput.value
        set(value) {
            _correctInput.value = value
            correctJob?.cancel()
            correctJob = viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("CORRECT_DRAFT", value))
                updateSuggestions("correct", value)
            }
        }

    init {
        viewModelScope.launch {
            _searchInput.value = database.appDao().getSetting("DICT_DRAFT")?.value ?: ""
            _translateInput.value = database.appDao().getSetting("TRANSLATE_DRAFT")?.value ?: ""
            _explainInput.value = database.appDao().getSetting("EXPLAIN_DRAFT")?.value ?: ""
            _compareInput.value = database.appDao().getSetting("COMPARE_DRAFT")?.value ?: ""
            _correctInput.value = database.appDao().getSetting("CORRECT_DRAFT")?.value ?: ""
        }
    }


    private val _dictState = MutableStateFlow(SearchState())
    val dictState: StateFlow<SearchState> = _dictState.asStateFlow()
    
    private val _compareState = MutableStateFlow(SearchState())
    val compareState: StateFlow<SearchState> = _compareState.asStateFlow()
    
    private val _translateState = MutableStateFlow(SearchState())
    val translateState: StateFlow<SearchState> = _translateState.asStateFlow()
    
    private val _explainState = MutableStateFlow(SearchState())
    val explainState: StateFlow<SearchState> = _explainState.asStateFlow()

    private val _correctState = MutableStateFlow(SearchState())
    val correctState: StateFlow<SearchState> = _correctState.asStateFlow()
    
    fun getUiState(mode: String): MutableStateFlow<SearchState> {
        return when (mode) {
            "dict" -> _dictState
            "compare" -> _compareState
            "translate" -> _translateState
            "explain" -> _explainState
            "correct" -> _correctState
            else -> _dictState
        }
    }


    val orderedLanguages = database.appDao().getSettingsFlow().map { s -> com.aidict.app.utils.LanguageManager.getOrderedLanguages(s.find { it.key == "STARRED_LANGUAGES" }?.value, s.find { it.key == "CUSTOM_LANGUAGES" }?.value) }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, com.aidict.app.utils.LanguageManager.getOrderedLanguages(null, null))
    fun searchWord(term: String, sourceLang: String, targetLang: String, profileId: Int) {
        val cleanTerm = term.trim()
        if (cleanTerm.isBlank()) return
        clearSuggestions()
        val _uiState = _dictState
        bgScope.launch {
            var savedMsg: com.aidict.app.data.entities.ChatMessage? = null
            var savedWord: com.aidict.app.data.entities.Word? = null
            var wordId: Int? = null
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val existingWord = database.appDao().findWordExact(profileId, "dict", cleanTerm, null)
                if (existingWord != null) {
                    if (activeStreamJobs[existingWord.id]?.isActive == true) {
                        loadWord(existingWord)
                        return@launch
                    }
                    val existingMsgs = database.appDao().getChatMessagesSync(existingWord.id)
                    val hasValidOutput = existingMsgs.any { it.role == "assistant" && it.content.isNotBlank() && !it.content.startsWith("Generating") && !it.content.contains("Generation Failed") }
                    if (hasValidOutput) {
                        database.appDao().incrementSearchCount(existingWord.id)
                        val updatedWord = existingWord.copy(searchCount = existingWord.searchCount + 1, sessionId = sessionId)
                        database.appDao().updateWord(updatedWord)
                        loadWord(updatedWord)
                        return@launch
                    }
                    savedWord = existingWord
                }
                val currentWordId = savedWord?.id ?: database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(profileId = profileId, term = cleanTerm, sessionId = sessionId, mode = "dict")
                ).toInt()
                wordId = currentWordId
                if (savedWord == null) {
                    savedWord = com.aidict.app.data.entities.Word(id = currentWordId, profileId = profileId, term = cleanTerm, sessionId = sessionId, mode = "dict")
                }
                coroutineContext[kotlinx.coroutines.Job]?.let {
                    activeStreamJobs[currentWordId] = it
                }
                activeStreamTexts[currentWordId] = ""
                notifyBackgroundStatus("Looking up \"$cleanTerm\"")

                val initialMsg = com.aidict.app.data.entities.ChatMessage(wordId = currentWordId, role = "assistant", content = "Generating...")
                val msgId = database.appDao().insertChatMessage(initialMsg).toInt()
                savedMsg = initialMsg.copy(id = msgId)
                
                _uiState.value = SearchState(isLoading = true, word = savedWord, chatMessages = listOf(savedMsg), currentStream = "", error = null)
                
                var currentText = ""
                llmRepository.streamExplanation(cleanTerm, sourceLang, targetLang, profileId).collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }

                val finalMarkdown = currentText
                val (language, lemma) = MarkdownParser.extractMetadata(finalMarkdown)
                
                val finalWord = savedWord.copy(language = language, lemma = lemma)
                database.appDao().updateWord(finalWord)
                val finalMsg = savedMsg.copy(content = finalMarkdown)
                database.appDao().insertChatMessage(finalMsg)
                
                if (_uiState.value.word?.id == currentWordId) {
                    val updatedMsgs = database.appDao().getChatMessagesSync(currentWordId)
                    _uiState.value = SearchState(isLoading = false, word = finalWord, chatMessages = updatedMsgs, currentStream = "")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                val targetWordId = wordId ?: savedWord?.id
                if (targetWordId != null) {
                    try {
                        val userMsg = savedMsg?.copy(content = failureMarkdown)
                            ?: com.aidict.app.data.entities.ChatMessage(wordId = targetWordId, role = "assistant", content = failureMarkdown)
                        database.appDao().insertChatMessage(userMsg)
                    } catch (ignored: Exception) {}
                    val updated = database.appDao().getChatMessagesSync(targetWordId)
                    if (_uiState.value.word?.id == targetWordId) {
                        _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = updated, currentStream = "", error = errorDetail)
                    }
                } else if (_uiState.value.word == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, currentStream = "", error = errorDetail)
                }
            } finally {
                wordId?.let {
                    activeStreamJobs.remove(it)
                    activeStreamTexts.remove(it)
                }
                notifyBackgroundStatus()
            }
        }
    }


    fun deleteCurrentWord(mode: String = "dict") {
        val _uiState = getUiState(mode)
        viewModelScope.launch {
            _uiState.value.word?.let {
                database.appDao().deleteWord(it)
                _uiState.value = SearchState() // Reset
            }
        }
    }

        fun renameWord(word: com.aidict.app.data.entities.Word, newTerm: String, mode: String) {
        val _uiState = getUiState(mode)
        viewModelScope.launch {
            val updatedWord = word.copy(term = newTerm)
            database.appDao().updateWord(updatedWord)
            if (_uiState.value.word?.id == word.id) {
                _uiState.value = _uiState.value.copy(word = updatedWord)
            }
        }
    }

    fun updateWordColor(color: String, mode: String = "dict") {
        val _uiState = getUiState(mode)
        viewModelScope.launch {
            _uiState.value.word?.let { word ->
                val updatedWord = word.copy(color = color)
                database.appDao().updateWord(updatedWord) // REPLACE strategy
                _uiState.value = _uiState.value.copy(word = updatedWord)
            }
        }
    }

    fun updateWordStars(stars: Int, mode: String = "dict") {
        val _uiState = getUiState(mode)
        viewModelScope.launch {
            _uiState.value.word?.let { word ->
                val updatedWord = word.copy(stars = stars)
                database.appDao().updateWord(updatedWord)
                _uiState.value = _uiState.value.copy(word = updatedWord)
            }
        }
    }
    fun sendFollowUpMessage(content: String, mode: String = "dict") {
        val cleanContent = content.trim()
        if (cleanContent.isBlank()) return
        val _uiState = getUiState(mode)
        val word = _uiState.value.word ?: return
        val currentWordId = word.id
        bgScope.launch {
            coroutineContext[kotlinx.coroutines.Job]?.let {
                activeStreamJobs[currentWordId] = it
            }
            activeStreamTexts[currentWordId] = ""
            notifyBackgroundStatus("Chat response in progress")
            try {
                val updatedWordForGen = word.copy(generationCount = word.generationCount + 1)
                database.appDao().updateWord(updatedWordForGen)
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(word = updatedWordForGen)
                }
                val userMsg = ChatMessage(wordId = word.id, role = "user", content = cleanContent)
                database.appDao().insertChatMessage(userMsg)
                
                val updatedMessages = database.appDao().getChatMessagesSync(word.id)
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(chatMessages = updatedMessages, isLoading = true, currentStream = "")
                }

                var currentText = ""
                llmRepository.streamChat(word, updatedMessages).collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }
                val assistantMsg = ChatMessage(wordId = word.id, role = "assistant", content = currentText)
                database.appDao().insertChatMessage(assistantMsg)
                
                val finalMessages = database.appDao().getChatMessagesSync(word.id)
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = finalMessages, currentStream = "")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                try {
                    val errorMsg = ChatMessage(wordId = word.id, role = "assistant", content = failureMarkdown)
                    database.appDao().insertChatMessage(errorMsg)
                } catch (ignored: Exception) {}
                val finalMessages = database.appDao().getChatMessagesSync(word.id)
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = finalMessages, currentStream = "", error = errorDetail)
                }
            } finally {
                activeStreamJobs.remove(currentWordId)
                activeStreamTexts.remove(currentWordId)
                notifyBackgroundStatus()
            }
        }
    }

    
    suspend fun getProfileSetting(profileId: Int, key: String): String? {
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            database.appDao().getSetting("PROFILE_${profileId}_$key")?.value
        }
    }

    fun saveProfileSetting(profileId: Int, key: String, value: String) {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("PROFILE_${profileId}_$key", value))
        }
    }

    
    fun loadWord(word: com.aidict.app.data.entities.Word) {
        val _uiState = getUiState(word.mode)
        viewModelScope.launch {
            database.appDao().incrementViewCount(word.id)
            val updatedWord = word.copy(viewCount = word.viewCount + 1)
            val messages = database.appDao().getChatMessagesSync(word.id)
            val isStillGenerating = activeStreamJobs[word.id]?.isActive == true || (messages.lastOrNull()?.content == "Generating..." && activeStreamJobs.containsKey(word.id))
            val streamSoFar = if (isStillGenerating) activeStreamTexts[word.id] ?: "" else ""
            _uiState.value = SearchState(
                word = updatedWord,
                isLoading = isStillGenerating,
                chatMessages = messages,
                currentStream = streamSoFar,
                error = null
            )
        }
    }
    fun clearSuggestions() {
        _suggestions.value = emptyList()
    }
    fun clearCurrentSearch(mode: String? = null) {
        when (mode) {
            "dict" -> {
                _dictState.value = SearchState()
                searchInput = ""
            }
            "compare" -> {
                _compareState.value = SearchState()
                compareInput = ""
            }
            "translate" -> {
                _translateState.value = SearchState()
                translateInput = ""
            }
            "explain" -> {
                _explainState.value = SearchState()
                explainInput = ""
            }
            "correct" -> {
                _correctState.value = SearchState()
                correctInput = ""
            }
            else -> {
                _dictState.value = SearchState()
                _compareState.value = SearchState()
                _translateState.value = SearchState()
                _explainState.value = SearchState()
                _correctState.value = SearchState()
                searchInput = ""
                translateInput = ""
                compareInput = ""
                explainInput = ""
                correctInput = ""
            }
        }
        clearSuggestions()
    }

    fun deleteMessage(msg: com.aidict.app.data.entities.ChatMessage, mode: String) {
        val _uiState = getUiState(mode)
        viewModelScope.launch {
            database.appDao().deleteChatMessage(msg)
            val updated = database.appDao().getChatMessagesSync(msg.wordId)
            if (updated.isEmpty() || updated.none { it.role == "assistant" }) {
                deleteCurrentWord(mode)
            } else {
                _uiState.value = _uiState.value.copy(chatMessages = updated)
            }
        }
    }

    fun editMessage(msg: com.aidict.app.data.entities.ChatMessage, newContent: String, mode: String) {
        val _uiState = getUiState(mode)
        viewModelScope.launch {
            val updatedMsg = msg.copy(content = newContent)
            database.appDao().insertChatMessage(updatedMsg)
            val updated = database.appDao().getChatMessagesSync(msg.wordId)
            _uiState.value = _uiState.value.copy(chatMessages = updated)
        }
    }
    fun retryMessage(
        assistantMsg: com.aidict.app.data.entities.ChatMessage? = null,
        forceFallback: Boolean = false,
        mode: String = "dict",
        targetWord: com.aidict.app.data.entities.Word? = null
    ) {
        val _uiState = getUiState(mode)
        bgScope.launch {
            val word = targetWord
                ?: _uiState.value.word
                ?: (assistantMsg?.wordId?.let { database.appDao().getWord(it) })
                ?: return@launch
            val currentWordId = word.id
            isRestartingWordId.value = currentWordId
            coroutineContext[kotlinx.coroutines.Job]?.let {
                activeStreamJobs[currentWordId] = it
            }
            activeStreamTexts[currentWordId] = ""
            notifyBackgroundStatus("Regenerating response for \"${word.term}\"")

            val updatedWordForGen = word.copy(generationCount = word.generationCount + 1)
            database.appDao().updateWord(updatedWordForGen)

            // Delete the assistant message to restart generation from that point if one was specified
            if (assistantMsg != null) {
                database.appDao().deleteChatMessage(assistantMsg)
            }
            val allHistory = database.appDao().getChatMessagesSync(currentWordId)
            val historyBefore = allHistory.filter {
                it.content.isNotBlank() &&
                !it.content.startsWith("Generating") &&
                !it.content.contains("Generation Failed")
            }
            val loadingMsg = com.aidict.app.data.entities.ChatMessage(
                wordId = currentWordId,
                role = "assistant",
                content = "Generating..."
            )
            val loadingId = database.appDao().insertChatMessage(loadingMsg).toInt()
            val activeLoadingMsg = loadingMsg.copy(id = loadingId)

            val initialDisplay = database.appDao().getChatMessagesSync(currentWordId)
            _uiState.value = _uiState.value.copy(
                word = updatedWordForGen,
                chatMessages = initialDisplay,
                isLoading = true,
                currentStream = "",
                error = null
            )

            try {
                var currentText = ""
                val flow = llmRepository.streamChat(word, historyBefore, forceFallback)

                flow.collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }

                val finalMarkdown = currentText
                val newAssistantMsg = activeLoadingMsg.copy(content = finalMarkdown)
                database.appDao().insertChatMessage(newAssistantMsg)

                val finalMessages = database.appDao().getChatMessagesSync(currentWordId)
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        chatMessages = finalMessages,
                        currentStream = "",
                        error = null
                    )
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                try {
                    val errorMsg = activeLoadingMsg.copy(content = failureMarkdown)
                    database.appDao().insertChatMessage(errorMsg)
                } catch (ignored: Exception) {}
                val finalMessages = database.appDao().getChatMessagesSync(currentWordId)
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        chatMessages = finalMessages,
                        currentStream = "",
                        error = errorDetail
                    )
                }
            } finally {
                activeStreamJobs.remove(currentWordId)
                activeStreamTexts.remove(currentWordId)
                isRestartingWordId.value = null
                if (_uiState.value.word?.id == currentWordId) {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
                notifyBackgroundStatus()
            }
        }
    }

    fun streamTranslation(text: String, source: String, target: String, profileId: Int) {
        val cleanText = text.trim()
        if (cleanText.isBlank()) return
        clearSuggestions()
        val _uiState = _translateState
        bgScope.launch {
            var savedMsg: com.aidict.app.data.entities.ChatMessage? = null
            var savedWord: com.aidict.app.data.entities.Word? = null
            var wordId: Int? = null
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val langKey = "$source -> $target"
                val existingWord = database.appDao().findWordExact(profileId, "translate", cleanText, langKey)
                if (existingWord != null) {
                    if (activeStreamJobs[existingWord.id]?.isActive == true) {
                        loadWord(existingWord)
                        return@launch
                    }
                    val existingMsgs = database.appDao().getChatMessagesSync(existingWord.id)
                    val hasValidOutput = existingMsgs.any { it.role == "assistant" && it.content.isNotBlank() && !it.content.startsWith("Generating") && !it.content.contains("Generation Failed") }
                    if (hasValidOutput) {
                        database.appDao().incrementSearchCount(existingWord.id)
                        val updatedWord = existingWord.copy(searchCount = existingWord.searchCount + 1, sessionId = sessionId)
                        database.appDao().updateWord(updatedWord)
                        loadWord(updatedWord)
                        return@launch
                    }
                    savedWord = existingWord
                }
                val currentWordId = savedWord?.id ?: database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "translate")
                ).toInt()
                wordId = currentWordId
                if (savedWord == null) {
                    savedWord = com.aidict.app.data.entities.Word(id = currentWordId, profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "translate")
                }
                coroutineContext[kotlinx.coroutines.Job]?.let {
                    activeStreamJobs[currentWordId] = it
                }
                activeStreamTexts[currentWordId] = ""
                notifyBackgroundStatus("Translating \"${cleanText.take(20)}\"")

                val initialMsg = com.aidict.app.data.entities.ChatMessage(wordId = currentWordId, role = "assistant", content = "Generating...")
                val msgId = database.appDao().insertChatMessage(initialMsg).toInt()
                savedMsg = initialMsg.copy(id = msgId)

                _uiState.value = SearchState(isLoading = true, word = savedWord, chatMessages = listOf(savedMsg), currentStream = "", error = null)

                var currentText = ""
                llmRepository.streamTranslation(cleanText, source, target, profileId).collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }

                val finalMsg = savedMsg.copy(content = currentText)
                database.appDao().insertChatMessage(finalMsg)
                if (_uiState.value.word?.id == currentWordId) {
                    val updatedMsgs = database.appDao().getChatMessagesSync(currentWordId)
                    _uiState.value = SearchState(isLoading = false, word = savedWord, chatMessages = updatedMsgs, currentStream = "")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                val targetWordId = wordId ?: savedWord?.id
                if (targetWordId != null) {
                    try {
                        val userMsg = savedMsg?.copy(content = failureMarkdown)
                            ?: com.aidict.app.data.entities.ChatMessage(wordId = targetWordId, role = "assistant", content = failureMarkdown)
                        database.appDao().insertChatMessage(userMsg)
                    } catch (ignored: Exception) {}
                    val updated = database.appDao().getChatMessagesSync(targetWordId)
                    if (_uiState.value.word?.id == targetWordId) {
                        _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = updated, currentStream = "", error = errorDetail)
                    }
                } else if (_uiState.value.word == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, currentStream = "", error = errorDetail)
                }
            } finally {
                wordId?.let {
                    activeStreamJobs.remove(it)
                    activeStreamTexts.remove(it)
                }
                notifyBackgroundStatus()
            }
        }
    }
    fun streamExplain(text: String, sourceLang: String, targetLang: String, profileId: Int) {
        val cleanText = text.trim()
        if (cleanText.isBlank()) return
        clearSuggestions()
        val _uiState = _explainState
        bgScope.launch {
            var savedMsg: com.aidict.app.data.entities.ChatMessage? = null
            var savedWord: com.aidict.app.data.entities.Word? = null
            var wordId: Int? = null
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val langKey = "$sourceLang -> $targetLang"
                val existingWord = database.appDao().findWordExact(profileId, "explain", cleanText, langKey)
                if (existingWord != null) {
                    if (activeStreamJobs[existingWord.id]?.isActive == true) {
                        loadWord(existingWord)
                        return@launch
                    }
                    val existingMsgs = database.appDao().getChatMessagesSync(existingWord.id)
                    val hasValidOutput = existingMsgs.any { it.role == "assistant" && it.content.isNotBlank() && !it.content.startsWith("Generating") && !it.content.contains("Generation Failed") }
                    if (hasValidOutput) {
                        database.appDao().incrementSearchCount(existingWord.id)
                        val updatedWord = existingWord.copy(searchCount = existingWord.searchCount + 1, sessionId = sessionId)
                        database.appDao().updateWord(updatedWord)
                        loadWord(updatedWord)
                        return@launch
                    }
                    savedWord = existingWord
                }
                val currentWordId = savedWord?.id ?: database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "explain")
                ).toInt()
                wordId = currentWordId
                if (savedWord == null) {
                    savedWord = com.aidict.app.data.entities.Word(id = currentWordId, profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "explain")
                }
                coroutineContext[kotlinx.coroutines.Job]?.let {
                    activeStreamJobs[currentWordId] = it
                }
                activeStreamTexts[currentWordId] = ""
                notifyBackgroundStatus("Explaining text")

                val initialMsg = com.aidict.app.data.entities.ChatMessage(wordId = currentWordId, role = "assistant", content = "Generating...")
                val msgId = database.appDao().insertChatMessage(initialMsg).toInt()
                savedMsg = initialMsg.copy(id = msgId)

                _uiState.value = SearchState(isLoading = true, word = savedWord, chatMessages = listOf(savedMsg), currentStream = "", error = null)

                var currentText = ""
                llmRepository.streamExplain(cleanText, sourceLang, targetLang, profileId).collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }

                val finalMsg = savedMsg.copy(content = currentText)
                database.appDao().insertChatMessage(finalMsg)
                if (_uiState.value.word?.id == currentWordId) {
                    val updatedMsgs = database.appDao().getChatMessagesSync(currentWordId)
                    _uiState.value = SearchState(isLoading = false, word = savedWord, chatMessages = updatedMsgs, currentStream = "")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                val targetWordId = wordId ?: savedWord?.id
                if (targetWordId != null) {
                    try {
                        val userMsg = savedMsg?.copy(content = failureMarkdown)
                            ?: com.aidict.app.data.entities.ChatMessage(wordId = targetWordId, role = "assistant", content = failureMarkdown)
                        database.appDao().insertChatMessage(userMsg)
                    } catch (ignored: Exception) {}
                    val updated = database.appDao().getChatMessagesSync(targetWordId)
                    if (_uiState.value.word?.id == targetWordId) {
                        _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = updated, currentStream = "", error = errorDetail)
                    }
                } else if (_uiState.value.word == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, currentStream = "", error = errorDetail)
                }
            } finally {
                wordId?.let {
                    activeStreamJobs.remove(it)
                    activeStreamTexts.remove(it)
                }
                notifyBackgroundStatus()
            }
        }
    }
    fun streamCompare(words: String, sourceLang: String, targetLang: String, profileId: Int) {
        val cleanWords = words.trim()
        if (cleanWords.isBlank()) return
        clearSuggestions()
        val _uiState = _compareState
        bgScope.launch {
            var savedMsg: com.aidict.app.data.entities.ChatMessage? = null
            var savedWord: com.aidict.app.data.entities.Word? = null
            var wordId: Int? = null
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val langKey = "$sourceLang -> $targetLang"
                val existingWord = database.appDao().findWordExact(profileId, "compare", cleanWords, langKey)
                if (existingWord != null) {
                    if (activeStreamJobs[existingWord.id]?.isActive == true) {
                        loadWord(existingWord)
                        return@launch
                    }
                    val existingMsgs = database.appDao().getChatMessagesSync(existingWord.id)
                    val hasValidOutput = existingMsgs.any { it.role == "assistant" && it.content.isNotBlank() && !it.content.startsWith("Generating") && !it.content.contains("Generation Failed") }
                    if (hasValidOutput) {
                        database.appDao().incrementSearchCount(existingWord.id)
                        val updatedWord = existingWord.copy(searchCount = existingWord.searchCount + 1, sessionId = sessionId)
                        database.appDao().updateWord(updatedWord)
                        loadWord(updatedWord)
                        return@launch
                    }
                    savedWord = existingWord
                }
                val currentWordId = savedWord?.id ?: database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(profileId = profileId, term = cleanWords, language = langKey, sessionId = sessionId, mode = "compare")
                ).toInt()
                wordId = currentWordId
                if (savedWord == null) {
                    savedWord = com.aidict.app.data.entities.Word(id = currentWordId, profileId = profileId, term = cleanWords, language = langKey, sessionId = sessionId, mode = "compare")
                }
                coroutineContext[kotlinx.coroutines.Job]?.let {
                    activeStreamJobs[currentWordId] = it
                }
                activeStreamTexts[currentWordId] = ""
                notifyBackgroundStatus("Comparing \"${cleanWords.take(20)}\"")

                val initialMsg = com.aidict.app.data.entities.ChatMessage(wordId = currentWordId, role = "assistant", content = "Generating...")
                val msgId = database.appDao().insertChatMessage(initialMsg).toInt()
                savedMsg = initialMsg.copy(id = msgId)

                _uiState.value = SearchState(isLoading = true, word = savedWord, chatMessages = listOf(savedMsg), currentStream = "", error = null)

                var currentText = ""
                llmRepository.streamCompare(cleanWords, sourceLang, targetLang, profileId).collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }

                val finalMsg = savedMsg.copy(content = currentText)
                database.appDao().insertChatMessage(finalMsg)
                if (_uiState.value.word?.id == currentWordId) {
                    val updatedMsgs = database.appDao().getChatMessagesSync(currentWordId)
                    _uiState.value = SearchState(isLoading = false, word = savedWord, chatMessages = updatedMsgs, currentStream = "")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                val targetWordId = wordId ?: savedWord?.id
                if (targetWordId != null) {
                    try {
                        val userMsg = savedMsg?.copy(content = failureMarkdown)
                            ?: com.aidict.app.data.entities.ChatMessage(wordId = targetWordId, role = "assistant", content = failureMarkdown)
                        database.appDao().insertChatMessage(userMsg)
                    } catch (ignored: Exception) {}
                    val updated = database.appDao().getChatMessagesSync(targetWordId)
                    if (_uiState.value.word?.id == targetWordId) {
                        _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = updated, currentStream = "", error = errorDetail)
                    }
                } else if (_uiState.value.word == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, currentStream = "", error = errorDetail)
                }
            } finally {
                wordId?.let {
                    activeStreamJobs.remove(it)
                    activeStreamTexts.remove(it)
                }
                notifyBackgroundStatus()
            }
        }
    }

    fun streamCorrect(text: String, sourceLang: String, targetLang: String, profileId: Int, isCorrectionOnly: Boolean = false) {
        val cleanText = text.trim()
        if (cleanText.isBlank()) return
        clearSuggestions()
        val _uiState = _correctState
        bgScope.launch {
            var savedMsg: com.aidict.app.data.entities.ChatMessage? = null
            var savedWord: com.aidict.app.data.entities.Word? = null
            var wordId: Int? = null
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val langKey = if (isCorrectionOnly) "$sourceLang -> Correction-Only" else "$sourceLang -> $targetLang"
                val existingWord = database.appDao().findWordExact(profileId, "correct", cleanText, langKey)
                if (existingWord != null) {
                    if (activeStreamJobs[existingWord.id]?.isActive == true) {
                        loadWord(existingWord)
                        return@launch
                    }
                    val existingMsgs = database.appDao().getChatMessagesSync(existingWord.id)
                    val hasValidOutput = existingMsgs.any { it.role == "assistant" && it.content.isNotBlank() && !it.content.startsWith("Generating") && !it.content.contains("Generation Failed") }
                    if (hasValidOutput) {
                        database.appDao().incrementSearchCount(existingWord.id)
                        val updatedWord = existingWord.copy(searchCount = existingWord.searchCount + 1, sessionId = sessionId)
                        database.appDao().updateWord(updatedWord)
                        loadWord(updatedWord)
                        return@launch
                    }
                    savedWord = existingWord
                }
                val currentWordId = savedWord?.id ?: database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "correct")
                ).toInt()
                wordId = currentWordId
                if (savedWord == null) {
                    savedWord = com.aidict.app.data.entities.Word(id = currentWordId, profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "correct")
                }
                coroutineContext[kotlinx.coroutines.Job]?.let {
                    activeStreamJobs[currentWordId] = it
                }
                activeStreamTexts[currentWordId] = ""
                notifyBackgroundStatus("Correcting text")

                val initialMsg = com.aidict.app.data.entities.ChatMessage(wordId = currentWordId, role = "assistant", content = "Generating...")
                val msgId = database.appDao().insertChatMessage(initialMsg).toInt()
                savedMsg = initialMsg.copy(id = msgId)

                _uiState.value = SearchState(isLoading = true, word = savedWord, chatMessages = listOf(savedMsg), currentStream = "", error = null)

                var currentText = ""
                llmRepository.streamCorrect(cleanText, sourceLang, targetLang, isCorrectionOnly, profileId).collect { chunk ->
                    currentText = chunk
                    activeStreamTexts[currentWordId] = currentText
                    if (_uiState.value.word?.id == currentWordId) {
                        _uiState.value = _uiState.value.copy(currentStream = currentText)
                    }
                }

                val finalMsg = savedMsg.copy(content = currentText)
                database.appDao().insertChatMessage(finalMsg)
                if (_uiState.value.word?.id == currentWordId) {
                    val updatedMsgs = database.appDao().getChatMessagesSync(currentWordId)
                    _uiState.value = SearchState(isLoading = false, word = savedWord, chatMessages = updatedMsgs, currentStream = "")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() }
                    ?: e.message?.takeIf { it.isNotBlank() }
                    ?: "Network timeout or connection error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                val targetWordId = wordId ?: savedWord?.id
                if (targetWordId != null) {
                    try {
                        val userMsg = savedMsg?.copy(content = failureMarkdown)
                            ?: com.aidict.app.data.entities.ChatMessage(wordId = targetWordId, role = "assistant", content = failureMarkdown)
                        database.appDao().insertChatMessage(userMsg)
                    } catch (ignored: Exception) {}
                    val updated = database.appDao().getChatMessagesSync(targetWordId)
                    if (_uiState.value.word?.id == targetWordId) {
                        _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = updated, currentStream = "", error = errorDetail)
                    }
                } else if (_uiState.value.word == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, currentStream = "", error = errorDetail)
                }
            } finally {
                wordId?.let {
                    activeStreamJobs.remove(it)
                    activeStreamTexts.remove(it)
                }
                notifyBackgroundStatus()
            }
        }
    }

    var mtSourceText by mutableStateOf("")
    var mtTranslatedText by mutableStateOf("")
    var mtDetectedSourceLang by mutableStateOf<String?>(null)
    var mtIsLoading by mutableStateOf(false)
    var mtIsDownloadingModel by mutableStateOf(false)
    var mtErrorMessage by mutableStateOf<String?>(null)
    var mtIsSaved by mutableStateOf(false)
    private var mtTranslateJob: Job? = null

    fun translateTransient(
        text: String,
        sourceLang: String,
        targetLang: String,
        tier: LocalTranslationEngine.Tier = LocalTranslationEngine.Tier.NORMAL
    ) {
        val clean = text.trim()
        if (clean.isBlank()) {
            mtTranslatedText = ""
            mtErrorMessage = null
            mtIsLoading = false
            mtIsSaved = false
            return
        }

        mtTranslateJob?.cancel()
        mtTranslateJob = viewModelScope.launch {
            mtIsLoading = true
            mtErrorMessage = null
            mtIsDownloadingModel = false
            mtIsSaved = false

            val result = LocalTranslationEngine.translate(
                text = clean,
                sourceLanguage = sourceLang,
                targetLanguage = targetLang,
                tier = tier,
                onDownloadingModel = { isDownloading ->
                    mtIsDownloadingModel = isDownloading
                }
            )

            mtIsLoading = false
            mtIsDownloadingModel = false

            if (result.isSuccess) {
                val res = result.getOrThrow()
                mtTranslatedText = res.translatedText
                mtDetectedSourceLang = res.sourceLanguageName
                mtErrorMessage = null
            } else {
                mtTranslatedText = ""
                mtErrorMessage = result.exceptionOrNull()?.localizedMessage ?: "Translation failed"
            }
        }
    }

    fun saveCurrentMtToHistory(
        sourceLang: String,
        targetLang: String,
        profileId: Int,
        tier: LocalTranslationEngine.Tier = LocalTranslationEngine.Tier.NORMAL,
        onSaved: () -> Unit = {}
    ) {
        val cleanText = mtSourceText.trim()
        val trans = mtTranslatedText.trim()
        if (cleanText.isBlank() || trans.isBlank() || mtIsSaved) return

        bgScope.launch {
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val langKey = "$sourceLang -> $targetLang [MT:${tier.id}]"
                val wordId = database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(
                        profileId = profileId,
                        term = cleanText,
                        language = langKey,
                        sessionId = sessionId,
                        mode = "correct"
                    )
                ).toInt()

                val markdownResult = buildString {
                    append("### 🌐 Machine Translation (${tier.displayName})\n\n")
                    append("> **Detected/Source:** ${mtDetectedSourceLang ?: sourceLang} ➔ **Target:** $targetLang\n\n")
                    append("#### Translation:\n")
                    append("$trans\n\n")
                    append("---\n")
                    append("💡 *Local on-device translation saved to history.*")
                }

                database.appDao().insertChatMessage(
                    com.aidict.app.data.entities.ChatMessage(
                        wordId = wordId,
                        role = "assistant",
                        content = markdownResult
                    )
                )

                mtIsSaved = true
                withContext(Dispatchers.Main) {
                    onSaved()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun translateLocalMachine(
        text: String,
        sourceLang: String,
        targetLang: String,
        profileId: Int,
        tier: LocalTranslationEngine.Tier = LocalTranslationEngine.Tier.NORMAL
    ) {
        val cleanText = text.trim()
        if (cleanText.isBlank()) return
        clearSuggestions()
        val _uiState = _correctState
        bgScope.launch {
            var savedMsg: com.aidict.app.data.entities.ChatMessage? = null
            var savedWord: com.aidict.app.data.entities.Word? = null
            var wordId: Int? = null
            try {
                val sessionId = getOrCreateActiveSessionId(profileId)
                val langKey = "$sourceLang -> $targetLang [MT:${tier.id}]"
                val existingWord = database.appDao().findWordExact(profileId, "correct", cleanText, langKey)
                if (existingWord != null) {
                    val existingMsgs = database.appDao().getChatMessagesSync(existingWord.id)
                    val hasValidOutput = existingMsgs.any { it.role == "assistant" && it.content.isNotBlank() && !it.content.startsWith("Generating") && !it.content.contains("Generation Failed") }
                    if (hasValidOutput) {
                        database.appDao().incrementSearchCount(existingWord.id)
                        val updatedWord = existingWord.copy(searchCount = existingWord.searchCount + 1, sessionId = sessionId)
                        database.appDao().updateWord(updatedWord)
                        loadWord(updatedWord)
                        return@launch
                    }
                    savedWord = existingWord
                }
                val currentWordId = savedWord?.id ?: database.appDao().insertWord(
                    com.aidict.app.data.entities.Word(profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "correct")
                ).toInt()
                wordId = currentWordId
                if (savedWord == null) {
                    savedWord = com.aidict.app.data.entities.Word(id = currentWordId, profileId = profileId, term = cleanText, language = langKey, sessionId = sessionId, mode = "correct")
                }
                notifyBackgroundStatus("Translating text (Offline MT)")
                val initialMsg = com.aidict.app.data.entities.ChatMessage(wordId = currentWordId, role = "assistant", content = "Translating with local model...")
                val msgId = database.appDao().insertChatMessage(initialMsg).toInt()
                savedMsg = initialMsg.copy(id = msgId)
                _uiState.value = SearchState(isLoading = true, word = savedWord, chatMessages = listOf(savedMsg), currentStream = "", error = null)

                val result = LocalTranslationEngine.translate(
                    text = cleanText,
                    sourceLanguage = sourceLang,
                    targetLanguage = targetLang,
                    tier = tier,
                    onDownloadingModel = { isDownloading ->
                        if (isDownloading && _uiState.value.word?.id == currentWordId) {
                            _uiState.value = _uiState.value.copy(currentStream = "⏳ Downloading offline language model pack (~30MB)...")
                        }
                    }
                )

                if (result.isSuccess) {
                    val res = result.getOrThrow()
                    val markdownResult = buildString {
                        append("### 🌐 Machine Translation (${res.tier.displayName})\n\n")
                        append("> **Detected/Source:** ${res.sourceLanguageName} ➔ **Target:** ${res.targetLanguageName}\n\n")
                        append("#### Translation:\n")
                        append("${res.translatedText}\n\n")
                        append("---\n")
                        append("💡 *Local on-device translation. To get in-depth grammar correction, contextual nuances, or alternative phrasings, switch to **Correction & Translation** or click **Resume with AI LLM**.*")
                    }
                    val finalMsg = savedMsg.copy(content = markdownResult)
                    database.appDao().insertChatMessage(finalMsg)
                    if (_uiState.value.word?.id == currentWordId) {
                        val updatedMsgs = database.appDao().getChatMessagesSync(currentWordId)
                        _uiState.value = SearchState(isLoading = false, word = savedWord, chatMessages = updatedMsgs, currentStream = "")
                    }
                } else {
                    throw result.exceptionOrNull() ?: Exception("Local translation failed")
                }
            } catch (e: Exception) {
                val errorDetail = e.localizedMessage?.takeIf { it.isNotBlank() } ?: "Local machine translation error (${e.javaClass.simpleName})"
                val failureMarkdown = formatFailureMarkdown(errorDetail)
                val targetWordId = wordId ?: savedWord?.id
                if (targetWordId != null) {
                    val userMsg = savedMsg?.copy(content = failureMarkdown) ?: com.aidict.app.data.entities.ChatMessage(wordId = targetWordId, role = "assistant", content = failureMarkdown)
                    database.appDao().insertChatMessage(userMsg)
                    val updated = database.appDao().getChatMessagesSync(targetWordId)
                    if (_uiState.value.word?.id == targetWordId) {
                        _uiState.value = _uiState.value.copy(isLoading = false, chatMessages = updated, currentStream = "", error = errorDetail)
                    }
                }
            } finally {
                notifyBackgroundStatus()
            }
        }
    }

    fun moveWordToModeAndRegenerate(word: com.aidict.app.data.entities.Word, targetMode: String) {
        val cleanMode = targetMode.lowercase()
        bgScope.launch {
            val targetWordId = word.id
            activeStreamJobs[targetWordId]?.cancel()
            activeStreamJobs.remove(targetWordId)
            activeStreamTexts.remove(targetWordId)
            notifyBackgroundStatus()

            database.appDao().updateWordMode(targetWordId, cleanMode)
            database.appDao().deleteChatMessagesByWordId(targetWordId)

            val updatedWord = word.copy(mode = cleanMode, language = null, lemma = null)
            database.appDao().updateWord(updatedWord)

            val oldUiState = getUiState(word.mode)
            if (oldUiState.value.word?.id == targetWordId) {
                oldUiState.value = SearchState()
            }

            val profileId = word.profileId
            when (cleanMode) {
                "dict" -> {
                    val sourceLang = getProfileSetting(profileId, "DICT_SOURCE") ?: "Auto Detect"
                    val targetLang = getProfileSetting(profileId, "DICT_TARGET") ?: "English"
                    searchWord(word.term, sourceLang, targetLang, profileId)
                }
                "compare" -> {
                    val sourceLang = getProfileSetting(profileId, "COMPARE_SOURCE") ?: "Auto Detect"
                    val targetLang = getProfileSetting(profileId, "COMPARE_TARGET") ?: "English"
                    streamCompare(word.term, sourceLang, targetLang, profileId)
                }
                "translate" -> {
                    val sourceLang = getProfileSetting(profileId, "TRANSLATE_SOURCE") ?: "Auto Detect"
                    val targetLang = getProfileSetting(profileId, "TRANSLATE_TARGET") ?: "English"
                    streamTranslation(word.term, sourceLang, targetLang, profileId)
                }
                "explain" -> {
                    val sourceLang = getProfileSetting(profileId, "EXPLAIN_SOURCE") ?: "Auto Detect"
                    val targetLang = getProfileSetting(profileId, "EXPLAIN_TARGET") ?: "English"
                    streamExplain(word.term, sourceLang, targetLang, profileId)
                }
                "correct" -> {
                    val sourceLang = getProfileSetting(profileId, "CORRECT_SOURCE") ?: "Auto Detect"
                    val targetLang = getProfileSetting(profileId, "CORRECT_TARGET") ?: "English"
                    val correctType = getProfileSetting(profileId, "CORRECT_TYPE") ?: "both"
                    if (correctType == "machine_translate") {
                        val tierStr = getProfileSetting(profileId, "CORRECT_MT_TIER") ?: "normal"
                        val tier = if (tierStr == "strong") LocalTranslationEngine.Tier.STRONG else LocalTranslationEngine.Tier.NORMAL
                        translateLocalMachine(word.term, sourceLang, targetLang, profileId, tier)
                    } else {
                        val isCorrectionOnly = correctType == "correction_only"
                        streamCorrect(word.term, sourceLang, targetLang, profileId, isCorrectionOnly)
                    }
                }
            }
        }
    }

    private suspend fun getOrCreateActiveSessionId(profileId: Int): String {
        val activeSessionId = database.appDao().getSetting("ACTIVE_SESSION_ID")?.value
        if (!activeSessionId.isNullOrBlank()) {
            val exists = database.appDao().getSessionsSync(profileId.toLong()).any { it.id == activeSessionId }
            if (exists) return activeSessionId
        }
        val timeName = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())
        
        // Check if there's already a session with today's date for this profile
        val existingToday = database.appDao().getSessionsSync(profileId.toLong()).find { it.name == timeName }
        if (existingToday != null) {
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("ACTIVE_SESSION_ID", existingToday.id))
            return existingToday.id
        }
        
        val s = com.aidict.app.data.entities.Session(name = timeName, profileId = profileId.toLong())
        database.appDao().insertSession(s)
        database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("ACTIVE_SESSION_ID", s.id))
        return s.id
    }

}