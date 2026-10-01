package com.aidict.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.speech.tts.TextToSpeech
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidict.app.data.LocalTranslationEngine
import com.aidict.app.ui.components.MarkdownText
import com.aidict.app.ui.components.SmallLanguageSelector
import com.aidict.app.ui.viewmodels.SearchViewModel
import com.aidict.app.utils.DefaultPrompts
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickLlmScreen(
    viewModel: SearchViewModel,
    profileId: Int,
    enterToSend: Boolean = false,
    onMoveToMode: (com.aidict.app.data.entities.Word, String) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    val state by viewModel.quickLlmState.collectAsState()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val clipboardManager = remember { context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager }

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    var lenses by remember { mutableStateOf(DefaultPrompts.QUICK_LLM_PRESETS.values.toList()) }
    var selectedLensKey by remember { mutableStateOf("quick_glance") }

    var sourceLang by remember { mutableStateOf("Auto Detect") }
    var targetLang by remember { mutableStateOf("English") }

    var followUpInput by remember { mutableStateOf("") }
    var configuredModel by remember { mutableStateOf("inclusionai/ling-3.0-flash") }
    var modelInput by remember { mutableStateOf("inclusionai/ling-3.0-flash") }
    var showConfigDrawer by remember { mutableStateOf(false) }
    var showEditPromptDialog by remember { mutableStateOf(false) }
    var showAddLensDialog by remember { mutableStateOf(false) }
    var showDeleteConfirmDialog by remember { mutableStateOf(false) }
    var showMoveToModeDialog by remember { mutableStateOf(false) }

    // TTS Setup
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
        val tag = LocalTranslationEngine.getLanguageTag(langName) ?: "en"
        val locale = Locale.forLanguageTag(tag)
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "quick_llm_tts_${System.currentTimeMillis()}")
    }

    // Load initial defaults from profile
    LaunchedEffect(profileId) {
        val loadedLenses = viewModel.getQuickLenses(profileId)
        if (loadedLenses.isNotEmpty()) {
            lenses = loadedLenses
        }
        val defaultLens = viewModel.getProfileSetting(profileId, "SIMPLE_LLM_DEFAULT_PROMPT") ?: "quick_glance"
        selectedLensKey = defaultLens
        val loadedModel = viewModel.getProfileSetting(profileId, "SIMPLE_LLM_MODEL") ?: "inclusionai/ling-3.0-flash"
        configuredModel = loadedModel
        modelInput = loadedModel
        sourceLang = viewModel.getProfileSetting(profileId, "SEARCH_SOURCE") ?: "Auto Detect"
        targetLang = viewModel.getProfileSetting(profileId, "SEARCH_TARGET") ?: "English"
    }

    val currentLens = lenses.find { it.id == selectedLensKey } ?: lenses.firstOrNull() ?: DefaultPrompts.QUICK_LLM_PRESETS.values.first()

    fun triggerQuickLookup(lensToUse: String = selectedLensKey) {
        val query = viewModel.quickLlmInput.trim()
        if (query.isBlank()) return
        viewModel.streamQuickLlm(
            text = query,
            source = sourceLang,
            target = targetLang,
            lensKey = lensToUse,
            profileId = profileId
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = if (isLandscape) 8.dp else 16.dp, vertical = if (isLandscape) 4.dp else 8.dp)
    ) {
        // Error Banner
        state.error?.let { errorText ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 6.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Warning, contentDescription = "Error", tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = errorText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = { viewModel.clearError("quick_llm") }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Clear, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
            }
        }

        // Hero Header Badge & Lens Selector Bar
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFF59E0B).copy(alpha = 0.2f),
                            modifier = Modifier.size(26.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Bolt,
                                    contentDescription = "Quick LLM",
                                    tint = Color(0xFFF59E0B),
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Quick LLM",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(6.dp))
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Color(0xFFF59E0B).copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = "Ling Flash",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFD97706),
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Set Default Lens Button
                        TextButton(
                            onClick = {
                                viewModel.saveProfileSetting(profileId, "SIMPLE_LLM_DEFAULT_PROMPT", currentLens.id)
                                Toast.makeText(context, "★ Saved ${currentLens.name} as default lens", Toast.LENGTH_SHORT).show()
                            },
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp)
                        ) {
                            Icon(Icons.Default.Star, contentDescription = "Set Default", modifier = Modifier.size(14.dp), tint = Color(0xFFF59E0B))
                            Spacer(Modifier.width(4.dp))
                            Text("Set Default", style = MaterialTheme.typography.labelSmall, color = Color(0xFFF59E0B))
                        }

                        // Config Button
                        IconButton(
                            onClick = { showConfigDrawer = !showConfigDrawer },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Default.Tune,
                                contentDescription = "Config Quick LLM",
                                tint = if (showConfigDrawer) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }

                // Expandable Config Drawer
                if (showConfigDrawer) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
                    ) {
                        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            // Model Identifier Section
                            Text("Model Configuration", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                OutlinedTextField(
                                    value = modelInput,
                                    onValueChange = { modelInput = it },
                                    singleLine = true,
                                    label = { Text("Model Identifier") },
                                    modifier = Modifier.weight(1f),
                                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp)
                                )
                                Button(
                                    onClick = {
                                        coroutineScope.launch {
                                            viewModel.saveQuickLlmModel(modelInput, profileId)
                                            configuredModel = modelInput
                                            Toast.makeText(context, "✓ Saved model $modelInput", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                ) {
                                    Text("Save", style = MaterialTheme.typography.labelSmall)
                                }
                                OutlinedButton(
                                    onClick = {
                                        modelInput = "inclusionai/ling-3.0-flash"
                                        coroutineScope.launch {
                                            viewModel.saveQuickLlmModel("inclusionai/ling-3.0-flash", profileId)
                                            configuredModel = "inclusionai/ling-3.0-flash"
                                            Toast.makeText(context, "Reset model to default", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Text("Reset", style = MaterialTheme.typography.labelSmall)
                                }
                            }

                            // Quick Model Recommendation Chips
                            Row(
                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(
                                    "⚡ Ling Flash" to "inclusionai/ling-3.0-flash",
                                    "🔍 DeepSeek Flash" to "deepseek/deepseek-v4-flash-0731",
                                    "♊ Gemini 2.5 Flash" to "google/gemini-2.5-flash"
                                ).forEach { (label, modelKey) ->
                                    FilterChip(
                                        selected = modelInput == modelKey,
                                        onClick = { modelInput = modelKey },
                                        label = { Text(label, style = MaterialTheme.typography.labelSmall) }
                                    )
                                }
                            }

                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                            // Lens Management Actions
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        showEditPromptDialog = true
                                    },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Icon(Icons.Default.Edit, contentDescription = "Edit Prompt", modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Edit ${currentLens.name} Prompt", style = MaterialTheme.typography.labelSmall)
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Button(
                                            onClick = { showAddLensDialog = true },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Default.Add, contentDescription = "Add Lens", modifier = Modifier.size(14.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Add Lens", style = MaterialTheme.typography.labelSmall)
                                        }

                                        OutlinedButton(
                                            onClick = { showDeleteConfirmDialog = true },
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Default.DeleteOutline, contentDescription = "Remove Lens", modifier = Modifier.size(14.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Remove Lens", style = MaterialTheme.typography.labelSmall)
                                        }
                                    }

                                    TextButton(
                                        onClick = {
                                            coroutineScope.launch {
                                                viewModel.resetAllLenses(profileId)
                                                val updated = viewModel.getQuickLenses(profileId)
                                                lenses = updated
                                                selectedLensKey = updated.firstOrNull()?.id ?: "quick_glance"
                                                Toast.makeText(context, "Restored all default lenses", Toast.LENGTH_SHORT).show()
                                            }
                                        },
                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                                    ) {
                                        Icon(Icons.Default.Restore, contentDescription = "Restore Defaults", modifier = Modifier.size(14.dp))
                                        Spacer(Modifier.width(2.dp))
                                        Text("Restore Defaults", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(6.dp))

                // Horizontally Scrollable Analytical Lenses Chips
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    lenses.forEach { lens ->
                        val isSelected = lens.id == selectedLensKey
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) Color(0xFFF59E0B).copy(alpha = 0.22f) else MaterialTheme.colorScheme.surface,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isSelected) Color(0xFFF59E0B).copy(alpha = 0.7f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                            ),
                            modifier = Modifier.clickable {
                                selectedLensKey = lens.id
                                if (viewModel.quickLlmInput.isNotBlank()) {
                                    triggerQuickLookup(lens.id)
                                }
                            }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(lens.icon, style = MaterialTheme.typography.bodyMedium)
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = lens.name.replace(lens.icon, "").trim(),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isSelected) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }

                    // Add Lens Pill Chip
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
                        ),
                        modifier = Modifier.clickable { showAddLensDialog = true }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Add Lens", modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(3.dp))
                            Text(
                                text = "Add Lens",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }

                Spacer(Modifier.height(4.dp))

                // Lens Subtitle Description + Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${currentLens.icon} ${currentLens.name} • ${currentLens.description}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = { showEditPromptDialog = true },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                Icons.Default.Edit,
                                contentDescription = "Edit Prompt",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                        IconButton(
                            onClick = { showAddLensDialog = true },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                Icons.Default.Add,
                                contentDescription = "Add Lens",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(15.dp)
                            )
                        }
                        IconButton(
                            onClick = { showDeleteConfirmDialog = true },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                Icons.Default.DeleteOutline,
                                contentDescription = "Remove Lens",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(15.dp)
                            )
                        }
                    }
                }
            }
        }

        // Language Selector Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 2.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            val orderedLangs = viewModel.orderedLanguages.collectAsState().value
            SmallLanguageSelector(
                availableLanguages = orderedLangs,
                currentValue = sourceLang,
                onSelected = { sourceLang = it }
            )
            IconButton(
                onClick = {
                    val temp = sourceLang
                    sourceLang = targetLang
                    targetLang = temp
                },
                modifier = Modifier.size(28.dp).padding(horizontal = 2.dp)
            ) {
                Icon(Icons.Default.SwapHoriz, contentDescription = "Swap Languages", modifier = Modifier.size(16.dp))
            }
            SmallLanguageSelector(
                availableLanguages = orderedLangs,
                currentValue = targetLang,
                onSelected = { targetLang = it }
            )
        }

        // Input Card
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextField(
                    value = viewModel.quickLlmInput,
                    onValueChange = { viewModel.quickLlmInput = it },
                    placeholder = { Text("Word, phrase, or sentence to analyze...", style = MaterialTheme.typography.bodyMedium) },
                    modifier = Modifier.weight(1f),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        disabledContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    singleLine = false,
                    maxLines = 3,
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                        onDone = { if (enterToSend) triggerQuickLookup() }
                    )
                )

                if (viewModel.quickLlmInput.isNotBlank()) {
                    IconButton(
                        onClick = { viewModel.quickLlmInput = "" },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(18.dp))
                    }
                } else {
                    IconButton(
                        onClick = {
                            val clip = clipboardManager.primaryClip
                            if (clip != null && clip.itemCount > 0) {
                                val pasted = clip.getItemAt(0).text?.toString() ?: ""
                                if (pasted.isNotBlank()) {
                                    viewModel.quickLlmInput = pasted
                                    triggerQuickLookup()
                                }
                            }
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.ContentPaste, contentDescription = "Paste", modifier = Modifier.size(18.dp))
                    }
                }

                IconButton(
                    onClick = { triggerQuickLookup() },
                    enabled = !state.isLoading && viewModel.quickLlmInput.isNotBlank(),
                    modifier = Modifier.size(36.dp)
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Analyze", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }

        // Result and Follow-Up Content Area
        val activeAssistantContent = state.chatMessages.findLast { it.role == "assistant" }?.content
            ?.takeIf { it.isNotBlank() }
            ?: state.currentStream

        if (state.isLoading && activeAssistantContent.isBlank()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFFF59E0B))
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Analyzing via ${currentLens.name}...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else if (activeAssistantContent.isNotBlank()) {
            val listState = rememberLazyListState()

            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    // Result Header Card with Ephemeral tag, Bookmark, Copy, TTS
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "${currentLens.icon} ${currentLens.name}",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFD97706)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = if (state.word != null) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                                    ) {
                                        Text(
                                            text = if (state.word != null) "Saved to Dictionary" else "Zero-Save Ephemeral",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (state.word != null) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    // Bookmark / Save Button
                                    IconButton(
                                        onClick = {
                                            val queryTerm = viewModel.quickLlmInput.ifBlank {
                                                state.chatMessages.firstOrNull { it.role == "user" }?.content ?: "Quick Note"
                                            }
                                            viewModel.saveQuickLlmToWord(
                                                text = queryTerm,
                                                content = activeAssistantContent,
                                                lensKey = selectedLensKey,
                                                sourceLang = sourceLang,
                                                targetLang = targetLang,
                                                profileId = profileId
                                            ) {
                                                Toast.makeText(context, "✓ Saved to Dictionary!", Toast.LENGTH_SHORT).show()
                                            }
                                        },
                                        modifier = Modifier.size(30.dp)
                                    ) {
                                        Icon(
                                            if (state.word != null) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                                            contentDescription = "Save to Words",
                                            tint = if (state.word != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }

                                    // TTS Button
                                    IconButton(
                                        onClick = { speakText(activeAssistantContent, targetLang) },
                                        modifier = Modifier.size(30.dp)
                                    ) {
                                        Icon(
                                            Icons.AutoMirrored.Filled.VolumeUp,
                                            contentDescription = "Listen",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }

                                    // Copy Button
                                    IconButton(
                                        onClick = {
                                            clipboardManager.setPrimaryClip(ClipData.newPlainText("Quick LLM Analysis", activeAssistantContent))
                                            Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                                        },
                                        modifier = Modifier.size(30.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.ContentCopy,
                                            contentDescription = "Copy",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }

                                    // Move Mode Button (when saved)
                                    if (state.word != null) {
                                        IconButton(
                                            onClick = { showMoveToModeDialog = true },
                                            modifier = Modifier.size(30.dp)
                                        ) {
                                            Icon(
                                                Icons.AutoMirrored.Filled.CompareArrows,
                                                contentDescription = "Move Mode & Regenerate",
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                            // Rendered Markdown Content
                            MarkdownText(
                                text = activeAssistantContent,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }

                // Render follow-up conversation turns (if any)
                val followUpMessages = state.chatMessages.drop(2)
                if (followUpMessages.isNotEmpty()) {
                    items(followUpMessages) { msg ->
                        val isUser = msg.role == "user"
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                modifier = Modifier.widthIn(max = 320.dp)
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    if (isUser) {
                                        Text(text = msg.content, style = MaterialTheme.typography.bodyMedium)
                                    } else {
                                        MarkdownText(
                                            text = msg.content,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Follow-up question input bar
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = followUpInput,
                        onValueChange = { followUpInput = it },
                        placeholder = { Text("Ask follow-up about this...", style = MaterialTheme.typography.bodySmall) },
                        modifier = Modifier.weight(1f),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            disabledContainerColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        singleLine = true,
                        keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                            onDone = {
                                if (followUpInput.isNotBlank()) {
                                    val q = followUpInput.trim()
                                    followUpInput = ""
                                    viewModel.sendQuickLlmFollowUp(q, sourceLang, targetLang, selectedLensKey, profileId)
                                }
                            }
                        )
                    )

                    IconButton(
                        onClick = {
                            if (followUpInput.isNotBlank()) {
                                val q = followUpInput.trim()
                                followUpInput = ""
                                viewModel.sendQuickLlmFollowUp(q, sourceLang, targetLang, selectedLensKey, profileId)
                            }
                        },
                        enabled = followUpInput.isNotBlank(),
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send Follow-up", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    }
                }
            }
        } else {
            // Empty State View
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFF59E0B).copy(alpha = 0.12f),
                        modifier = Modifier.size(64.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(currentLens.icon, fontSize = 28.sp)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = currentLens.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = currentLens.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Enter text above or tap a lens to get instant rapid-glance analysis. Results are ephemeral and won't pollute your history unless bookmarked.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Edit Active Lens Prompt Dialog
        if (showEditPromptDialog) {
            var editPromptText by remember(currentLens.id) { mutableStateOf(currentLens.prompt) }
            AlertDialog(
                onDismissRequest = { showEditPromptDialog = false },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(currentLens.icon, fontSize = 20.sp)
                        Spacer(Modifier.width(8.dp))
                        Text("Edit ${currentLens.name} Prompt", style = MaterialTheme.typography.titleMedium)
                    }
                },
                text = {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "Customize the system prompt instructions sent to the AI for this lens:",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = editPromptText,
                            onValueChange = { editPromptText = it },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp, max = 320.dp),
                            textStyle = androidx.compose.ui.text.TextStyle(
                                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                                fontSize = 12.sp
                            )
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                viewModel.saveLensPrompt(currentLens.id, editPromptText, profileId)
                                val updated = viewModel.getQuickLenses(profileId)
                                lenses = updated
                                Toast.makeText(context, "✓ Saved prompt for ${currentLens.name}", Toast.LENGTH_SHORT).show()
                                showEditPromptDialog = false
                            }
                        }
                    ) {
                        Text("Save Prompt")
                    }
                },
                dismissButton = {
                    Row {
                        TextButton(
                            onClick = {
                                coroutineScope.launch {
                                    viewModel.resetLensPrompt(currentLens.id, profileId)
                                    val updated = viewModel.getQuickLenses(profileId)
                                    lenses = updated
                                    editPromptText = updated.find { it.id == currentLens.id }?.prompt ?: ""
                                    Toast.makeText(context, "Reset to factory default", Toast.LENGTH_SHORT).show()
                                }
                            }
                        ) {
                            Text("Reset")
                        }
                        Spacer(Modifier.width(4.dp))
                        TextButton(onClick = { showEditPromptDialog = false }) {
                            Text("Cancel")
                        }
                    }
                }
            )
        }

        // Add Custom Lens Dialog
        if (showAddLensDialog) {
            var newLensName by remember { mutableStateOf("") }
            var newLensIcon by remember { mutableStateOf("💡") }
            var newLensDesc by remember { mutableStateOf("") }
            var newLensPrompt by remember { mutableStateOf(DefaultPrompts.DEFAULT_SIMPLE_LLM_PROMPT) }

            AlertDialog(
                onDismissRequest = { showAddLensDialog = false },
                title = { Text("Add Custom Analytical Lens", style = MaterialTheme.typography.titleMedium) },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = newLensIcon,
                                onValueChange = { newLensIcon = it },
                                label = { Text("Icon") },
                                modifier = Modifier.width(70.dp),
                                singleLine = true
                            )
                            OutlinedTextField(
                                value = newLensName,
                                onValueChange = { newLensName = it },
                                label = { Text("Lens Name") },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                        }
                        OutlinedTextField(
                            value = newLensDesc,
                            onValueChange = { newLensDesc = it },
                            label = { Text("Short Description") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = newLensPrompt,
                            onValueChange = { newLensPrompt = it },
                            label = { Text("System Prompt") },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp, max = 240.dp),
                            textStyle = androidx.compose.ui.text.TextStyle(
                                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                                fontSize = 12.sp
                            )
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val cleanName = newLensName.trim()
                            if (cleanName.isBlank()) {
                                Toast.makeText(context, "Please enter a lens name", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            coroutineScope.launch {
                                val newId = "custom_${System.currentTimeMillis()}"
                                val newLens = com.aidict.app.utils.QuickLlmLens(
                                    id = newId,
                                    name = cleanName,
                                    icon = newLensIcon.trim().ifBlank { "💡" },
                                    description = newLensDesc.trim(),
                                    prompt = newLensPrompt.trim().ifBlank { DefaultPrompts.DEFAULT_SIMPLE_LLM_PROMPT }
                                )
                                viewModel.saveCustomLens(newLens, profileId)
                                val updated = viewModel.getQuickLenses(profileId)
                                lenses = updated
                                selectedLensKey = newId
                                Toast.makeText(context, "✓ Created lens $cleanName", Toast.LENGTH_SHORT).show()
                                showAddLensDialog = false
                            }
                        }
                    ) {
                        Text("Add Lens")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showAddLensDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        if (showDeleteConfirmDialog) {
            AlertDialog(
                onDismissRequest = { showDeleteConfirmDialog = false },
                title = { Text("Remove Lens") },
                text = {
                    Text(
                        "Are you sure you want to remove \"${currentLens.icon} ${currentLens.name}\"?\n\nYou can add custom lenses again at any time or restore built-in presets using \"Restore Defaults\"."
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                viewModel.deleteLens(currentLens.id, profileId)
                                val updated = viewModel.getQuickLenses(profileId)
                                lenses = updated
                                selectedLensKey = updated.firstOrNull()?.id ?: "quick_glance"
                                showDeleteConfirmDialog = false
                                Toast.makeText(context, "✓ Removed lens ${currentLens.name}", Toast.LENGTH_SHORT).show()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("Remove")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteConfirmDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        if (showMoveToModeDialog && state.word != null) {
            com.aidict.app.ui.components.MoveModeDialog(
                currentMode = "quick_llm",
                onDismiss = { showMoveToModeDialog = false },
                onSelectMode = { targetMode ->
                    showMoveToModeDialog = false
                    onMoveToMode(state.word!!, targetMode)
                }
            )
        }
    }
}
