package com.aidict.app.ui.screens

import androidx.compose.material.icons.filled.Check
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.ui.platform.LocalContext
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import android.speech.tts.TextToSpeech
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Language
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.BorderStroke
import kotlinx.coroutines.launch
import com.aidict.app.ui.components.ManageOfflineModelsDialog
import com.aidict.app.ui.components.MarkdownText
import com.aidict.app.ui.components.PulsingDots
import com.aidict.app.ui.components.MoveModeDialog
import com.aidict.app.ui.components.ChatInputBar

@Composable
fun CorrectScreen(
    viewModel: com.aidict.app.ui.viewmodels.SearchViewModel,
    profileId: Int,
    autoNewSearch: Boolean = false,
    onToggleAutoNewSearch: () -> Unit = {},
    enterToSend: Boolean = false,
    onMoveToMode: (com.aidict.app.data.entities.Word, String) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    val state by viewModel.correctState.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()

    var sourceLang by remember { mutableStateOf("Auto Detect") }
    var targetLang by remember { mutableStateOf("English") }
    var correctType by remember { mutableStateOf("both") }
    var mtTier by remember { mutableStateOf(com.aidict.app.data.LocalTranslationEngine.Tier.NORMAL) }

    LaunchedEffect(profileId) {
        sourceLang = viewModel.getProfileSetting(profileId, "CORRECT_SOURCE") ?: "Auto Detect"
        targetLang = viewModel.getProfileSetting(profileId, "CORRECT_TARGET") ?: "English"
        correctType = viewModel.getProfileSetting(profileId, "CORRECT_TYPE") ?: "both"
        val tierStr = viewModel.getProfileSetting(profileId, "CORRECT_MT_TIER") ?: "normal"
        mtTier = if (tierStr == "strong") com.aidict.app.data.LocalTranslationEngine.Tier.STRONG else com.aidict.app.data.LocalTranslationEngine.Tier.NORMAL
    }

    val context = LocalContext.current
    var isChatSearching by remember { mutableStateOf(false) }
    var chatSearchQuery by remember { mutableStateOf("") }
    var showMoveToModeDialog by remember { mutableStateOf(false) }
    var showRenameDialog by remember { mutableStateOf(false) }
    val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    var tts by remember { mutableStateOf<TextToSpeech?>(null) }
    var isTtsReady by remember { mutableStateOf(false) }

    DisposableEffect(context) {
        val ttsInstance = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                isTtsReady = true
            }
        }
        tts = ttsInstance
        onDispose {
            ttsInstance.stop()
            ttsInstance.shutdown()
        }
    }

    fun speakText(text: String, langName: String) {
        if (!isTtsReady || tts == null || text.isBlank()) return
        val tag = com.aidict.app.data.LocalTranslationEngine.getLanguageTag(langName) ?: "en"
        val locale = java.util.Locale.forLanguageTag(tag)
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "correct_tts_${System.currentTimeMillis()}")
    }

    val colors = listOf(
        "Red" to Color(0xFFEF4444),
        "Orange" to Color(0xFFF97316),
        "Yellow" to Color(0xFFEAB308),
        "Green" to Color(0xFF22C55E),
        "Blue" to Color(0xFF3B82F6),
        "Purple" to Color(0xFFA855F7)
    )

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    LaunchedEffect(correctType) {
        if (correctType == "machine_translate") {
            if (viewModel.mtSourceText.isBlank() && viewModel.correctInput.isNotBlank()) {
                viewModel.mtSourceText = viewModel.correctInput
            }
        } else {
            if (viewModel.correctInput.isBlank() && viewModel.mtSourceText.isNotBlank()) {
                viewModel.correctInput = viewModel.mtSourceText
            }
        }
    }

    Column(modifier = modifier.fillMaxSize().padding(horizontal = if (isLandscape) 8.dp else 16.dp, vertical = if (isLandscape) 2.dp else 16.dp)) {
        if (correctType == "machine_translate") {
            NormalTranslatorView(
                viewModel = viewModel,
                profileId = profileId,
                sourceLang = sourceLang,
                targetLang = targetLang,
                mtTier = mtTier,
                onSourceLangChange = {
                    sourceLang = it
                    viewModel.saveProfileSetting(profileId, "CORRECT_SOURCE", it)
                },
                onTargetLangChange = {
                    targetLang = it
                    viewModel.saveProfileSetting(profileId, "CORRECT_TARGET", it)
                },
                onMtTierChange = {
                    mtTier = it
                    viewModel.saveProfileSetting(profileId, "CORRECT_MT_TIER", it.id)
                },
                onSwitchMode = { newType ->
                    correctType = newType
                    viewModel.saveProfileSetting(profileId, "CORRECT_TYPE", newType)
                },
                onDeepenWithLlm = {
                    val textToDeepen = viewModel.mtSourceText.ifBlank { viewModel.correctInput }
                    correctType = "both"
                    viewModel.saveProfileSetting(profileId, "CORRECT_TYPE", "both")
                    viewModel.streamCorrect(textToDeepen, sourceLang, targetLang, profileId, isCorrectionOnly = false)
                },
                onSpeak = { text, lang -> speakText(text, lang) }
            )
        } else {
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
                        IconButton(onClick = { viewModel.clearError("correct") }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Clear, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                val lastAssistantMsg = state.chatMessages.findLast { it.role == "assistant" }
                                Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                viewModel.retryMessage(lastAssistantMsg, false, "correct", state.word)
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
                                viewModel.retryMessage(lastAssistantMsg, true, "correct", state.word)
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
                        viewModel.retryMessage(lastAssistantMsg, false, "correct", state.word)
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
                        viewModel.retryMessage(lastAssistantMsg, true, "correct", state.word)
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

                    IconButton(onClick = { viewModel.deleteCurrentWord("correct") }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                    }
                }

                if (showMoveToModeDialog && state.word != null) {
                    MoveModeDialog(
                        currentMode = "correct",
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
                            viewModel.renameWord(state.word!!, newName, "correct")
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
                                    .clickable { viewModel.updateWordColor(if (word.color == name) "" else name, "correct") }
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
                                    .clickable { viewModel.updateWordStars(if (word.stars == star) 0 else star, "correct") }
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Chat Message List
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
                                    PulsingDots()
                                    Spacer(Modifier.width(8.dp))
                                    Text(if (state.isLoading) "Analyzing & correcting..." else "Generation interrupted", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
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
                                                viewModel.editMessage(msg, editingContent, "correct")
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
                                        if (msg.content.contains("Machine Translation") && !isError) {
                                            Spacer(Modifier.height(8.dp))
                                            FilledTonalButton(
                                                onClick = {
                                                    state.word?.let { w ->
                                                        viewModel.streamCorrect(w.term, sourceLang, targetLang, profileId, isCorrectionOnly = false)
                                                    }
                                                },
                                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                                modifier = Modifier.padding(top = 2.dp)
                                            ) {
                                                Icon(Icons.Default.Autorenew, contentDescription = null, modifier = Modifier.size(14.dp))
                                                Spacer(Modifier.width(6.dp))
                                                Text("✨ Deepen with AI LLM", style = MaterialTheme.typography.labelSmall)
                                            }
                                        }
                                        if (isError) {
                                            Spacer(Modifier.height(8.dp))
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Button(
                                                    onClick = {
                                                        Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                                        viewModel.retryMessage(msg, false, "correct", state.word)
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
                                                        viewModel.retryMessage(msg, true, "correct", state.word)
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
                                    val clip = ClipData.newPlainText("AI Dict", msg.content)
                                    clipboardManager.setPrimaryClip(clip)
                                    Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                                }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.ContentCopy, contentDescription = "Copy", modifier = Modifier.size(16.dp)) }
                                IconButton(onClick = {
                                    editingContent = msg.content
                                    isEditing = true
                                }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier.size(16.dp)) }
                                IconButton(onClick = {
                                    Toast.makeText(context, "Restarting with Current Model...", Toast.LENGTH_SHORT).show()
                                    viewModel.retryMessage(msg, false, "correct", state.word)
                                }, modifier = Modifier.size(32.dp)) {
                                    if (state.isLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                    } else {
                                        Icon(Icons.Default.Refresh, "Regenerate (Current)", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = {
                                    Toast.makeText(context, "Restarting with Fallback Model...", Toast.LENGTH_SHORT).show()
                                    viewModel.retryMessage(msg, true, "correct", state.word)
                                }, modifier = Modifier.size(32.dp)) {
                                    if (state.isLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                                    } else {
                                        Icon(Icons.Default.Autorenew, "Regenerate (Fallback)", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = { viewModel.deleteMessage(msg, "correct") }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp)) }
                            }
                        }
                    }
                }
            }
            if (state.isLoading && state.currentStream.isNotEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.85f)
                            .padding(vertical = 4.dp)
                            .background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    ) {
                        MarkdownText(text = state.currentStream, color = MaterialTheme.colorScheme.onSecondaryContainer, searchQuery = chatSearchQuery)
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
                        PulsingDots()
                        Spacer(Modifier.width(8.dp))
                        Text("Analyzing & correcting...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        val isFollowUp = state.word != null && !state.isLoading
        ChatInputBar(
            availableLanguages = viewModel.orderedLanguages.collectAsState().value,
            inputTerm = viewModel.correctInput,
            onValueChange = { viewModel.correctInput = it },
            onSend = {
                val query = viewModel.correctInput
                if (autoNewSearch || !isFollowUp) {
                    if (correctType == "machine_translate") {
                        viewModel.translateLocalMachine(query, sourceLang, targetLang, profileId, mtTier)
                    } else {
                        val isOnly = correctType == "correction_only"
                        viewModel.streamCorrect(query, sourceLang, targetLang, profileId, isOnly)
                    }
                } else {
                    viewModel.sendFollowUpMessage(query, "correct")
                }
                viewModel.correctInput = ""
            },
            isLoading = state.isLoading,
            autoNewSearch = autoNewSearch,
            onToggleAutoNewSearch = onToggleAutoNewSearch,
            enterToSend = enterToSend,
            isFollowUp = isFollowUp,
            sourceLang = if (!isFollowUp || autoNewSearch) sourceLang else null,
            targetLang = if (!isFollowUp || autoNewSearch) targetLang else null,
            onSourceLangChange = if (!isFollowUp || autoNewSearch) { { sourceLang = it; viewModel.saveProfileSetting(profileId, "CORRECT_SOURCE", it) } } else null,
            onTargetLangChange = if (!isFollowUp || autoNewSearch) { { targetLang = it; viewModel.saveProfileSetting(profileId, "CORRECT_TARGET", it) } } else null,
            extraContent = if (!isFollowUp || autoNewSearch) {
                {
                    CorrectModeSwitchHeader(
                        correctType = correctType,
                        onSelectMode = { newType ->
                            correctType = newType
                            viewModel.saveProfileSetting(profileId, "CORRECT_TYPE", newType)
                        },
                        isLandscape = isLandscape
                    )
                }
            } else null,
            onClear = { viewModel.clearCurrentSearch("correct") },
            suggestions = suggestions,
            onSuggestionClick = { word ->
                viewModel.loadWord(word)
                viewModel.correctInput = ""
                viewModel.clearSuggestions()
            },
            placeholder = if (isFollowUp && !autoNewSearch) "Ask follow-up question..." else if (correctType == "correction_only") "Paste text to correct & polish..." else "Paste text to correct & translate..."
        )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CorrectModeSwitchHeader(
    correctType: String,
    onSelectMode: (String) -> Unit,
    isLandscape: Boolean = false,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = if (isLandscape) 1.dp else 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val isMt = correctType == "machine_translate"

        // Top: Machine Translator Button
        FilterChip(
            selected = isMt,
            onClick = {
                if (!isMt) onSelectMode("machine_translate")
            },
            label = {
                Text(
                    text = "🌐 Machine Translator",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (isMt) FontWeight.Bold else FontWeight.SemiBold
                )
            },
            leadingIcon = {
                Icon(
                    imageVector = if (isMt) Icons.Default.Check else Icons.Default.Translate,
                    contentDescription = null,
                    tint = if (isMt) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(15.dp)
                )
            },
            trailingIcon = if (!isMt) {
                {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(13.dp)
                    )
                }
            } else null,
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f),
                labelColor = MaterialTheme.colorScheme.onSurface
            ),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.padding(bottom = if (isLandscape) 2.dp else 4.dp)
        )

        // Bottom: Correction & Translation | Correction Only
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            val isBoth = correctType == "both"
            FilterChip(
                selected = isBoth,
                onClick = { onSelectMode("both") },
                label = { Text("Correction & Translation", style = MaterialTheme.typography.labelSmall) },
                leadingIcon = if (isBoth) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                } else null,
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                ),
                modifier = Modifier.padding(end = 4.dp)
            )

            val isOnly = correctType == "correction_only"
            FilterChip(
                selected = isOnly,
                onClick = { onSelectMode("correction_only") },
                label = { Text("Correction Only", style = MaterialTheme.typography.labelSmall) },
                leadingIcon = if (isOnly) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                } else null,
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                ),
                modifier = Modifier.padding(start = 2.dp)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NormalTranslatorView(
    viewModel: com.aidict.app.ui.viewmodels.SearchViewModel,
    profileId: Int,
    sourceLang: String,
    targetLang: String,
    mtTier: com.aidict.app.data.LocalTranslationEngine.Tier,
    onSourceLangChange: (String) -> Unit,
    onTargetLangChange: (String) -> Unit,
    onMtTierChange: (com.aidict.app.data.LocalTranslationEngine.Tier) -> Unit,
    onSwitchMode: (String) -> Unit,
    onDeepenWithLlm: () -> Unit,
    onSpeak: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val clipboardManager = remember { context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager }
    val coroutineScope = rememberCoroutineScope()
    var showManageModelsDialog by remember { mutableStateOf(false) }

    val downloadedModelTags by com.aidict.app.data.LocalTranslationEngine.downloadedModelsFlow.collectAsState()
    var isDownloadingInlineTag by remember { mutableStateOf<String?>(null) }

    val supportedLanguages = remember { com.aidict.app.data.LocalTranslationEngine.getSupportedLanguages() }
    val sourceOptions = remember { listOf("Auto Detect") + supportedLanguages }

    LaunchedEffect(Unit) {
        com.aidict.app.data.LocalTranslationEngine.refreshDownloadedModels()
    }

    LaunchedEffect(viewModel.mtSourceText, sourceLang, targetLang, mtTier) {
        kotlinx.coroutines.delay(300)
        viewModel.translateTransient(viewModel.mtSourceText, sourceLang, targetLang, mtTier)
    }

    if (showManageModelsDialog) {
        ManageOfflineModelsDialog(onDismiss = {
            showManageModelsDialog = false
            coroutineScope.launch {
                com.aidict.app.data.LocalTranslationEngine.refreshDownloadedModels()
            }
        })
    }

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    val targetTag = remember(targetLang) { com.aidict.app.data.LocalTranslationEngine.getLanguageTag(targetLang) }
    val isTargetDownloaded = targetTag != null && downloadedModelTags.contains(targetTag)

    val sourceTag = remember(sourceLang) { com.aidict.app.data.LocalTranslationEngine.getLanguageTag(sourceLang) }
    val isSourceDownloaded = sourceLang == "Auto Detect" || (sourceTag != null && downloadedModelTags.contains(sourceTag))

    Column(
        modifier = modifier.fillMaxSize()
    ) {
        // Mode Selector: Machine Translator on top, Correction modes below
        CorrectModeSwitchHeader(
            correctType = "machine_translate",
            onSelectMode = onSwitchMode,
            isLandscape = isLandscape
        )

        Spacer(Modifier.height(if (isLandscape) 2.dp else 6.dp))

        // MT Sub-Row: Tier chips + Manage Offline Models button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            FilterChip(
                selected = mtTier == com.aidict.app.data.LocalTranslationEngine.Tier.NORMAL,
                onClick = { onMtTierChange(com.aidict.app.data.LocalTranslationEngine.Tier.NORMAL) },
                label = { Text("Normal (Offline Opus-MT / ML Kit)", style = MaterialTheme.typography.labelSmall) },
                leadingIcon = if (mtTier == com.aidict.app.data.LocalTranslationEngine.Tier.NORMAL) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                } else null,
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onSecondaryContainer
                ),
                modifier = Modifier.padding(end = 4.dp)
            )
            FilterChip(
                selected = mtTier == com.aidict.app.data.LocalTranslationEngine.Tier.STRONG,
                onClick = { onMtTierChange(com.aidict.app.data.LocalTranslationEngine.Tier.STRONG) },
                label = { Text("Strong (NLLB-200)", style = MaterialTheme.typography.labelSmall) },
                leadingIcon = if (mtTier == com.aidict.app.data.LocalTranslationEngine.Tier.STRONG) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                } else null,
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onSecondaryContainer
                ),
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            AssistChip(
                onClick = { showManageModelsDialog = true },
                label = {
                    Text(
                        text = "📥 ${downloadedModelTags.size} Packs Ready (~${downloadedModelTags.size * 30} MB)",
                        style = MaterialTheme.typography.labelSmall
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = if (downloadedModelTags.isNotEmpty()) Icons.Default.CheckCircle else Icons.Default.CloudDownload,
                        contentDescription = null,
                        tint = if (downloadedModelTags.isNotEmpty()) Color(0xFF10B981) else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(14.dp)
                    )
                },
                modifier = Modifier.padding(start = 4.dp)
            )
        }

        Spacer(Modifier.height(if (isLandscape) 4.dp else 10.dp))

        // Language Selector Bar
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = if (isLandscape) 2.dp else 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Source Language Dropdown
                var srcExpanded by remember { mutableStateOf(false) }
                Box(modifier = Modifier.weight(1f)) {
                    TextButton(
                        onClick = { srcExpanded = true },
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = if (sourceLang == "Auto Detect" && !viewModel.mtDetectedSourceLang.isNullOrBlank()) {
                                    "Auto (${viewModel.mtDetectedSourceLang})"
                                } else {
                                    sourceLang
                                },
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                            Spacer(Modifier.width(4.dp))
                            if (sourceLang != "Auto Detect") {
                                if (isSourceDownloaded) {
                                    Icon(Icons.Default.Check, contentDescription = "Ready", tint = Color(0xFF10B981), modifier = Modifier.size(13.dp))
                                } else {
                                    Icon(Icons.Default.CloudDownload, contentDescription = "Download required", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(13.dp))
                                }
                            }
                            Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(18.dp))
                        }
                    }
                    DropdownMenu(
                        expanded = srcExpanded,
                        onDismissRequest = { srcExpanded = false }
                    ) {
                        sourceOptions.forEach { lang ->
                            val isDownloaded = remember(lang, downloadedModelTags) {
                                if (lang == "Auto Detect") true
                                else {
                                    val tag = com.aidict.app.data.LocalTranslationEngine.getLanguageTag(lang)
                                    tag != null && downloadedModelTags.contains(tag)
                                }
                            }
                            DropdownMenuItem(
                                text = {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(lang, style = MaterialTheme.typography.bodyMedium)
                                        Spacer(Modifier.width(16.dp))
                                        if (lang != "Auto Detect") {
                                            if (isDownloaded) {
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = Color(0xFF10B981).copy(alpha = 0.15f)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Icon(Icons.Default.Check, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(11.dp))
                                                        Spacer(Modifier.width(3.dp))
                                                        Text("Ready", color = Color(0xFF10B981), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                            } else {
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = MaterialTheme.colorScheme.surfaceVariant
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Icon(Icons.Default.CloudDownload, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(11.dp))
                                                        Spacer(Modifier.width(3.dp))
                                                        Text("~30MB", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                onClick = {
                                    onSourceLangChange(lang)
                                    srcExpanded = false
                                }
                            )
                        }
                    }
                }

                // Swap Button
                IconButton(
                    onClick = {
                        if (sourceLang != "Auto Detect") {
                            val temp = sourceLang
                            onSourceLangChange(targetLang)
                            onTargetLangChange(temp)
                        } else if (!viewModel.mtDetectedSourceLang.isNullOrBlank()) {
                            val detected = viewModel.mtDetectedSourceLang!!
                            onSourceLangChange(targetLang)
                            onTargetLangChange(detected)
                        }
                    },
                    modifier = Modifier.size(if (isLandscape) 30.dp else 36.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.CompareArrows,
                        contentDescription = "Swap Languages",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(if (isLandscape) 18.dp else 20.dp)
                    )
                }

                // Target Language Dropdown
                var tgtExpanded by remember { mutableStateOf(false) }
                Box(modifier = Modifier.weight(1f)) {
                    TextButton(
                        onClick = { tgtExpanded = true },
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = targetLang,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                            Spacer(Modifier.width(4.dp))
                            if (isTargetDownloaded) {
                                Icon(Icons.Default.Check, contentDescription = "Ready", tint = Color(0xFF10B981), modifier = Modifier.size(13.dp))
                            } else {
                                Icon(Icons.Default.CloudDownload, contentDescription = "Download required", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(13.dp))
                            }
                            Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(18.dp))
                        }
                    }
                    DropdownMenu(
                        expanded = tgtExpanded,
                        onDismissRequest = { tgtExpanded = false }
                    ) {
                        supportedLanguages.forEach { lang ->
                            val isDownloaded = remember(lang, downloadedModelTags) {
                                val tag = com.aidict.app.data.LocalTranslationEngine.getLanguageTag(lang)
                                tag != null && downloadedModelTags.contains(tag)
                            }
                            DropdownMenuItem(
                                text = {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(lang, style = MaterialTheme.typography.bodyMedium)
                                        Spacer(Modifier.width(16.dp))
                                        if (isDownloaded) {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = Color(0xFF10B981).copy(alpha = 0.15f)
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Icon(Icons.Default.Check, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(11.dp))
                                                    Spacer(Modifier.width(3.dp))
                                                    Text("Ready", color = Color(0xFF10B981), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        } else {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = MaterialTheme.colorScheme.surfaceVariant
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Icon(Icons.Default.CloudDownload, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(11.dp))
                                                    Spacer(Modifier.width(3.dp))
                                                    Text("~30MB", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                                                }
                                            }
                                        }
                                    }
                                },
                                onClick = {
                                    onTargetLangChange(lang)
                                    tgtExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        }

        // Inline Model Download Banner if language pack is needed
        if (!isTargetDownloaded || !isSourceDownloaded) {
            val missingLangName = if (!isTargetDownloaded) targetLang else sourceLang
            val missingTag = com.aidict.app.data.LocalTranslationEngine.getLanguageTag(missingLangName) ?: ""
            val isDownloadingThis = isDownloadingInlineTag == missingTag

            Spacer(Modifier.height(8.dp))
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.25f)),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CloudDownload,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Offline Model Pack Needed",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Download $missingLangName pack (~30MB) for instant offline translation.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            if (missingTag.isNotBlank() && !isDownloadingThis) {
                                isDownloadingInlineTag = missingTag
                                coroutineScope.launch {
                                    val success = com.aidict.app.data.LocalTranslationEngine.downloadModel(missingTag)
                                    isDownloadingInlineTag = null
                                    if (success) {
                                        Toast.makeText(context, "$missingLangName model installed!", Toast.LENGTH_SHORT).show()
                                        viewModel.translateTransient(viewModel.mtSourceText, sourceLang, targetLang, mtTier)
                                    } else {
                                        Toast.makeText(context, "Failed to download $missingLangName model. Check connection.", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                        },
                        enabled = !isDownloadingThis,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        if (isDownloadingThis) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(6.dp))
                            Text("Downloading...", style = MaterialTheme.typography.labelSmall)
                        } else {
                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Download", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(if (isLandscape) 4.dp else 12.dp))

        if (isLandscape) {
            // Side-by-side row in landscape
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MtSourceInputCard(
                    text = viewModel.mtSourceText,
                    onTextChange = { viewModel.mtSourceText = it },
                    detectedLang = viewModel.mtDetectedSourceLang,
                    sourceLang = sourceLang,
                    onSpeak = onSpeak,
                    onTranslate = { viewModel.translateTransient(viewModel.mtSourceText, sourceLang, targetLang, mtTier) },
                    clipboardManager = clipboardManager,
                    isLandscape = true,
                    modifier = Modifier.weight(1f).fillMaxHeight()
                )

                MtTargetTranslationCard(
                    isLoading = viewModel.mtIsLoading,
                    isDownloadingModel = viewModel.mtIsDownloadingModel,
                    errorMessage = viewModel.mtErrorMessage,
                    translatedText = viewModel.mtTranslatedText,
                    isSaved = viewModel.mtIsSaved,
                    targetLang = targetLang,
                    isTargetDownloaded = isTargetDownloaded,
                    onRetry = { viewModel.translateTransient(viewModel.mtSourceText, sourceLang, targetLang, mtTier) },
                    onSpeak = onSpeak,
                    onSaveToHistory = {
                        viewModel.saveCurrentMtToHistory(sourceLang, targetLang, profileId, mtTier) {
                            Toast.makeText(context, "Saved to History!", Toast.LENGTH_SHORT).show()
                        }
                    },
                    onDeepenWithLlm = onDeepenWithLlm,
                    clipboardManager = clipboardManager,
                    context = context,
                    isLandscape = true,
                    modifier = Modifier.weight(1f).fillMaxHeight()
                )
            }
        } else {
            // Vertical scroll in portrait
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
            ) {
                MtSourceInputCard(
                    text = viewModel.mtSourceText,
                    onTextChange = { viewModel.mtSourceText = it },
                    detectedLang = viewModel.mtDetectedSourceLang,
                    sourceLang = sourceLang,
                    onSpeak = onSpeak,
                    onTranslate = { viewModel.translateTransient(viewModel.mtSourceText, sourceLang, targetLang, mtTier) },
                    clipboardManager = clipboardManager,
                    isLandscape = false,
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )

                Spacer(Modifier.height(14.dp))

                MtTargetTranslationCard(
                    isLoading = viewModel.mtIsLoading,
                    isDownloadingModel = viewModel.mtIsDownloadingModel,
                    errorMessage = viewModel.mtErrorMessage,
                    translatedText = viewModel.mtTranslatedText,
                    isSaved = viewModel.mtIsSaved,
                    targetLang = targetLang,
                    isTargetDownloaded = isTargetDownloaded,
                    onRetry = { viewModel.translateTransient(viewModel.mtSourceText, sourceLang, targetLang, mtTier) },
                    onSpeak = onSpeak,
                    onSaveToHistory = {
                        viewModel.saveCurrentMtToHistory(sourceLang, targetLang, profileId, mtTier) {
                            Toast.makeText(context, "Saved to History!", Toast.LENGTH_SHORT).show()
                        }
                    },
                    onDeepenWithLlm = onDeepenWithLlm,
                    clipboardManager = clipboardManager,
                    context = context,
                    isLandscape = false,
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )
            }
        }
    }
}

@Composable
private fun MtSourceInputCard(
    text: String,
    onTextChange: (String) -> Unit,
    detectedLang: String?,
    sourceLang: String,
    onSpeak: (String, String) -> Unit,
    onTranslate: () -> Unit,
    clipboardManager: ClipboardManager,
    isLandscape: Boolean = false,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        modifier = modifier
    ) {
        Column(
            modifier = if (isLandscape) Modifier.fillMaxSize().padding(12.dp)
                       else Modifier.fillMaxWidth().padding(12.dp)
        ) {
            // Header Row of Input Card
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Source Text",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (sourceLang == "Auto Detect" && !detectedLang.isNullOrBlank()) {
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f)
                    ) {
                        Text(
                            text = "Detected: $detectedLang",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            // Input Field
            OutlinedTextField(
                value = text,
                onValueChange = onTextChange,
                placeholder = {
                    Text(
                        "Enter or paste text to translate...",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                },
                textStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp),
                modifier = if (isLandscape) Modifier.fillMaxWidth().weight(1f)
                           else Modifier.fillMaxWidth().heightIn(min = 100.dp, max = 220.dp),
                minLines = 3,
                maxLines = if (isLandscape) 12 else 8,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent
                )
            )

            if (isLandscape) {
                Spacer(Modifier.weight(1f, fill = false))
            } else {
                Spacer(Modifier.height(8.dp))
            }

            // Action Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${text.length} characters",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )

                Spacer(Modifier.weight(1f))

                if (text.isNotBlank()) {
                    IconButton(onClick = { onTextChange("") }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(18.dp))
                    }
                } else {
                    IconButton(
                        onClick = {
                            val clip = clipboardManager.primaryClip?.getItemAt(0)?.text?.toString() ?: ""
                            if (clip.isNotBlank()) {
                                onTextChange(clip)
                            }
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.ContentPaste, contentDescription = "Paste", modifier = Modifier.size(18.dp))
                    }
                }

                if (text.isNotBlank()) {
                    IconButton(
                        onClick = { onSpeak(text, detectedLang ?: sourceLang) },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.VolumeUp, contentDescription = "Listen", modifier = Modifier.size(18.dp))
                    }
                }

                Spacer(Modifier.width(6.dp))

                Button(
                    onClick = onTranslate,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.height(34.dp)
                ) {
                    Icon(Icons.Default.Translate, contentDescription = null, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Translate", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun MtTargetTranslationCard(
    isLoading: Boolean,
    isDownloadingModel: Boolean,
    errorMessage: String?,
    translatedText: String,
    isSaved: Boolean,
    targetLang: String,
    isTargetDownloaded: Boolean,
    onRetry: () -> Unit,
    onSpeak: (String, String) -> Unit,
    onSaveToHistory: () -> Unit,
    onDeepenWithLlm: () -> Unit,
    clipboardManager: ClipboardManager,
    context: Context,
    isLandscape: Boolean = false,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        modifier = modifier
    ) {
        Column(
            modifier = if (isLandscape) Modifier.fillMaxSize().padding(14.dp)
                       else Modifier.fillMaxWidth().padding(14.dp)
        ) {
            // Header Row of Result Card
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Translate,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Translation ($targetLang)",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )

                Spacer(Modifier.weight(1f))

                if (isTargetDownloaded) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFF10B981).copy(alpha = 0.15f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("OFFLINE READY", color = Color(0xFF10B981), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                } else {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.CloudDownload, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("PACK NEEDED", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Output Body: scrollable in landscape, wrapped in portrait
            val contentModifier = if (isLandscape) {
                Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())
            } else {
                Modifier.fillMaxWidth()
            }

            Box(modifier = contentModifier) {
                if (isLoading) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = if (isDownloadingModel) "Downloading offline language pack (~30MB)..." else "Translating with local model...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                } else if (!errorMessage.isNullOrBlank()) {
                    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        Text(
                            text = errorMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(Modifier.height(8.dp))
                        TextButton(
                            onClick = onRetry,
                            modifier = Modifier.align(Alignment.End)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Retry")
                        }
                    }
                } else if (translatedText.isNotBlank()) {
                    SelectionContainer {
                        Text(
                            text = translatedText,
                            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp, lineHeight = 26.sp),
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Translate,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.4f),
                            modifier = Modifier.size(32.dp)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Translation will appear here instantaneously...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.75f)
                        )
                    }
                }
            }

            if (translatedText.isNotBlank() && !isLoading) {
                Spacer(Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Speaker pronunciation button
                    IconButton(
                        onClick = { onSpeak(translatedText, targetLang) },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.VolumeUp,
                            contentDescription = "Listen translation",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Copy button
                    IconButton(
                        onClick = {
                            val clip = ClipData.newPlainText("Translation", translatedText)
                            clipboardManager.setPrimaryClip(clip)
                            Toast.makeText(context, "Translation copied to clipboard", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.Default.ContentCopy,
                            contentDescription = "Copy translation",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Save to History button
                    IconButton(
                        onClick = onSaveToHistory,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = if (isSaved) Icons.Default.Bookmark else Icons.Outlined.BookmarkBorder,
                            contentDescription = "Save to History",
                            tint = if (isSaved) Color(0xFF10B981) else MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    Spacer(Modifier.weight(1f))

                    // Deepen with AI LLM Button
                    FilledTonalButton(
                        onClick = onDeepenWithLlm,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("✨ Deepen with AI LLM", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
