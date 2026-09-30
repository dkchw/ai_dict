package com.aidict.app.ui.screens

import androidx.compose.material.icons.filled.Check
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.activity.compose.BackHandler
import com.aidict.app.ui.viewmodels.HistoryViewModel
import com.aidict.app.data.entities.Word
import com.aidict.app.data.entities.Profile
import com.aidict.app.data.entities.Session

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(appViewModel: com.aidict.app.ui.viewmodels.AppViewModel,
    onNavigateToChat: (Word) -> Unit,
    onRestartChat: (Word, com.aidict.app.data.entities.ChatMessage, Boolean) -> Unit = {_,_,_ -> }, 
    viewModel: HistoryViewModel,
    windowSizeClass: WindowSizeClass,
    searchViewModel: com.aidict.app.ui.viewmodels.SearchViewModel? = null,
    modifier: Modifier = Modifier
) {
    val history by viewModel.historyState.collectAsState()
    val appState by appViewModel.uiState.collectAsState()
    val sessions by viewModel.sessions.collectAsState()
    val activeSessionId by viewModel.activeSessionId.collectAsState()
    val colorFilter by viewModel.colorFilter.collectAsState()
    val starsFilter by viewModel.starsFilter.collectAsState()
    val searchInOutput by viewModel.searchInOutput.collectAsState()
    val modeCounts by viewModel.modeCounts.collectAsState()
    val currentModeFilter by viewModel.currentMode.collectAsState()
    val activeStreamJobIds by (searchViewModel?.activeStreamJobIds ?: kotlinx.coroutines.flow.MutableStateFlow(emptySet())).collectAsState()
    var query by remember { mutableStateOf("") }
    var filterOnlyMt by remember { mutableStateOf(false) }
    
    var selectedWord by remember { mutableStateOf<Word?>(null) }
    val restartingWordId by (searchViewModel?.isRestartingWordId ?: kotlinx.coroutines.flow.MutableStateFlow(null)).collectAsState()
    val isCurrentWordRestarting = selectedWord != null && restartingWordId == selectedWord?.id
    var isDetailMaximized by remember { mutableStateOf(false) }
    var isSelectionMode by remember { mutableStateOf(false) }
    var selectedSessionIds by remember { mutableStateOf(setOf<String>()) }
    var selectedWordIds by remember { mutableStateOf(setOf<Int>()) }
    var collapsedSessionIds by remember { mutableStateOf(setOf<String>()) }
    val coroutineScope = rememberCoroutineScope()
    
    LaunchedEffect(selectedWord) {
        viewModel.setSelectedWordId(selectedWord?.id)
        if (selectedWord == null) {
            isDetailMaximized = false
        }
    }

    LaunchedEffect(currentModeFilter) {
        if (selectedWord != null && !selectedWord!!.mode.equals(currentModeFilter, ignoreCase = true)) {
            selectedWord = null
            viewModel.setSelectedWordId(null)
        }
    }
    
    if (isSelectionMode) {
        BackHandler {
            isSelectionMode = false
            selectedSessionIds = emptySet()
            selectedWordIds = emptySet()
        }
    } else if (selectedWord != null) {
        BackHandler {
            if (isDetailMaximized) {
                isDetailMaximized = false
            } else {
                selectedWord = null
                viewModel.setSelectedWordId(null)
            }
        }
    }
    
    var showCreateSession by remember { mutableStateOf(false) }
    var showRenameSession by remember { mutableStateOf<Session?>(null) }
    var showRenameWord by remember { mutableStateOf<com.aidict.app.data.entities.Word?>(null) }
    var showMoveToProfile by remember { mutableStateOf(false) }
    var moveTargetWord by remember { mutableStateOf<com.aidict.app.data.entities.Word?>(null) }
    var showMoveTargetWordToMode by remember { mutableStateOf<com.aidict.app.data.entities.Word?>(null) }
    var showMoveSelectedToMode by remember { mutableStateOf(false) }
    var wordNameInput by remember { mutableStateOf("") }
    var sessionNameInput by remember { mutableStateOf("") }

    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    val isTablet = windowSizeClass.widthSizeClass == WindowWidthSizeClass.Expanded
    val isHorizontalSplit = isTablet || isLandscape
    val context = androidx.compose.ui.platform.LocalContext.current

    val colors = listOf(
        "Red" to Color(0xFFEF4444),
        "Orange" to Color(0xFFF97316),
        "Yellow" to Color(0xFFEAB308),
        "Green" to Color(0xFF22C55E),
        "Blue" to Color(0xFF3B82F6)
    )

    val listContent = @Composable {
        val listPadding = if (isLandscape) PaddingValues(horizontal = 6.dp, vertical = 4.dp) else PaddingValues(horizontal = 12.dp, vertical = 8.dp)
        Column(modifier = Modifier.fillMaxSize().padding(listPadding)) {
            // Mode Filter Tab Bar & Profile
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = if (isLandscape) 4.dp else 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(rememberScrollState()),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    val modeTabs = listOf(
                        "dict" to "Dict",
                        "compare" to "Compare",
                        "translate" to "Translate",
                        "explain" to "Explain",
                        "correct" to "Correct"
                    )
                    modeTabs.forEach { (modeKey, label) ->
                        val isSelected = currentModeFilter.equals(modeKey, ignoreCase = true)
                        val count = modeCounts[modeKey] ?: 0
                        FilterChip(
                            selected = isSelected,
                            onClick = { viewModel.setMode(modeKey) },
                            label = {
                                Text(
                                    "$label ($count)",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            leadingIcon = if (isSelected) {
                                { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(12.dp)) }
                            } else null,
                            modifier = Modifier.heightIn(max = if (isLandscape) 28.dp else 32.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(6.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                ) {
                    Text(
                        text = "👤 ${appState.activeProfile?.name ?: "Default"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Compact Search Bar
            OutlinedTextField(
                value = query,
                onValueChange = { 
                    query = it
                    viewModel.updateSearchQuery(it)
                },
                placeholder = { Text("Search history...", style = MaterialTheme.typography.bodySmall) },
                singleLine = true,
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "Search",
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(
                            onClick = {
                                query = ""
                                viewModel.updateSearchQuery("")
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(16.dp))
                        }
                    }
                },
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (isLandscape) Modifier.heightIn(min = 40.dp, max = 42.dp) else Modifier)
            )

            // Filter Chips Bar (Compact horizontal scroll)
            val hasActiveFilters = searchInOutput || colorFilter != null || starsFilter != null || filterOnlyMt
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(vertical = if (isLandscape) 3.dp else 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (hasActiveFilters) {
                    AssistChip(
                        onClick = {
                            if (searchInOutput) viewModel.toggleSearchInOutput()
                            viewModel.setFilterColor(null)
                            viewModel.setFilterStars(null)
                            filterOnlyMt = false
                        },
                        label = { Text("Reset ✕", style = MaterialTheme.typography.labelSmall) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f))
                    )
                }

                FilterChip(
                    selected = filterOnlyMt,
                    onClick = { filterOnlyMt = !filterOnlyMt },
                    label = { Text("🌐 MT Only", style = MaterialTheme.typography.labelSmall) },
                    leadingIcon = {
                        if (filterOnlyMt) {
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp))
                        } else {
                            Icon(Icons.Default.Translate, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFF06B6D4))
                        }
                    }
                )

                FilterChip(
                    selected = searchInOutput,
                    onClick = { viewModel.toggleSearchInOutput() },
                    label = { Text("Search Output", style = MaterialTheme.typography.labelSmall) },
                    leadingIcon = { if (searchInOutput) Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                )

                HorizontalDivider(modifier = Modifier.width(1.dp).height(18.dp))

                colors.forEach { (name, colorValue) ->
                    FilterChip(
                        selected = colorFilter == name,
                        onClick = { viewModel.setFilterColor(name) },
                        label = { Text(name, style = MaterialTheme.typography.labelSmall) },
                        leadingIcon = { Box(modifier = Modifier.size(10.dp).background(colorValue, CircleShape)) }
                    )
                }

                HorizontalDivider(modifier = Modifier.width(1.dp).height(18.dp))

                (1..5).forEach { star ->
                    FilterChip(
                        selected = starsFilter == star,
                        onClick = { viewModel.setFilterStars(star) },
                        label = { Text("$star ★", style = MaterialTheme.typography.labelSmall) },
                        leadingIcon = { Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFFC107), modifier = Modifier.size(14.dp)) }
                    )
                }
            }

            val displayedHistory = remember(history, filterOnlyMt) {
                if (filterOnlyMt) {
                    history.filter { it.language?.contains("[MT:") == true }
                } else {
                    history
                }
            }
            val grouped = displayedHistory.groupBy { it.sessionId }

            // Selection Mode Actions Bar OR Streamlined Session Chips Bar
            if (isSelectionMode) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { isSelectionMode = false; selectedSessionIds = emptySet(); selectedWordIds = emptySet() },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel Selection", modifier = Modifier.size(18.dp))
                    }
                    Text(
                        "${selectedSessionIds.size}S, ${selectedWordIds.size}W",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(
                        onClick = { showMoveToProfile = true },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Move to Profile", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                    }
                    if (selectedWordIds.isNotEmpty()) {
                        IconButton(
                            onClick = { showMoveSelectedToMode = true },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.CompareArrows, contentDescription = "Move to Mode", tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(18.dp))
                        }
                    }
                    IconButton(
                        onClick = {
                            viewModel.deleteSelectedSessions(selectedSessionIds)
                            viewModel.deleteSelectedWords(selectedWordIds)
                            isSelectionMode = false
                            selectedSessionIds = emptySet()
                            selectedWordIds = emptySet()
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete Selected", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                    }
                }
            } else {
                // Sleek, modern horizontally scrollable Session Chips Bar
                // Replaces the clunky, squished "Default Session" & "New Session" buttons!
                val defaultCount = displayedHistory.count { it.sessionId.isNullOrBlank() }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(bottom = if (isLandscape) 4.dp else 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Default session chip
                    val isDefaultActive = activeSessionId.isNullOrBlank()
                    FilterChip(
                        selected = isDefaultActive,
                        onClick = { viewModel.setActiveSession(null) },
                        label = {
                            Text(
                                "Default ($defaultCount)",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = if (isDefaultActive) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        leadingIcon = if (isDefaultActive) {
                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                        } else null
                    )

                    // Individual session chips
                    sessions.forEach { session ->
                        val count = grouped[session.id]?.size ?: 0
                        val isActive = activeSessionId == session.id
                        FilterChip(
                            selected = isActive,
                            onClick = { viewModel.setActiveSession(session.id) },
                            label = {
                                Text(
                                    "${session.name} ($count)",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            leadingIcon = if (isActive) {
                                { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                            } else null
                        )
                    }

                    // "+ New" Session Chip
                    AssistChip(
                        onClick = { showCreateSession = true },
                        leadingIcon = { Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(14.dp)) },
                        label = { Text("New Session", style = MaterialTheme.typography.labelSmall) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(2.dp))

            // LazyColumn of sessions & history items
            @OptIn(ExperimentalFoundationApi::class)
            LazyColumn(modifier = Modifier.weight(1f)) {
                if (displayedHistory.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(top = 40.dp, bottom = 24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f))
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    if (filterOnlyMt) "No offline translations found" else "No words found in this mode",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                // Known Sessions
                sessions.forEach { session ->
                    val wordsInSession = grouped[session.id] ?: emptyList()
                    val isSessionActive = activeSessionId == session.id
                    val isCollapsed = collapsedSessionIds.contains(session.id)
                    item {
                        var sessionMenuExpanded by remember { mutableStateOf(false) }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .background(
                                    if (isSelectionMode && selectedSessionIds.contains(session.id)) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                                    else if (isSessionActive) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .combinedClickable(
                                    onClick = {
                                        if (isSelectionMode) {
                                            selectedSessionIds = if (selectedSessionIds.contains(session.id)) selectedSessionIds - session.id else selectedSessionIds + session.id
                                        } else {
                                            collapsedSessionIds = if (isCollapsed) collapsedSessionIds - session.id else collapsedSessionIds + session.id
                                        }
                                    },
                                    onLongClick = {
                                        if (!isSelectionMode) {
                                            isSelectionMode = true
                                            selectedSessionIds = selectedSessionIds + session.id
                                        }
                                    }
                                )
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            if (isSelectionMode) {
                                Checkbox(
                                    checked = selectedSessionIds.contains(session.id),
                                    onCheckedChange = { selectedSessionIds = if (it) selectedSessionIds + session.id else selectedSessionIds - session.id },
                                    modifier = Modifier.size(24.dp).padding(end = 4.dp)
                                )
                            }

                            Icon(
                                if (isCollapsed) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowUp,
                                contentDescription = "Toggle Collapse",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.width(6.dp))

                            Text(
                                text = "${session.name} (${wordsInSession.size})",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isSessionActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )

                            if (isSessionActive) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(end = 4.dp)
                                ) {
                                    Text(
                                        "ACTIVE",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                                    )
                                }
                            }

                            if (!isSelectionMode) {
                                Box {
                                    IconButton(
                                        onClick = { sessionMenuExpanded = true },
                                        modifier = Modifier.size(28.dp)
                                    ) {
                                        Icon(Icons.Default.MoreVert, contentDescription = "Session Menu", modifier = Modifier.size(16.dp))
                                    }
                                    DropdownMenu(
                                        expanded = sessionMenuExpanded,
                                        onDismissRequest = { sessionMenuExpanded = false }
                                    ) {
                                        if (!isSessionActive) {
                                            DropdownMenuItem(
                                                text = { Text("Set as Active") },
                                                leadingIcon = { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp)) },
                                                onClick = {
                                                    sessionMenuExpanded = false
                                                    viewModel.setActiveSession(session.id)
                                                }
                                            )
                                        }
                                        DropdownMenuItem(
                                            text = { Text("Rename") },
                                            leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp)) },
                                            onClick = {
                                                sessionMenuExpanded = false
                                                sessionNameInput = session.name
                                                showRenameSession = session
                                            }
                                        )
                                        HorizontalDivider()
                                        DropdownMenuItem(
                                            text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                                            leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp)) },
                                            onClick = {
                                                sessionMenuExpanded = false
                                                viewModel.deleteSession(session)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (!isCollapsed) {
                        items(wordsInSession, key = { it.id }) { word ->
                            HistoryWordCard(
                                word = word,
                                isSelected = selectedWord?.id == word.id,
                                isSelectionMode = isSelectionMode,
                                isChecked = selectedWordIds.contains(word.id),
                                colors = colors,
                                isGenerating = activeStreamJobIds.contains(word.id) || (searchViewModel?.isWordGenerating(word.id) == true),
                                showModeBadge = false,
                                onClick = {
                                    if (isSelectionMode) {
                                        selectedWordIds = if (selectedWordIds.contains(word.id)) selectedWordIds - word.id else selectedWordIds + word.id
                                    } else {
                                        selectedWord = word
                                        viewModel.setSelectedWordId(word.id)
                                    }
                                },
                                onLongClick = {
                                    if (!isSelectionMode) {
                                        isSelectionMode = true
                                        selectedWordIds = selectedWordIds + word.id
                                    }
                                },
                                onCheckChanged = { checked ->
                                    selectedWordIds = if (checked) selectedWordIds + word.id else selectedWordIds - word.id
                                },
                                onRename = {
                                    wordNameInput = word.term
                                    showRenameWord = word
                                },
                                onMoveToProfile = {
                                    moveTargetWord = word
                                    showMoveToProfile = true
                                },
                                onMoveToMode = {
                                    showMoveTargetWordToMode = word
                                },
                                onDelete = { viewModel.deleteWord(word) }
                            )
                        }
                    }
                }

                // Default / Unassigned / Unknown Sessions
                val unknownSessions = grouped.keys.filter { sid -> sessions.none { it.id == sid } }
                unknownSessions.forEach { sid ->
                    val sessionKey = if (sid.isNullOrBlank()) "__default__" else sid
                    val isCollapsed = collapsedSessionIds.contains(sessionKey)
                    val wordsInSession = grouped[sid] ?: emptyList()
                    val sessionDisplayName = if (sid.isNullOrBlank()) "Default Session" else "Session: $sid"
                    val isDefaultActive = sid.isNullOrBlank() && activeSessionId.isNullOrBlank()

                    item {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .background(
                                    if (isDefaultActive) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .clickable {
                                    collapsedSessionIds = if (isCollapsed) collapsedSessionIds - sessionKey else collapsedSessionIds + sessionKey
                                }
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                if (isCollapsed) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowUp,
                                contentDescription = "Toggle Collapse",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.width(6.dp))

                            Text(
                                text = "$sessionDisplayName (${wordsInSession.size})",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isDefaultActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )

                            if (isDefaultActive) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(end = 4.dp)
                                ) {
                                    Text(
                                        "ACTIVE",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                                    )
                                }
                            }
                        }
                    }

                    if (!isCollapsed) {
                        items(wordsInSession, key = { it.id }) { word ->
                            HistoryWordCard(
                                word = word,
                                isSelected = selectedWord?.id == word.id,
                                isSelectionMode = isSelectionMode,
                                isChecked = selectedWordIds.contains(word.id),
                                colors = colors,
                                isGenerating = activeStreamJobIds.contains(word.id) || (searchViewModel?.isWordGenerating(word.id) == true),
                                showModeBadge = false,
                                onClick = {
                                    if (isSelectionMode) {
                                        selectedWordIds = if (selectedWordIds.contains(word.id)) selectedWordIds - word.id else selectedWordIds + word.id
                                    } else {
                                        selectedWord = word
                                        viewModel.setSelectedWordId(word.id)
                                    }
                                },
                                onLongClick = {
                                    if (!isSelectionMode) {
                                        isSelectionMode = true
                                        selectedWordIds = selectedWordIds + word.id
                                    }
                                },
                                onCheckChanged = { checked ->
                                    selectedWordIds = if (checked) selectedWordIds + word.id else selectedWordIds - word.id
                                },
                                onRename = {
                                    wordNameInput = word.term
                                    showRenameWord = word
                                },
                                onMoveToProfile = {
                                    moveTargetWord = word
                                    showMoveToProfile = true
                                },
                                onMoveToMode = {
                                    showMoveTargetWordToMode = word
                                },
                                onDelete = { viewModel.deleteWord(word) }
                            )
                        }
                    }
                }
            }
        }
    }

    var isDetailSearching by remember { mutableStateOf(false) }
    var detailSearchQuery by remember { mutableStateOf("") }
    val detailContent = @Composable {
        val messages by viewModel.selectedChatMessages.collectAsState()
        if (selectedWord != null) {
            val isDetailMt = selectedWord?.language?.contains("[MT:") == true
            val mtColor = Color(0xFF06B6D4)
            val outerPadding = if (isLandscape) PaddingValues(horizontal = 8.dp, vertical = 4.dp) else PaddingValues(12.dp)
            val cardPadding = if (isLandscape) PaddingValues(horizontal = 10.dp, vertical = 6.dp) else PaddingValues(horizontal = 12.dp, vertical = 8.dp)

            Column(modifier = Modifier.fillMaxSize().padding(outerPadding).background(MaterialTheme.colorScheme.surface)) {
                androidx.compose.material3.Card(
                    modifier = Modifier.fillMaxWidth().padding(bottom = if (isLandscape) 4.dp else 8.dp),
                    colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(cardPadding)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (isDetailMt) {
                                Icon(
                                    Icons.Default.Translate,
                                    contentDescription = "Machine Translation",
                                    tint = mtColor,
                                    modifier = Modifier.size(20.dp).padding(end = 4.dp)
                                )
                            }
                            SelectionContainer(modifier = Modifier.weight(1f)) { 
                                Text(
                                    text = selectedWord!!.term, 
                                    style = if (isLandscape) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(
                                onClick = {
                                    wordNameInput = selectedWord!!.term
                                    showRenameWord = selectedWord
                                },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    Icons.Default.Edit,
                                    contentDescription = "Rename",
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(Modifier.width(4.dp))
                            IconButton(
                                onClick = { isDetailMaximized = !isDetailMaximized },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    if (isDetailMaximized) Icons.Default.FullscreenExit else Icons.Default.Fullscreen,
                                    contentDescription = "Toggle Fullscreen",
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                            Spacer(Modifier.width(4.dp))
                            IconButton(onClick = { 
                                selectedWord = null
                                viewModel.setSelectedWordId(null) 
                                isDetailMaximized = false
                            }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Close Details", modifier = Modifier.size(18.dp))
                            }
                        }
                        
                        val dateFormatted = java.text.SimpleDateFormat("MMM dd, yyyy  HH:mm", java.util.Locale.getDefault()).format(java.util.Date(selectedWord!!.createdAt))
                        val headerSubtitle = if (isDetailMt) {
                            val tierStr = if (selectedWord!!.language?.contains("[MT:strong]") == true) "Strong Offline (NLLB-200)" else "Normal Offline (Opus-MT)"
                            "🌐 $tierStr • $dateFormatted"
                        } else {
                            "$dateFormatted • 🔍 ${selectedWord!!.searchCount} • 👁 ${selectedWord!!.viewCount} • ⚡ ${selectedWord!!.generationCount}"
                        }
                        Text(
                            text = headerSubtitle,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            color = if (isDetailMt) mtColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )
                        
                        Spacer(modifier = Modifier.height(if (isLandscape) 4.dp else 8.dp))
                        
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (isDetailMt) {
                                Button(
                                    onClick = { onNavigateToChat(selectedWord!!) },
                                    modifier = Modifier.weight(1f).height(if (isLandscape) 30.dp else 36.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                                ) {
                                    Text("Open", style = MaterialTheme.typography.labelMedium)
                                }
                                Button(
                                    onClick = {
                                        val activeProfileId = appState.activeProfile?.id ?: 1
                                        val wordToDeepen = selectedWord!!
                                        coroutineScope.launch {
                                            val srcLang = searchViewModel?.getProfileSetting(activeProfileId, "CORRECT_SOURCE") ?: "Auto Detect"
                                            val tgtLang = searchViewModel?.getProfileSetting(activeProfileId, "CORRECT_TARGET") ?: "German"
                                            searchViewModel?.saveProfileSetting(activeProfileId, "CORRECT_TYPE", "both")
                                            searchViewModel?.streamCorrect(wordToDeepen.term, srcLang, tgtLang, activeProfileId, isCorrectionOnly = false)
                                            onNavigateToChat(wordToDeepen)
                                        }
                                    },
                                    modifier = Modifier.weight(1.35f).height(if (isLandscape) 30.dp else 36.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.tertiary
                                    )
                                ) {
                                    Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(13.dp))
                                    Spacer(Modifier.width(3.dp))
                                    Text("✨ Deepen LLM", style = MaterialTheme.typography.labelMedium)
                                }
                            } else {
                                Button(
                                    onClick = { onNavigateToChat(selectedWord!!) },
                                    modifier = Modifier.weight(1f).height(if (isLandscape) 30.dp else 36.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
                                ) {
                                    Text("Resume Chat", style = MaterialTheme.typography.labelMedium)
                                }
                            }
                            
                            IconButton(
                                onClick = { isDetailSearching = !isDetailSearching }, 
                                modifier = Modifier.size(if (isLandscape) 30.dp else 36.dp).background(if (isDetailSearching) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer, CircleShape)
                            ) {
                                Icon(Icons.Default.Search, contentDescription = "Search in Chat", tint = if (isDetailSearching) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(16.dp))
                            }
                            
                            if (!isDetailMt) {
                                IconButton(
                                    onClick = {
                                        val lastUserMsg = messages.findLast { it.role == "assistant" }
                                        val targetMsg = lastUserMsg ?: messages.lastOrNull() ?: com.aidict.app.data.entities.ChatMessage(wordId = selectedWord!!.id, role = "assistant", content = "")
                                        android.widget.Toast.makeText(context, "Restarting with Current Model...", android.widget.Toast.LENGTH_SHORT).show()
                                        onRestartChat(selectedWord!!, targetMsg, false)
                                    }, 
                                    modifier = Modifier.size(if (isLandscape) 30.dp else 36.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape)
                                ) {
                                    if (isCurrentWordRestarting) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                    } else {
                                        Icon(Icons.Default.Refresh, contentDescription = "Restart with Current Model", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                    }
                                }
                                
                                IconButton(
                                    onClick = {
                                        val lastUserMsg = messages.findLast { it.role == "assistant" }
                                        val targetMsg = lastUserMsg ?: messages.lastOrNull() ?: com.aidict.app.data.entities.ChatMessage(wordId = selectedWord!!.id, role = "assistant", content = "")
                                        android.widget.Toast.makeText(context, "Restarting with Fallback Model...", android.widget.Toast.LENGTH_SHORT).show()
                                        onRestartChat(selectedWord!!, targetMsg, true)
                                    }, 
                                    modifier = Modifier.size(if (isLandscape) 30.dp else 36.dp).background(MaterialTheme.colorScheme.errorContainer, CircleShape)
                                ) {
                                    if (isCurrentWordRestarting) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                                    } else {
                                        Icon(Icons.Default.Autorenew, contentDescription = "Restart with Fallback Model", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                    }
                                }
                            }

                            IconButton(
                                onClick = { showMoveTargetWordToMode = selectedWord }, 
                                modifier = Modifier.size(if (isLandscape) 30.dp else 36.dp).background(MaterialTheme.colorScheme.tertiaryContainer, CircleShape)
                            ) {
                                Icon(Icons.AutoMirrored.Filled.CompareArrows, contentDescription = "Move Mode & Regenerate", tint = MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
                
                if (isDetailSearching) {
                    OutlinedTextField(
                        value = detailSearchQuery,
                        onValueChange = { detailSearchQuery = it },
                        modifier = Modifier.fillMaxWidth().padding(bottom = if (isLandscape) 4.dp else 8.dp),
                        placeholder = { Text("Find in chat...", style = MaterialTheme.typography.bodySmall) },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodySmall,
                        trailingIcon = {
                            if (detailSearchQuery.isNotEmpty()) {
                                IconButton(onClick = { detailSearchQuery = "" }, modifier = Modifier.size(24.dp)) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear Search", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    )
                }

                val displayMessages = if (detailSearchQuery.isBlank()) messages else messages.filter { it.content.contains(detailSearchQuery, ignoreCase = true) }
                LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    items(displayMessages) { msg ->
                        val isUser = msg.role == "user"
                        val isGenerating = msg.content == "Generating..." || msg.content.startsWith("Generating...")
                        val isError = msg.content.contains("Generation Failed")
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = if (isLandscape) 2.dp else 4.dp),
                            horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                        ) {
                            Column(modifier = Modifier.fillMaxWidth(if (isUser) 0.85f else 1f)) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(if (isUser) 1f else 0.85f)
                                        .background(
                                            color = if (isError) MaterialTheme.colorScheme.errorContainer
                                                    else if (isUser) MaterialTheme.colorScheme.primary 
                                                    else MaterialTheme.colorScheme.secondaryContainer,
                                            shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
                                        )
                                        .padding(if (isLandscape) 8.dp else 12.dp)
                                ) {
                                    if (isGenerating) {
                                        val liveStream = searchViewModel?.getWordStream(selectedWord!!.id) ?: ""
                                        if (liveStream.isNotBlank()) {
                                            Column {
                                                com.aidict.app.ui.components.MarkdownText(
                                                    text = liveStream,
                                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                                )
                                                Spacer(Modifier.height(8.dp))
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp, color = MaterialTheme.colorScheme.primary)
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text("Generating response...", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                                }
                                            }
                                        } else {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                com.aidict.app.ui.components.PulsingDots()
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text("Working on it...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                            }
                                        }
                                    } else {
                                        Column {
                                            com.aidict.app.ui.components.MarkdownText(
                                                text = msg.content,
                                                color = if (isError) MaterialTheme.colorScheme.onErrorContainer else (if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSecondaryContainer)
                                            )
                                            if (isError) {
                                                Spacer(Modifier.height(8.dp))
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    Button(
                                                        onClick = {
                                                            android.widget.Toast.makeText(context, "Restarting with Current Model...", android.widget.Toast.LENGTH_SHORT).show()
                                                            onRestartChat(selectedWord!!, msg, false)
                                                        },
                                                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                                        modifier = Modifier.height(28.dp)
                                                    ) {
                                                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp))
                                                        Spacer(Modifier.width(4.dp))
                                                        Text("Retry", style = MaterialTheme.typography.labelSmall)
                                                    }
                                                    OutlinedButton(
                                                        onClick = {
                                                            android.widget.Toast.makeText(context, "Restarting with Fallback Model...", android.widget.Toast.LENGTH_SHORT).show()
                                                            onRestartChat(selectedWord!!, msg, true)
                                                        },
                                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                                        modifier = Modifier.height(28.dp)
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
                                if (!isUser && !isGenerating) {
                                    Row(modifier = Modifier.fillMaxWidth(0.85f), horizontalArrangement = Arrangement.Start) {
                                        IconButton(onClick = {
                                            val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("AI Dict", msg.content))
                                            android.widget.Toast.makeText(context, "Copied", android.widget.Toast.LENGTH_SHORT).show()
                                        }, modifier = Modifier.size(if (isLandscape) 28.dp else 32.dp)) { Icon(Icons.Default.ContentCopy, "Copy", modifier = Modifier.size(16.dp)) }
                                        IconButton(onClick = { 
                                            android.widget.Toast.makeText(context, "Restarting with Current Model...", android.widget.Toast.LENGTH_SHORT).show()
                                            onRestartChat(selectedWord!!, msg, false) 
                                        }, modifier = Modifier.size(if (isLandscape) 28.dp else 32.dp)) { 
                                            if (isCurrentWordRestarting) {
                                                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                            } else {
                                                Icon(Icons.Default.Refresh, "Regenerate (Current)", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp)) 
                                            }
                                        }
                                        IconButton(onClick = { 
                                            android.widget.Toast.makeText(context, "Restarting with Fallback Model...", android.widget.Toast.LENGTH_SHORT).show()
                                            onRestartChat(selectedWord!!, msg, true) 
                                        }, modifier = Modifier.size(if (isLandscape) 28.dp else 32.dp)) { 
                                            if (isCurrentWordRestarting) {
                                                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                                            } else {
                                                Icon(Icons.Default.Autorenew, "Regenerate (Fallback)", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp)) 
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (isCurrentWordRestarting && displayMessages.none { it.content.startsWith("Generating") }) {
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                com.aidict.app.ui.components.PulsingDots()
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Working on it...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }

    val splitFraction by viewModel.splitFraction.collectAsState()

    if (isHorizontalSplit) {
        val totalWidthDp = configuration.screenWidthDp.dp
        Row(modifier = modifier.fillMaxSize()) {
            if (selectedWord == null) {
                Box(modifier = Modifier.fillMaxSize()) { listContent() }
            } else if (isDetailMaximized) {
                Box(modifier = Modifier.fillMaxSize()) { detailContent() }
            } else {
                Box(modifier = Modifier.weight(splitFraction)) { listContent() }
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(10.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .pointerInput(Unit) {
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                val dragAmountFraction = dragAmount.x / (totalWidthDp.toPx())
                                val newFraction = (splitFraction + dragAmountFraction).coerceIn(0.2f, 0.8f)
                                viewModel.updateSplitFraction(newFraction)
                            }
                        }
                ) {
                    VerticalDivider(modifier = Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.outlineVariant)
                    Box(
                        modifier = Modifier
                            .width(4.dp)
                            .height(36.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.6f), RoundedCornerShape(2.dp))
                            .align(Alignment.Center)
                    )
                }
                Box(modifier = Modifier.weight(1f - splitFraction)) { detailContent() }
            }
        }
    } else {
        val totalHeightDp = configuration.screenHeightDp.dp
        Column(modifier = modifier.fillMaxSize()) {
            if (selectedWord == null) {
                Box(modifier = Modifier.fillMaxSize()) { listContent() }
            } else if (isDetailMaximized) {
                Box(modifier = Modifier.fillMaxSize()) { detailContent() }
            } else {
                Box(modifier = Modifier.weight(splitFraction)) { listContent() }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .pointerInput(Unit) {
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                val dragAmountFraction = dragAmount.y / (totalHeightDp.toPx())
                                val newFraction = (splitFraction + dragAmountFraction).coerceIn(0.2f, 0.8f)
                                viewModel.updateSplitFraction(newFraction)
                            }
                        }
                ) {
                    HorizontalDivider(modifier = Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.outlineVariant)
                    Box(
                        modifier = Modifier
                            .width(36.dp)
                            .height(4.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.6f), RoundedCornerShape(2.dp))
                            .align(Alignment.Center)
                    )
                }
                Box(modifier = Modifier.weight(1f - splitFraction)) { detailContent() }
            }
        }
    }

    if (showCreateSession) {
        AlertDialog(
            onDismissRequest = { showCreateSession = false },
            title = { Text("New Session") },
            text = {
                OutlinedTextField(
                    value = sessionNameInput,
                    onValueChange = { sessionNameInput = it },
                    label = { Text("Session Name") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.createSession(sessionNameInput)
                    sessionNameInput = ""
                    showCreateSession = false
                }) { Text("Create") }
            },
            dismissButton = {
                TextButton(onClick = { showCreateSession = false }) { Text("Cancel") }
            }
        )
    }

    if (showRenameSession != null) {
        AlertDialog(
            onDismissRequest = { showRenameSession = null },
            title = { Text("Rename Session") },
            text = {
                OutlinedTextField(
                    value = sessionNameInput,
                    onValueChange = { sessionNameInput = it },
                    label = { Text("Session Name") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (sessionNameInput.isNotBlank()) viewModel.renameSession(showRenameSession!!, sessionNameInput)
                    sessionNameInput = ""
                    showRenameSession = null
                }) { Text("Rename") }
            },
            dismissButton = {
                TextButton(onClick = { showRenameSession = null }) { Text("Cancel") }
            }
        )
    }

    if (showRenameWord != null) {
        AlertDialog(
            onDismissRequest = { showRenameWord = null },
            title = { Text("Rename History Item") },
            text = {
                OutlinedTextField(
                    value = wordNameInput,
                    onValueChange = { wordNameInput = it },
                    label = { Text("New Name") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (wordNameInput.isNotBlank()) {
                        viewModel.renameWord(showRenameWord!!, wordNameInput)
                        if (selectedWord?.id == showRenameWord?.id) {
                            selectedWord = selectedWord?.copy(term = wordNameInput)
                        }
                    }
                    wordNameInput = ""
                    showRenameWord = null
                }) { Text("Rename") }
            },
            dismissButton = {
                TextButton(onClick = { showRenameWord = null }) { Text("Cancel") }
            }
        )
    }


    if (showMoveToProfile) {
        var selectedProfileId by remember { mutableStateOf(appState.activeProfile?.id ?: 1) }
        AlertDialog(
            onDismissRequest = { showMoveToProfile = false; moveTargetWord = null },
            title = { Text("Move to Profile") },
            text = {
                Column {
                    Text("Select a profile to move the selected items to:")
                    Spacer(modifier = Modifier.height(8.dp))
                    appState.profiles.filter { it.id != (appState.activeProfile?.id ?: -1) }.forEach { profile ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { selectedProfileId = profile.id }.padding(8.dp)) {
                            RadioButton(selected = selectedProfileId == profile.id, onClick = { selectedProfileId = profile.id })
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(profile.name)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (moveTargetWord != null) {
                        viewModel.moveWord(moveTargetWord!!, selectedProfileId)
                    } else if (isSelectionMode) {
                        viewModel.moveSelected(selectedSessionIds, selectedWordIds, selectedProfileId)
                        isSelectionMode = false
                        selectedSessionIds = emptySet()
                        selectedWordIds = emptySet()
                    }
                    showMoveToProfile = false
                    moveTargetWord = null
                }) { Text("Move") }
            },
            dismissButton = {
                TextButton(onClick = { showMoveToProfile = false; moveTargetWord = null }) { Text("Cancel") }
            }
        )
    }

    if (showMoveTargetWordToMode != null) {
        com.aidict.app.ui.components.MoveModeDialog(
            currentMode = showMoveTargetWordToMode!!.mode,
            onDismiss = { showMoveTargetWordToMode = null },
            onSelectMode = { targetMode ->
                val wordToMove = showMoveTargetWordToMode!!
                searchViewModel?.moveWordToModeAndRegenerate(wordToMove, targetMode)
                if (selectedWord?.id == wordToMove.id) {
                    selectedWord = selectedWord?.copy(mode = targetMode)
                }
                showMoveTargetWordToMode = null
            }
        )
    }

    if (showMoveSelectedToMode) {
        com.aidict.app.ui.components.MoveModeDialog(
            currentMode = "",
            titleText = "Move Selected Words to Mode",
            onDismiss = { showMoveSelectedToMode = false },
            onSelectMode = { targetMode ->
                viewModel.moveSelectedWordsMode(selectedWordIds, targetMode)
                isSelectionMode = false
                selectedSessionIds = emptySet()
                selectedWordIds = emptySet()
                showMoveSelectedToMode = false
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HistoryWordCard(
    word: Word,
    isSelected: Boolean,
    isSelectionMode: Boolean,
    isChecked: Boolean,
    colors: List<Pair<String, Color>>,
    isGenerating: Boolean = false,
    showModeBadge: Boolean = false,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onCheckChanged: (Boolean) -> Unit,
    onRename: () -> Unit,
    onMoveToProfile: () -> Unit,
    onMoveToMode: () -> Unit = {},
    onDelete: () -> Unit
) {
    var menuExpanded by remember { mutableStateOf(false) }
    val isMt = word.language?.contains("[MT:") == true
    val mtColor = Color(0xFF06B6D4)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.5.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick
            ),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
        border = if (isMt && !isSelected) androidx.compose.foundation.BorderStroke(1.dp, mtColor.copy(alpha = 0.35f)) else null,
        elevation = CardDefaults.cardElevation(if (isSelected) 4.dp else 1.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelectionMode && isChecked) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            else if (isSelected) MaterialTheme.colorScheme.primaryContainer
            else if (isMt) mtColor.copy(alpha = 0.08f)
            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
        )
    ) {
        Row(
            modifier = Modifier.padding(start = 8.dp, top = 5.dp, bottom = 5.dp, end = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isSelectionMode) {
                Checkbox(
                    checked = isChecked,
                    onCheckedChange = onCheckChanged,
                    modifier = Modifier.size(24.dp).padding(end = 4.dp)
                )
            }

            // Color tag: sleek vertical indicator bar
            if (word.color != null) {
                val c = colors.find { it.first == word.color }?.second ?: Color.Gray
                Box(
                    modifier = Modifier
                        .width(4.dp)
                        .height(26.dp)
                        .background(c, androidx.compose.foundation.shape.RoundedCornerShape(2.dp))
                )
                Spacer(modifier = Modifier.width(8.dp))
            } else if (isMt) {
                Box(
                    modifier = Modifier
                        .width(4.dp)
                        .height(26.dp)
                        .background(mtColor, androidx.compose.foundation.shape.RoundedCornerShape(2.dp))
                )
                Spacer(modifier = Modifier.width(8.dp))
            }

            // Word term & language/stars
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isMt) {
                        Icon(
                            Icons.Default.Translate,
                            contentDescription = "Machine Translation",
                            tint = mtColor,
                            modifier = Modifier.size(14.dp).padding(end = 3.dp)
                        )
                    }
                    androidx.compose.foundation.text.selection.SelectionContainer(modifier = Modifier.weight(1f, fill = false)) {
                        Text(
                            text = word.term,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    if (isGenerating) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.8f)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(10.dp),
                                    strokeWidth = 1.5.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = "Generating...",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    if (isMt) {
                        val isStrong = word.language?.contains("[MT:strong]") == true
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = mtColor.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = if (isStrong) "LOCAL MT • STRONG" else "LOCAL MT",
                                style = MaterialTheme.typography.labelSmall,
                                color = mtColor,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                            )
                        }
                    } else if (showModeBadge) {
                        val modeColor = when (word.mode.lowercase()) {
                            "dict" -> MaterialTheme.colorScheme.primary
                            "compare" -> MaterialTheme.colorScheme.tertiary
                            "translate" -> MaterialTheme.colorScheme.secondary
                            "explain" -> Color(0xFFF59E0B)
                            "correct" -> Color(0xFF10B981)
                            else -> MaterialTheme.colorScheme.outline
                        }
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = modeColor.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = word.mode.uppercase(),
                                style = MaterialTheme.typography.labelSmall,
                                color = modeColor,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                            )
                        }
                    }
                    if (!word.language.isNullOrBlank()) {
                        val displayLang = if (isMt) {
                            word.language.replace(Regex("\\[MT:[^]]+\\]"), "").trim() + " (Offline)"
                        } else {
                            word.language
                        }
                        Text(
                            text = displayLang,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isMt) mtColor.copy(alpha = 0.9f) else MaterialTheme.colorScheme.secondary,
                            maxLines = 1
                        )
                    }
                    if (word.stars > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Star,
                                contentDescription = "Stars",
                                tint = Color(0xFFFFC107),
                                modifier = Modifier.size(12.dp)
                            )
                            Spacer(modifier = Modifier.width(2.dp))
                            Text(
                                text = "${word.stars}",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFFFC107)
                            )
                        }
                    }
                }
            }

            // Single compact 3-dot overflow menu
            if (!isSelectionMode) {
                Box {
                    IconButton(
                        onClick = { menuExpanded = true },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            Icons.Default.MoreVert,
                            contentDescription = "Options",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Rename") },
                            leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp)) },
                            onClick = {
                                menuExpanded = false
                                onRename()
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Move to Profile") },
                            leadingIcon = { Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp)) },
                            onClick = {
                                menuExpanded = false
                                onMoveToProfile()
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Move Mode & Regenerate") },
                            leadingIcon = { Icon(Icons.AutoMirrored.Filled.CompareArrows, contentDescription = null, modifier = Modifier.size(18.dp)) },
                            onClick = {
                                menuExpanded = false
                                onMoveToMode()
                            }
                        )
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                            leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp)) },
                            onClick = {
                                menuExpanded = false
                                onDelete()
                            }
                        )
                    }
                }
            }
        }
    }
}