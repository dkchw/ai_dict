package com.aidict.app.ui.screens

import androidx.compose.material.icons.filled.Check
import androidx.compose.foundation.layout.wrapContentWidth


import androidx.compose.foundation.layout.*
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.rememberScrollState

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.ui.platform.LocalContext
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import com.aidict.app.ui.components.MarkdownText
import androidx.compose.ui.unit.dp

@Composable
fun CompareScreen(
    viewModel: com.aidict.app.ui.viewmodels.SearchViewModel, profileId: Int,
    autoNewSearch: Boolean = false,
    onToggleAutoNewSearch: () -> Unit = {},
    enterToSend: Boolean = false,
    onMoveToMode: (com.aidict.app.data.entities.Word, String) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    val state by viewModel.compareState.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    var sourceLang by remember { mutableStateOf("Auto Detect") }
    var targetLang by remember { mutableStateOf("English") }
    LaunchedEffect(profileId) {
        sourceLang = viewModel.getProfileSetting(profileId, "COMPARE_SOURCE") ?: "Auto Detect"
        targetLang = viewModel.getProfileSetting(profileId, "COMPARE_TARGET") ?: "English"
    }
    
    val context = LocalContext.current
    var isChatSearching by remember { mutableStateOf(false) }
    var chatSearchQuery by remember { mutableStateOf("") }
    var showMoveToModeDialog by remember { mutableStateOf(false) }
    var showRenameDialog by remember { mutableStateOf(false) }
    val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    Column(modifier = modifier.fillMaxSize().padding(horizontal = if (isLandscape) 8.dp else 16.dp, vertical = if (isLandscape) 2.dp else 16.dp)) {
        // Error Banner
        state.error?.let { errorMsg ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = "Error", tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = errorMsg,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { viewModel.clearError("compare") }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Clear, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                val lastAssistantMsg = state.chatMessages.findLast { it.role == "assistant" }
                                Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                viewModel.retryMessage(lastAssistantMsg, false, "compare", state.word)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Text("Retry", style = MaterialTheme.typography.labelSmall)
                        }
                        OutlinedButton(
                            onClick = {
                                val lastAssistantMsg = state.chatMessages.findLast { it.role == "assistant" }
                                Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                viewModel.retryMessage(lastAssistantMsg, true, "compare", state.word)
                            },
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Text("Retry (Fallback)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }

        // Header / Action Bar
        state.word?.let { word ->
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                com.aidict.app.ui.components.ChatHeaderTitle(
                    word = word,
                    onClick = { showRenameDialog = true },
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = {
                    val clip = ClipData.newPlainText("AI Dict", state.chatMessages.firstOrNull()?.content ?: "")
                    clipboardManager.setPrimaryClip(clip)
                    Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                }) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy")
                }
                IconButton(onClick = { isChatSearching = !isChatSearching }) {
                    Icon(Icons.Default.Search, contentDescription = "Search in Chat")
                }
                IconButton(onClick = {
                    val lastAssistantMsg = state.chatMessages.findLast { it.role == "assistant" }
                    Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                    viewModel.retryMessage(lastAssistantMsg, false, "compare", state.word)
                }) {
                    if (state.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                    } else {
                        Icon(Icons.Default.Refresh, contentDescription = "Restart with Current Model", tint = MaterialTheme.colorScheme.primary)
                    }
                }
                IconButton(onClick = {
                    val lastAssistantMsg = state.chatMessages.findLast { it.role == "assistant" }
                    Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                    viewModel.retryMessage(lastAssistantMsg, true, "compare", state.word)
                }) {
                    if (state.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                    } else {
                        Icon(Icons.Default.Autorenew, contentDescription = "Restart with Fallback Model", tint = MaterialTheme.colorScheme.error)
                    }
                }
                IconButton(onClick = { showMoveToModeDialog = true }) {
                    Icon(Icons.AutoMirrored.Filled.CompareArrows, contentDescription = "Move Mode & Regenerate", tint = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = { viewModel.deleteCurrentWord("compare") }) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                }
            }
        }
        if (showMoveToModeDialog && state.word != null) {
            com.aidict.app.ui.components.MoveModeDialog(
                currentMode = "compare",
                onDismiss = { showMoveToModeDialog = false },
                onSelectMode = { targetMode ->
                    onMoveToMode(state.word!!, targetMode)
                }
            )
        }
        if (showRenameDialog && state.word != null) {
            com.aidict.app.ui.components.RenameWordDialog(
                word = state.word!!,
                onDismiss = { showRenameDialog = false },
                onConfirm = { newName ->
                    viewModel.renameWord(state.word!!, newName, "compare")
                }
            )
        }
        if (isChatSearching) {
            OutlinedTextField(
                value = chatSearchQuery,
                onValueChange = { chatSearchQuery = it },
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                placeholder = { Text("Find in chat...") },
                singleLine = true,
                trailingIcon = {
                    if (chatSearchQuery.isNotEmpty()) {
                        IconButton(onClick = { chatSearchQuery = "" }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear Search")
                        }
                    }
                }
            )
        }
        LazyColumn(modifier = Modifier.weight(1f)) {
            if (state.chatMessages.isEmpty()) {
                item { Spacer(modifier = Modifier.fillParentMaxSize()) }
            }
            items(state.chatMessages) { msg ->
                var isEditing by remember { mutableStateOf(false) }
                var editingContent by remember { mutableStateOf("") }
                val isUser = msg.role == "user"
                val isGenerating = !isUser && msg.content == "Generating..."
                val isError = !isUser && msg.content.startsWith("### ⚠️ Generation Failed")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                ) {
                    Column(modifier = Modifier.fillMaxWidth(if (isUser) 0.85f else 1f)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(if (isUser) 1f else 0.85f)
                                .padding(vertical = 4.dp)
                                .background(
                                    color = when {
                                        isUser -> MaterialTheme.colorScheme.primary
                                        isError -> MaterialTheme.colorScheme.errorContainer
                                        else -> MaterialTheme.colorScheme.secondaryContainer
                                    },
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .padding(12.dp)
                        ) {
                            if (isUser) {
                                MarkdownText(text = msg.content, color = MaterialTheme.colorScheme.onPrimary, searchQuery = chatSearchQuery)
                            } else if (isGenerating) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    com.aidict.app.ui.components.PulsingDots()
                                    Spacer(Modifier.width(8.dp))
                                    Text(if (state.isLoading) "Working on it..." else "Generation interrupted", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
                                }
                            } else {
                                if (isEditing) {
                                    Column {
                                        OutlinedTextField(
                                            value = editingContent,
                                            onValueChange = { editingContent = it },
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                                            TextButton(onClick = { isEditing = false }) { Text("Cancel", color = MaterialTheme.colorScheme.primary) }
                                            TextButton(onClick = { 
                                                viewModel.editMessage(msg, editingContent, "compare")
                                                isEditing = false 
                                            }) { Text("Save", color = MaterialTheme.colorScheme.primary) }
                                        }
                                    }
                                } else {
                                    Column {
                                        MarkdownText(
                                            text = msg.content,
                                            color = if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                                            searchQuery = chatSearchQuery
                                        )
                                        if (isError) {
                                            Spacer(Modifier.height(8.dp))
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Button(
                                                    onClick = { 
                                                        Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                                        viewModel.retryMessage(msg, false, "compare", state.word) 
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                                    modifier = Modifier.height(30.dp)
                                                ) {
                                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(Modifier.width(4.dp))
                                                    Text("Retry", style = MaterialTheme.typography.labelSmall)
                                                }
                                                OutlinedButton(
                                                    onClick = { 
                                                        Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                                        viewModel.retryMessage(msg, true, "compare", state.word) 
                                                    },
                                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                                    modifier = Modifier.height(30.dp)
                                                ) {
                                                    Icon(Icons.Default.Autorenew, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(Modifier.width(4.dp))
                                                    Text("Fallback", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (!isUser && !isEditing && (!isGenerating || !state.isLoading)) {
                            Row(modifier = Modifier.fillMaxWidth(0.85f), horizontalArrangement = Arrangement.Start) {
                                IconButton(onClick = {
                                    clipboardManager.setPrimaryClip(ClipData.newPlainText("AI Dict", msg.content))
                                    Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                                }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.ContentCopy, "Copy", modifier = Modifier.size(16.dp)) }
                                IconButton(onClick = { isEditing = true; editingContent = msg.content }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Edit, "Edit", modifier = Modifier.size(16.dp)) }
                                IconButton(onClick = { 
                                    Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                    viewModel.retryMessage(msg, false, "compare", state.word) 
                                }, modifier = Modifier.size(32.dp)) { 
                                    if (state.isLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                    } else {
                                        Icon(Icons.Default.Refresh, "Regenerate (Current)", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = { 
                                    Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                    viewModel.retryMessage(msg, true, "compare", state.word) 
                                }, modifier = Modifier.size(32.dp)) { 
                                    if (state.isLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                                    } else {
                                        Icon(Icons.Default.Autorenew, "Regenerate (Fallback)", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = { viewModel.deleteMessage(msg, "compare") }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Delete, "Delete", modifier = Modifier.size(16.dp)) }
                            }
                        }
                    }
                }
            }
            
            // Current stream
            if (state.isLoading && state.currentStream.isNotEmpty()) {
                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.85f)
                                .padding(vertical = 4.dp)
                                .background(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(12.dp))
                                .padding(12.dp)
                        ) {
                            Text(text = state.currentStream, color = MaterialTheme.colorScheme.onSecondaryContainer)
                        }
                    }
                }
            }
            
            if (state.isLoading && state.currentStream.isEmpty()) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        com.aidict.app.ui.components.PulsingDots()
                        Spacer(Modifier.width(8.dp))
                        Text("Working on it...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        val isFollowUp = state.word != null && !state.isLoading
        com.aidict.app.ui.components.ChatInputBar(
            availableLanguages = viewModel.orderedLanguages.collectAsState().value,
            inputTerm = viewModel.compareInput,
            onValueChange = { viewModel.compareInput = it },
            onSend = { 
                val query = viewModel.compareInput
                if (autoNewSearch || !isFollowUp) { 
                    viewModel.streamCompare(query, sourceLang, targetLang, profileId) 
                } else {
                    viewModel.sendFollowUpMessage(query, "compare") 
                }
                viewModel.compareInput = "" 
            },
            isLoading = state.isLoading,
            autoNewSearch = autoNewSearch,
            onToggleAutoNewSearch = onToggleAutoNewSearch,
            enterToSend = enterToSend,
            isFollowUp = isFollowUp,
            sourceLang = if (!isFollowUp || autoNewSearch) sourceLang else null,
            targetLang = if (!isFollowUp || autoNewSearch) targetLang else null,
            onSourceLangChange = if (!isFollowUp || autoNewSearch) { { sourceLang = it; viewModel.saveProfileSetting(profileId, "COMPARE_SOURCE", it) } } else null,
            onTargetLangChange = if (!isFollowUp || autoNewSearch) { { targetLang = it; viewModel.saveProfileSetting(profileId, "COMPARE_TARGET", it) } } else null,
            onClear = { viewModel.clearCurrentSearch("compare") },
            suggestions = suggestions,
            onSuggestionClick = { word -> 
                viewModel.loadWord(word)
                viewModel.compareInput = ""
                viewModel.clearSuggestions()
            },
            placeholder = if (isFollowUp && !autoNewSearch) "Enter your question..." else "Words to compare (comma separated)..."
        )
    }
}
