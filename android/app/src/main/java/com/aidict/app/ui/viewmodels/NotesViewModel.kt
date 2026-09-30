package com.aidict.app.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.entities.Note
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class NotesViewModel(private val database: AppDatabase) : ViewModel() {
    val notes = database.appDao().getNotesFlow().stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    private var draftJob: kotlinx.coroutines.Job? = null
    var noteDraftTitle = androidx.compose.runtime.mutableStateOf("")
    var noteDraftContent = androidx.compose.runtime.mutableStateOf("")

    init {
        viewModelScope.launch {
            noteDraftTitle.value = database.appDao().getSetting("NOTE_DRAFT_TITLE")?.value ?: ""
            noteDraftContent.value = database.appDao().getSetting("NOTE_DRAFT_CONTENT")?.value ?: ""
        }
    }

    fun updateDraftTitle(title: String) {
        noteDraftTitle.value = title
        draftJob?.cancel()
        draftJob = viewModelScope.launch {
            kotlinx.coroutines.delay(300)
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("NOTE_DRAFT_TITLE", title))
        }
    }

    fun updateDraftContent(content: String) {
        noteDraftContent.value = content
        draftJob?.cancel()
        draftJob = viewModelScope.launch {
            kotlinx.coroutines.delay(300)
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("NOTE_DRAFT_CONTENT", content))
        }
    }

    fun saveDraftAsNote() {
        if (noteDraftTitle.value.isNotBlank() || noteDraftContent.value.isNotBlank()) {
            addNote(noteDraftTitle.value, noteDraftContent.value)
            updateDraftTitle("")
            updateDraftContent("")
        }
    }

    fun addNote(title: String, content: String) {
        viewModelScope.launch {
            database.appDao().insertNote(Note(title = title, content = content))
        }
    }

    fun updateNote(note: Note) {
        viewModelScope.launch {
            database.appDao().updateNote(note)
        }
    }

    fun deleteNote(note: Note) {
        viewModelScope.launch {
            database.appDao().deleteNote(note)
        }
    }

    fun deleteNotes(ids: List<Int>) {
        viewModelScope.launch {
            database.appDao().deleteNotesByIds(ids)
        }
    }
}
