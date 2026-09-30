package com.aidict.app.ui.screens

import androidx.compose.material.icons.filled.Check
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aidict.app.data.entities.Note
import com.aidict.app.ui.viewmodels.NotesViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(viewModel: NotesViewModel) {
    val notes by viewModel.notes.collectAsState()
    
    var showDialog by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var isSearching by remember { mutableStateOf(false) }
    var currentNote by remember { mutableStateOf<Note?>(null) }
    var noteTitle by remember { mutableStateOf("") }
    var noteContent by remember { mutableStateOf("") }
    
    var selectionMode by remember { mutableStateOf(false) }
    val selectedNotes = remember { mutableStateListOf<Int>() }

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = if (isLandscape) 8.dp else 16.dp, vertical = if (isLandscape) 2.dp else 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text("Notes", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            if (selectionMode) {
                IconButton(onClick = { 
                    viewModel.deleteNotes(selectedNotes.toList())
                    selectedNotes.clear()
                    selectionMode = false
                }) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete Selected", tint = MaterialTheme.colorScheme.error)
                }
                IconButton(onClick = { selectionMode = false; selectedNotes.clear() }) {
                    Icon(Icons.Default.Close, contentDescription = "Cancel")
                }
            } else {
                IconButton(onClick = { isSearching = !isSearching }) {
                    Icon(Icons.Default.Search, contentDescription = "Search")
                }
                IconButton(onClick = { selectionMode = true }) {
                    Icon(Icons.Default.Checklist, contentDescription = "Select")
                }
                IconButton(onClick = { 
                    currentNote = null
                    noteTitle = ""
                    noteContent = ""
                    showDialog = true 
                }) {
                    Icon(Icons.Default.Add, contentDescription = "Add Note")
                }
            }
        }
        
        if (isSearching) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                placeholder = { Text("Search notes...") },
                singleLine = true,
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear")
                        }
                    }
                }
            )
        }
        
        // Quick Add Note
        Card(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(8.dp)) {
                OutlinedTextField(
                    value = viewModel.noteDraftTitle.value,
                    onValueChange = { viewModel.updateDraftTitle(it) },
                    placeholder = { Text("Title (Optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = viewModel.noteDraftContent.value,
                    onValueChange = { viewModel.updateDraftContent(it) },
                    placeholder = { Text("Note content...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                Button(
                    onClick = { viewModel.saveDraftAsNote() },
                    modifier = Modifier.align(Alignment.End).padding(top = 8.dp),
                    enabled = viewModel.noteDraftTitle.value.isNotBlank() || viewModel.noteDraftContent.value.isNotBlank()
                ) {
                    Text("Save Quick Note")
                }
            }
        }
        
        LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
            items(notes) { note ->
                Card(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable {
                        if (selectionMode) {
                            if (selectedNotes.contains(note.id)) selectedNotes.remove(note.id)
                            else selectedNotes.add(note.id)
                        } else {
                            currentNote = note
                            noteTitle = note.title
                            noteContent = note.content
                            showDialog = true
                        }
                    },
                    colors = CardDefaults.cardColors(containerColor = if (selectedNotes.contains(note.id)) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface)
                ) {
                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (selectionMode) {
                            Checkbox(checked = selectedNotes.contains(note.id), onCheckedChange = {
                                if (it) selectedNotes.add(note.id) else selectedNotes.remove(note.id)
                            })
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(note.title, style = MaterialTheme.typography.titleMedium)
                            Text(note.content, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                        }
                    }
                }
            }
        }
    }
    
    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text(if (currentNote == null) "New Note" else "Edit Note") },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = noteTitle,
                        onValueChange = { noteTitle = it },
                        label = { Text("Title") },
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                    )
                    OutlinedTextField(
                        value = noteContent,
                        onValueChange = { noteContent = it },
                        label = { Text("Content") },
                        modifier = Modifier.fillMaxWidth().height(150.dp),
                        maxLines = 10
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (currentNote == null) {
                        viewModel.addNote(noteTitle, noteContent)
                    } else {
                        viewModel.updateNote(currentNote!!.copy(title = noteTitle, content = noteContent))
                    }
                    showDialog = false
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
            }
        )
    }
}
