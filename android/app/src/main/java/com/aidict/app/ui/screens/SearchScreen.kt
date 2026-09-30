package com.aidict.app.ui.screens

import androidx.compose.material.icons.filled.Check
import androidx.compose.foundation.layout.wrapContentWidth
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Clear

import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.aidict.app.ui.components.MarkdownText
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.aidict.app.ui.viewmodels.SearchViewModel

@Composable
fun SearchScreen(
    viewModel: SearchViewModel, profileId: Int,
    autoNewSearch: Boolean = false,
    onToggleAutoNewSearch: () -> Unit = {},
    enterToSend: Boolean = false,
    onMoveToMode: (com.aidict.app.data.entities.Word, String) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    val state by viewModel.dictState.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    val context = LocalContext.current
    var isChatSearching by remember { mutableStateOf(false) }
    var chatSearchQuery by remember { mutableStateOf("") }
    var showMoveToModeDialog by remember { mutableStateOf(false) }
    var showRenameDialog by remember { mutableStateOf(false) }

    val colors = listOf(
        "Red" to Color(0xFFEF4444),
        "Orange" to Color(0xFFF97316),
        "Yellow" to Color(0xFFEAB308),
        "Green" to Color(0xFF22C55E),
        "Blue" to Color(0xFF3B82F6)
    )

    var sourceLang by remember { mutableStateOf("Auto Detect") }
    var targetLang by remember { mutableStateOf("English") }
    LaunchedEffect(profileId) {
        sourceLang = viewModel.getProfileSetting(profileId, "SEARCH_SOURCE") ?: "Auto Detect"
        targetLang = viewModel.getProfileSetting(profileId, "SEARCH_TARGET") ?: "English"
    }

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    Column(modifier = modifier.fillMaxSize().padding(horizontal = if (isLandscape) 8.dp else 16.dp, vertical = if (isLandscape) 2.dp else 8.dp)) {

        // Error Banner Card
        state.error?.let { errorText ->
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = "Error", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Query Failed",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { viewModel.clearError("dict") }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Clear, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(16.dp))
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = errorText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                val lastUserMsg = state.chatMessages.findLast { it.role == "assistant" }
                                Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                viewModel.retryMessage(lastUserMsg, false, "dict", state.word)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Text("Retry", style = MaterialTheme.typography.labelSmall)
                        }
                        OutlinedButton(
                            onClick = {
                                val lastUserMsg = state.chatMessages.findLast { it.role == "assistant" }
                                Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                viewModel.retryMessage(lastUserMsg, true, "dict", state.word)
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

        // Action Bar (Only if word is saved)
        state.word?.let { word ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                    .padding(8.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    com.aidict.app.ui.components.ChatHeaderTitle(
                        word = word,
                        onClick = { showRenameDialog = true },
                        modifier = Modifier.weight(1f)
                    )

                    IconButton(onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        val clip = ClipData.newPlainText("AI Dict", state.chatMessages.firstOrNull()?.content ?: "")
                        clipboard.setPrimaryClip(clip)
                        Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                    }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy")
                    }

                    IconButton(onClick = { isChatSearching = !isChatSearching }) {
                        Icon(Icons.Default.Search, contentDescription = "Search in Chat")
                    }
                    IconButton(onClick = {
                        val lastUserMsg = state.chatMessages.findLast { it.role == "assistant" }
                        Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                        viewModel.retryMessage(lastUserMsg, false, "dict", state.word)
                    }) {
                        if (state.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = "Restart with Current Model", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    
                    IconButton(onClick = { 
                        val lastUserMsg = state.chatMessages.findLast { it.role == "assistant" }
                        Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                        viewModel.retryMessage(lastUserMsg, true, "dict", state.word)
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

                    IconButton(onClick = { viewModel.deleteCurrentWord("dict") }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                    }
                }
                
                if (showMoveToModeDialog && state.word != null) {
                    com.aidict.app.ui.components.MoveModeDialog(
                        currentMode = "dict",
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
                            viewModel.renameWord(state.word!!, newName, "dict")
                        }
                    )
                }
                
                if (isChatSearching) {
                    OutlinedTextField(
                        value = chatSearchQuery,
                        onValueChange = { chatSearchQuery = it },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
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
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    // Colors
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        colors.forEach { (name, colorValue) ->
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .background(color = colorValue, shape = CircleShape)
                                    .clickable { viewModel.updateWordColor(if (word.color == name) "" else name) }
                                    .padding(2.dp)
                            ) {
                                if (word.color == name) {
                                    Box(modifier = Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.5f), CircleShape))
                                }
                            }
                        }
                    }
                    
                    Spacer(Modifier.weight(1f))
                    
                    // Stars
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        (1..5).forEach { star ->
                            Icon(
                                imageVector = if (word.stars >= star) Icons.Default.Star else Icons.Outlined.StarBorder,
                                contentDescription = "Star $star",
                                tint = if (word.stars >= star) Color(0xFFFFC107) else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .size(24.dp)
                                    .clickable { viewModel.updateWordStars(if (word.stars == star) 0 else star) }
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Chat History & Streaming
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
                                                viewModel.editMessage(msg, editingContent, "dict")
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
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Button(
                                                    onClick = { 
                                                        Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                                        viewModel.retryMessage(msg, false, "dict", state.word) 
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                                    modifier = Modifier.height(30.dp)
                                                ) {
                                                    Text("Retry", style = MaterialTheme.typography.labelSmall)
                                                }
                                                OutlinedButton(
                                                    onClick = { 
                                                        Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                                        viewModel.retryMessage(msg, true, "dict", state.word) 
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
                            }
                        }
                        if (!isUser && !isEditing && (!isGenerating || !state.isLoading)) {
                            Row(modifier = Modifier.fillMaxWidth(0.85f), horizontalArrangement = Arrangement.Start) {
                                IconButton(onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    clipboard.setPrimaryClip(ClipData.newPlainText("AI Dict", msg.content))
                                    Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                                }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.ContentCopy, "Copy", modifier = Modifier.size(16.dp)) }
                                IconButton(onClick = { isEditing = true; editingContent = msg.content }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Edit, "Edit", modifier = Modifier.size(16.dp)) }
                                IconButton(onClick = { 
                                    Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                    viewModel.retryMessage(msg, false, "dict", state.word) 
                                }, modifier = Modifier.size(32.dp)) { 
                                    if (state.isLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                    } else {
                                        Icon(Icons.Default.Refresh, "Regenerate (Current)", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = { 
                                    Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                    viewModel.retryMessage(msg, true, "dict", state.word) 
                                }, modifier = Modifier.size(32.dp)) { 
                                    if (state.isLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                                    } else {
                                        Icon(Icons.Default.Autorenew, "Regenerate (Fallback)", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = { viewModel.deleteMessage(msg, "dict") }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Delete, "Delete", modifier = Modifier.size(16.dp)) }
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

        // Unified Input Bar (Search or Follow Up)
        val isFollowUp = state.word != null && !state.isLoading


        com.aidict.app.ui.components.ChatInputBar(availableLanguages = viewModel.orderedLanguages.collectAsState().value, 
            inputTerm = viewModel.searchInput,
            onValueChange = { viewModel.searchInput = it },
            onSend = {
                val query = viewModel.searchInput
                if (autoNewSearch || !isFollowUp) {
                    viewModel.searchWord(query, sourceLang, targetLang, profileId)
                } else {
                    viewModel.sendFollowUpMessage(query, "dict")
                }
                viewModel.searchInput = ""
            },
            isLoading = state.isLoading,
            autoNewSearch = autoNewSearch,
            onToggleAutoNewSearch = onToggleAutoNewSearch,
            enterToSend = enterToSend,
            suggestions = suggestions,
            onSuggestionClick = { word -> 
                viewModel.loadWord(word)
                viewModel.searchInput = ""
                viewModel.clearSuggestions()
            },
            placeholder = if (isFollowUp && !autoNewSearch) "Enter your question..." else "Search word...",
            isFollowUp = isFollowUp,
            sourceLang = if (!isFollowUp || autoNewSearch) sourceLang else null,
            targetLang = if (!isFollowUp || autoNewSearch) targetLang else null,
            onSourceLangChange = if (!isFollowUp || autoNewSearch) { { sourceLang = it; viewModel.saveProfileSetting(profileId, "SEARCH_SOURCE", it) } } else null,
            onTargetLangChange = if (!isFollowUp || autoNewSearch) { { targetLang = it; viewModel.saveProfileSetting(profileId, "SEARCH_TARGET", it) } } else null,
            onClear = { viewModel.clearCurrentSearch("dict") }
        )
    }
}
