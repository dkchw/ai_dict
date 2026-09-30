package com.aidict.app.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.entities.Word
import com.aidict.app.data.entities.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import com.aidict.app.data.entities.AppSetting
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.ExperimentalCoroutinesApi

class HistoryViewModel(private val database: AppDatabase) : ViewModel() {
    private val searchQuery = MutableStateFlow("")
    val searchInOutput = MutableStateFlow(false)
    fun toggleSearchInOutput() { searchInOutput.value = !searchInOutput.value }
    private val selectedColor = MutableStateFlow<String?>(null)
    private val selectedStars = MutableStateFlow<Int?>(null)
    val currentMode = MutableStateFlow("dict")
    
    val colorFilter: StateFlow<String?> = selectedColor
    val starsFilter: StateFlow<Int?> = selectedStars

    private val manualProfileId = MutableStateFlow<Int?>(null)
    fun setActiveProfileId(id: Int) { manualProfileId.value = id }

    @OptIn(ExperimentalCoroutinesApi::class)
    val effectiveProfileId: StateFlow<Int> = combine(
        database.appDao().getSettingsFlow().map { settings ->
            settings.find { it.key == "ACTIVE_PROFILE_ID" }?.value?.toIntOrNull() ?: 1
        },
        manualProfileId
    ) { dbId, manual -> manual ?: dbId }.stateIn(viewModelScope, SharingStarted.Eagerly, 1)

    @OptIn(ExperimentalCoroutinesApi::class)
    val allProfileWords: StateFlow<List<Word>> = effectiveProfileId.flatMapLatest { pid ->
        database.appDao().getWordsByProfile(pid)
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    val modeCounts: StateFlow<Map<String, Int>> = allProfileWords.map { words ->
        mapOf(
            "dict" to words.count { (it.mode.ifBlank { "dict" }).equals("dict", ignoreCase = true) },
            "compare" to words.count { it.mode.equals("compare", ignoreCase = true) },
            "translate" to words.count { it.mode.equals("translate", ignoreCase = true) },
            "explain" to words.count { it.mode.equals("explain", ignoreCase = true) },
            "correct" to words.count { it.mode.equals("correct", ignoreCase = true) }
        )
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyMap())

    @OptIn(ExperimentalCoroutinesApi::class)
    private val allHistory: StateFlow<List<Word>> = combine(allProfileWords, currentMode) { words, mode ->
        words.filter { (it.mode.ifBlank { "dict" }).equals(mode, ignoreCase = true) }
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
        
    @OptIn(ExperimentalCoroutinesApi::class)
    val sessions = effectiveProfileId.flatMapLatest { pid -> database.appDao().getSessions(pid.toLong()) }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    val activeSessionId = database.appDao().getSettingsFlow().map { settings ->
        settings.find { it.key == "ACTIVE_SESSION_ID" }?.value
    }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Lazily, null)

    fun setActiveSession(id: String?) {
        viewModelScope.launch {
            if (id == null) {
                database.appDao().insertSetting(AppSetting("ACTIVE_SESSION_ID", ""))
            } else {
                database.appDao().insertSetting(AppSetting("ACTIVE_SESSION_ID", id))
            }
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    val matchingWordIds = kotlinx.coroutines.flow.combine(searchQuery, searchInOutput) { q, searchOut -> 
        if (q.isBlank() || !searchOut) null else q
    }.flatMapLatest { q ->
        if (q == null) kotlinx.coroutines.flow.flowOf<Set<Int>?>(null)
        else kotlinx.coroutines.flow.flow<Set<Int>?> { emit(database.appDao().getWordIdsMatchingContent(q).toSet()) }
    }.stateIn(viewModelScope, SharingStarted.Lazily, null)

    val historyState: StateFlow<List<Word>> = combine(
        allHistory, 
        searchQuery, 
        selectedColor, 
        selectedStars,
        matchingWordIds
    ) { history, query, color, stars, matchingIds ->
        history.filter { word ->
            val matchQuery = if (query.isBlank()) true else {
                word.term.contains(query, ignoreCase = true) || (matchingIds?.contains(word.id) == true)
            }
            val matchColor = if (color == null) true else word.color == color
            val matchStars = if (stars == null) true else word.stars == stars
            matchQuery && matchColor && matchStars
        }
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    fun setMode(mode: String) {
        currentMode.value = if (mode.isBlank() || mode.equals("all", ignoreCase = true)) "dict" else mode.lowercase()
    }

    fun updateSearchQuery(query: String) {
        searchQuery.value = query
    }

    fun setFilterColor(color: String?) {
        selectedColor.value = if (selectedColor.value == color) null else color
    }

    fun setFilterStars(stars: Int?) {
        selectedStars.value = if (selectedStars.value == stars) null else stars
    }
    
    fun createSession(name: String) {
        viewModelScope.launch {
            val s = Session(name = name, profileId = effectiveProfileId.value.toLong())
            database.appDao().insertSession(s)
            setActiveSession(s.id)
        }
    }
    
    fun renameSession(session: Session, newName: String) {
        viewModelScope.launch {
            database.appDao().insertSession(session.copy(name = newName))
        }
    }
    
    fun deleteSession(session: Session) {
        viewModelScope.launch {
            database.appDao().deleteSession(session)
        }
    }

    fun deleteSelectedSessions(sessionIds: Set<String>) {
        viewModelScope.launch {
            database.appDao().deleteSessionsByIds(sessionIds.toList())
            val active = database.appDao().getSetting("ACTIVE_SESSION_ID")?.value
            if (active in sessionIds) {
                setActiveSession(null)
            }
        }
    }

    fun moveWord(word: com.aidict.app.data.entities.Word, targetProfileId: Int) {
        viewModelScope.launch {
            database.appDao().updateWord(word.copy(profileId = targetProfileId))
        }
    }

    fun moveWordMode(word: com.aidict.app.data.entities.Word, targetMode: String) {
        viewModelScope.launch {
            database.appDao().updateWordMode(word.id, targetMode.lowercase())
        }
    }

    fun moveSelected(sessionIds: Set<String>, wordIds: Set<Int>, targetProfileId: Int) {
        viewModelScope.launch {
            if (sessionIds.isNotEmpty()) {
                database.appDao().moveSessionsByIds(sessionIds.toList(), targetProfileId.toLong())
                // All words within these sessions should ALSO be moved!
                database.appDao().moveWordsBySessionIds(sessionIds.toList(), targetProfileId)
            }
            if (wordIds.isNotEmpty()) {
                database.appDao().moveWordsByIds(wordIds.toList(), targetProfileId)
            }
        }
    }

    fun moveSelectedWordsMode(wordIds: Set<Int>, targetMode: String) {
        viewModelScope.launch {
            if (wordIds.isNotEmpty()) {
                database.appDao().updateWordsMode(wordIds.toList(), targetMode.lowercase())
            }
        }
    }

    fun deleteSelectedWords(wordIds: Set<Int>) {
        viewModelScope.launch {
            database.appDao().deleteWordsByIds(wordIds.toList())
            if (selectedWordId.value in wordIds) {
                setSelectedWordId(null)
            }
        }
    }

    
    fun renameWord(word: com.aidict.app.data.entities.Word, newTerm: String) {
        viewModelScope.launch {
            database.appDao().updateWord(word.copy(term = newTerm))
        }
    }
    
    fun deleteWord(word: com.aidict.app.data.entities.Word) {
        viewModelScope.launch {
            database.appDao().deleteWord(word)
        }
    }
    
    val splitFraction = kotlinx.coroutines.flow.MutableStateFlow(0.5f)
    init {
        viewModelScope.launch {
            val saved = database.appDao().getSetting("HISTORY_SPLIT_FRACTION")?.value?.toFloatOrNull()
            if (saved != null) {
                splitFraction.value = saved
            }
        }
    }
    
    fun updateSplitFraction(fraction: Float) {
        splitFraction.value = fraction
        viewModelScope.launch {
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("HISTORY_SPLIT_FRACTION", fraction.toString()))
        }
    }

    private val selectedWordId = MutableStateFlow<Int?>(null)
    @OptIn(ExperimentalCoroutinesApi::class)
    val selectedChatMessages = selectedWordId.flatMapLatest { wordId ->
        if (wordId == null) kotlinx.coroutines.flow.flowOf(emptyList())
        else database.appDao().getChatMessages(wordId)
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    fun setSelectedWordId(wordId: Int?) {
        selectedWordId.value = wordId
        if (wordId != null) {
            viewModelScope.launch { database.appDao().incrementViewCount(wordId) }
        }
    }
}