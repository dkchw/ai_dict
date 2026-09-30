package com.aidict.app.ui.components
import androidx.compose.animation.core.*

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Edit
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.combinedClickable


import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.runtime.*
import androidx.compose.foundation.lazy.items
import coil.compose.AsyncImage
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchableDropdown(
    label: String,
    currentValue: String,
    options: List<String>,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    var searchText by remember { mutableStateOf(currentValue) }

    LaunchedEffect(currentValue) {
        if (currentValue != searchText) searchText = currentValue
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = searchText,
            onValueChange = { 
                searchText = it 
                expanded = true
                onSelected(it)
            },
            label = { Text(label) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
            singleLine = true
        )
        if (options.isNotEmpty()) {
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                val filtered = options.filter { it.contains(searchText, ignoreCase = true) }.take(50)
                filtered.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option) },
                        onClick = {
                            searchText = option
                            onSelected(option)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}


val LANGUAGE_CODES = mapOf(
    "Auto Detect" to "🤖 Auto",
    "English" to "🇬🇧 EN",
    "Vietnamese" to "🇻🇳 VI",
    "French" to "🇫🇷 FR",
    "Spanish" to "🇪🇸 ES",
    "German" to "🇩🇪 DE",
    "Japanese" to "🇯🇵 JA",
    "Chinese" to "🇨🇳 ZH",
    "Korean" to "🇰🇷 KO",
    "Russian" to "🇷🇺 RU",
    "Italian" to "🇮🇹 IT",
    "Portuguese" to "🇵🇹 PT",
    "Dutch" to "🇳🇱 NL",
    "Arabic" to "🇸🇦 AR"
)

@Composable
fun SmallLanguageSelector(
    availableLanguages: List<String>,

    currentValue: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = modifier) {
        TextButton(
            onClick = { expanded = true },
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
        ) {
            val display = com.aidict.app.utils.LanguageManager.getDisplayFlag(currentValue)
            Text(display, style = MaterialTheme.typography.labelLarge)
            Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(16.dp))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            availableLanguages.forEach { lang ->
                DropdownMenuItem(
                    text = { Text("${com.aidict.app.utils.LanguageManager.getDisplayFlag(lang)} $lang") },
                    onClick = {
                        onSelected(lang)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
fun ChatInputBar(
    availableLanguages: List<String> = com.aidict.app.utils.LanguageManager.defaultLanguages,
    inputTerm: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    isLoading: Boolean,
    placeholder: String,
    isFollowUp: Boolean = false,
    sourceLang: String? = null,
    targetLang: String? = null,
    onSourceLangChange: ((String) -> Unit)? = null,
    onTargetLangChange: ((String) -> Unit)? = null,
    onClear: (() -> Unit)? = null,
    autoNewSearch: Boolean = false,
    onToggleAutoNewSearch: (() -> Unit)? = null,
    enterToSend: Boolean = false,
    suggestions: List<com.aidict.app.data.entities.Word> = emptyList(),
    onSuggestionClick: ((com.aidict.app.data.entities.Word) -> Unit)? = null,
    extraContent: @Composable (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE

    Surface(
        shape = RoundedCornerShape(if (isLandscape) 16.dp else 24.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        tonalElevation = 2.dp,
        modifier = modifier.fillMaxWidth().padding(top = if (isLandscape) 2.dp else 8.dp, bottom = if (isLandscape) 2.dp else 8.dp)
    ) {
        Column(modifier = Modifier.padding(start = 8.dp, end = 8.dp, top = if (isLandscape) 2.dp else 4.dp, bottom = if (isLandscape) 2.dp else 8.dp)) {
            if (sourceLang != null && targetLang != null && onSourceLangChange != null && onTargetLangChange != null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 8.dp, bottom = if (isLandscape) 2.dp else 4.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SmallLanguageSelector(availableLanguages = availableLanguages, currentValue = sourceLang, onSelected = onSourceLangChange)
                    IconButton(
                        onClick = { 
                            onSourceLangChange(targetLang)
                            onTargetLangChange(sourceLang)
                        },
                        modifier = Modifier.padding(horizontal = 4.dp).size(if (isLandscape) 20.dp else 24.dp)
                    ) {
                        Icon(Icons.Default.SwapHoriz, contentDescription = "Swap Languages", modifier = Modifier.size(if (isLandscape) 14.dp else 16.dp))
                    }
                    SmallLanguageSelector(availableLanguages = availableLanguages, currentValue = targetLang, onSelected = onTargetLangChange)
                }
            }

            if (extraContent != null) {
                extraContent()
            }

            if (suggestions.isNotEmpty() && onSuggestionClick != null) {
                androidx.compose.foundation.lazy.LazyColumn(
                    modifier = Modifier.fillMaxWidth().heightIn(max = if (isLandscape) 80.dp else 120.dp).padding(horizontal = 8.dp, vertical = 2.dp),
                    reverseLayout = true
                ) {
                    items(suggestions) { word ->
                        Text(
                            text = word.term,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSuggestionClick(word) }
                                .padding(vertical = if (isLandscape) 4.dp else 8.dp, horizontal = 4.dp)
                        )
                    }
                }
                HorizontalDivider(modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom
            ) {
                if (onClear != null) {
                    androidx.compose.foundation.layout.Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .padding(bottom = if (isLandscape) 4.dp else 8.dp, start = 8.dp, end = 4.dp)
                            .size(if (isLandscape) 32.dp else 40.dp)
                            .background(if (autoNewSearch) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer, CircleShape)
                            .clip(CircleShape)
                            .then(
                                @OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
                                Modifier.combinedClickable(
                                    onClick = onClear,
                                    onLongClick = onToggleAutoNewSearch
                                )
                            )
                    ) {
                        Icon(
                            if (autoNewSearch) Icons.Default.Bolt else Icons.Default.Add, 
                            contentDescription = "New Search", 
                            tint = if (autoNewSearch) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.size(if (isLandscape) 18.dp else 24.dp)
                        )
                    }
                }

                OutlinedTextField(
                    value = inputTerm,
                    onValueChange = onValueChange,
                    placeholder = { Text(placeholder) },
                    modifier = Modifier.weight(1f),
                    minLines = 1,
                    maxLines = if (isLandscape) 2 else 4,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default.copy(
                        imeAction = if (enterToSend) androidx.compose.ui.text.input.ImeAction.Send else androidx.compose.ui.text.input.ImeAction.Default
                    ),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                        onSend = { if (inputTerm.isNotBlank()) onSend() }
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent
                    )
                )
                Spacer(modifier = Modifier.width(if (isLandscape) 4.dp else 8.dp))
                IconButton(
                    onClick = onSend,
                    enabled = inputTerm.isNotBlank(),
                    modifier = Modifier
                        .padding(bottom = if (isLandscape) 4.dp else 8.dp)
                        .size(if (isLandscape) 32.dp else 40.dp)
                        .background(
                            if (inputTerm.isNotBlank()) MaterialTheme.colorScheme.primary 
                            else MaterialTheme.colorScheme.primary.copy(alpha = 0.38f), 
                            CircleShape
                        )
                ) {
                    if (isLoading && inputTerm.isBlank()) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(if (isLandscape) 14.dp else 18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Icon(
                            if (isFollowUp && !autoNewSearch) Icons.AutoMirrored.Filled.Send else Icons.Default.Search, 
                            contentDescription = "Send",
                            tint = MaterialTheme.colorScheme.onPrimary.copy(alpha = if (inputTerm.isNotBlank()) 1f else 0.5f),
                            modifier = Modifier.size(if (isLandscape) 18.dp else 24.dp)
                        )
                    }
                }
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun MultiSelectSearchableDropdown(
    label: String,
    currentCsv: String,
    options: List<String>,
    onCsvChange: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var searchText by remember { mutableStateOf("") }
    
    val selectedItems = currentCsv.split(",").map { it.trim() }.filter { it.isNotBlank() }

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = searchText,
                onValueChange = { searchText = it; expanded = true },
                label = { Text(label) },
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                val filtered = options.filter { it.contains(searchText, ignoreCase = true) }.take(10)
                filtered.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option) },
                        onClick = {
                            val newItems = if (selectedItems.contains(option)) {
                                selectedItems - option
                            } else {
                                selectedItems + option
                            }
                            onCsvChange(newItems.joinToString(", "))
                            searchText = ""
                            expanded = false
                        }
                    )
                }
            }
        }
        
        // Display selected items as chips
        @OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
        androidx.compose.foundation.layout.FlowRow(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            selectedItems.forEach { item ->
                InputChip(
                    selected = true,
                    onClick = {
                        onCsvChange((selectedItems - item).joinToString(", "))
                    },
                    label = { Text(com.aidict.app.utils.LanguageManager.getDisplayFlag(item)) },
                    trailingIcon = { Icon(Icons.Default.Delete, contentDescription = "Remove", modifier = Modifier.size(16.dp)) },
                    modifier = Modifier.padding(end = 4.dp, bottom = 4.dp)
                )
            }
        }
    }
}


@Composable
fun PulsingDots(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition()
    val scales = (0..2).map { index ->
        transition.animateFloat(
            initialValue = 0.5f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 600, delayMillis = index * 200, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse
            )
        )
    }

    Row(modifier = modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        scales.forEach { scale ->
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = scale.value), CircleShape)
            )
        }
    }
}

@Composable
fun MoveModeDialog(
    currentMode: String,
    titleText: String = "Move to Mode & Regenerate",
    onDismiss: () -> Unit,
    onSelectMode: (String) -> Unit
) {
    val modes = listOf(
        Triple("dict", "📚 Dictionary", "Comprehensive definitions, phonetics & etymology"),
        Triple("compare", "⚖️ Compare", "Exhaustive synonym & nuance comparison"),
        Triple("translate", "🗣️ Translate", "Contextual translation & natural idioms"),
        Triple("explain", "🧠 Explain", "Grammatical analysis & semantic breakdown"),
        Triple("correct", "✍️ Correct", "Grammar correction & contextual translation")
    ).filter { !it.first.equals(currentMode, ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(titleText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Choose destination agent to analyze this entry:",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(2.dp))
                modes.forEach { (modeKey, title, desc) ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onSelectMode(modeKey)
                                onDismiss()
                            },
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                            Spacer(Modifier.height(2.dp))
                            Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun ChatHeaderTitle(
    word: com.aidict.app.data.entities.Word,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clickable(onClick = onClick)
            .padding(end = 4.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = word.term,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
            if (!word.language.isNullOrBlank()) {
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "(${word.language})",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.width(4.dp))
            Icon(
                Icons.Default.Edit,
                contentDescription = "Rename",
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
            )
        }
        Text(
            text = "Searches: ${word.searchCount} | Views: ${word.viewCount}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun RenameWordDialog(
    word: com.aidict.app.data.entities.Word,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var newTerm by remember(word.id, word.term) { mutableStateOf(word.term) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Chat Name & Details") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Full Name / Original Query:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold
                )
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    SelectionContainer {
                        Text(
                            text = word.term,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }
                
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Rename to:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold
                )
                OutlinedTextField(
                    value = newTerm,
                    onValueChange = { newTerm = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = false,
                    maxLines = 4,
                    placeholder = { Text("Enter custom name...") }
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmed = newTerm.trim()
                    if (trimmed.isNotBlank()) {
                        onConfirm(trimmed)
                    }
                    onDismiss()
                }
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}


