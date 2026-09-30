package com.aidict.app.ui

import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.foundation.background
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.ExperimentalFoundationApi

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.Alignment
import com.aidict.app.ui.screens.CompareScreen
import com.aidict.app.ui.screens.ExplainScreen
import com.aidict.app.ui.screens.HistoryScreen
import com.aidict.app.ui.screens.SearchScreen
import com.aidict.app.ui.screens.SettingsScreen
import com.aidict.app.ui.screens.TranslateScreen
import com.aidict.app.ui.screens.NotesScreen
import com.aidict.app.ui.screens.CorrectScreen
import com.aidict.app.ui.viewmodels.HistoryViewModel
import com.aidict.app.ui.viewmodels.SearchViewModel
import com.aidict.app.ui.viewmodels.SettingsViewModel
import com.aidict.app.ui.viewmodels.NotesViewModel

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Spellcheck
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.platform.LocalDensity

import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.ui.graphics.vector.ImageVector

data class TabItem(val title: String, val icon: ImageVector)

enum class Screen { MAIN, HISTORY, SETTINGS, NOTES }

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun AppNavigation(
    windowSizeClass: WindowSizeClass,
    appViewModel: com.aidict.app.ui.viewmodels.AppViewModel,
    searchViewModel: SearchViewModel,
    historyViewModel: HistoryViewModel,
    settingsViewModel: SettingsViewModel,
    notesViewModel: NotesViewModel,
    initialMode: Int = 0,
    navigationTrigger: Long = 0L,
    onColorExtracted: (androidx.compose.ui.graphics.Color?) -> Unit
) {
    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    val isExpanded = windowSizeClass.widthSizeClass == WindowWidthSizeClass.Expanded
    
    var currentScreen by remember { mutableStateOf(Screen.MAIN) }
    var showManualDialog by remember { mutableStateOf(false) }
    if (showManualDialog) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showManualDialog = false },
            title = { androidx.compose.material3.Text("App Manual") },
            text = {
                androidx.compose.foundation.layout.Column(modifier = androidx.compose.ui.Modifier.verticalScroll(rememberScrollState())) {
                    androidx.compose.material3.Text(
                        text = "Welcome to AI Dict!\n\n" +
                                "1. Swipe Navigation\n" +
                                "Swipe left or right on the main screen to change modes (Dictionary, Compare, Translate, Explain).\n\n" +
                                "2. Pull for History\n" +
                                "Drag DOWN from the top of the main screen to quickly open your History.\n\n" +
                                "3. Drag for Notes\n" +
                                "Drag UP from the bottom of the main screen to quickly open Quick Notes.\n\n" +
                                "4. History Multi-Select\n" +
                                "In the History view, Long-Press any session or word to enter Selection Mode. You can select multiple items to delete at once. Tap the chevron to collapse a session.\n\n" +
                                "5. Auto-New Search\n" +
                                "Hold down the 'New Chat' button in any mode to toggle Auto-New Search. When on, sending a new query instantly clears the old chat instead of continuing the conversation.\n\n" +
                                "6. Custom Profiles\n" +
                                "Tap the profile name at the top left to create or switch custom Profiles. Each profile has its own settings, language defaults, and isolated history.",
                        style = androidx.compose.material3.MaterialTheme.typography.bodyMedium
                    )
                }
            },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = { showManualDialog = false }) {
                    androidx.compose.material3.Text("Got it!")
                }
            }
        )
    }

    val coroutineScope = rememberCoroutineScope()
    val pagerState = androidx.compose.foundation.pager.rememberPagerState(initialPage = initialMode, pageCount = { 5 })
    val currentMode = pagerState.targetPage

    LaunchedEffect(initialMode, navigationTrigger) {
        if (navigationTrigger > 0L) {
            currentScreen = Screen.MAIN
            if (pagerState.currentPage != initialMode) {
                pagerState.scrollToPage(initialMode)
            }
        }
    }


    val currentSearchState = when (currentMode) {
        0 -> searchViewModel.dictState.collectAsState().value
        1 -> searchViewModel.compareState.collectAsState().value
        2 -> searchViewModel.translateState.collectAsState().value
        3 -> searchViewModel.explainState.collectAsState().value
        4 -> searchViewModel.correctState.collectAsState().value
        else -> searchViewModel.dictState.collectAsState().value
    }

    androidx.activity.compose.BackHandler(enabled = currentScreen != Screen.MAIN || currentMode != 0 || currentSearchState.word != null) {

        if (currentScreen != Screen.MAIN) {

            currentScreen = Screen.MAIN

        } else if (currentMode != 0) {
            coroutineScope.launch { pagerState.animateScrollToPage(0) }
        } else if (currentSearchState.word != null) {
            val currentModeStr = when (currentMode) {
                0 -> "dict"
                1 -> "compare"
                2 -> "translate"
                3 -> "explain"
                4 -> "correct"
                else -> "dict"
            }
            searchViewModel.clearCurrentSearch(currentModeStr)
        }
    }
    
    val appState by appViewModel.uiState.collectAsState()

    val autoNewSearchStr by settingsViewModel.autoNewSearch.collectAsState()
    val autoNewSearch = autoNewSearchStr.toBooleanStrictOrNull() ?: false
    val enterToSendStr by settingsViewModel.enterToSend.collectAsState()
    val enterToSend = enterToSendStr.toBooleanStrictOrNull() ?: false
    
    val toggleAutoNewSearch = {
        settingsViewModel.saveSetting("AUTO_NEW_SEARCH", (!autoNewSearch).toString())
    }

    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    val bgDict by settingsViewModel.bgDict.collectAsState()
    val bgCompare by settingsViewModel.bgCompare.collectAsState()
    val bgTranslate by settingsViewModel.bgTranslate.collectAsState()
    val bgExplain by settingsViewModel.bgExplain.collectAsState()
    val bgCorrect by settingsViewModel.bgCorrect.collectAsState()
    val bgBlur by settingsViewModel.bgBlurRadius.collectAsState()
        val bgUniversal by settingsViewModel.bgUniversal.collectAsState()
    val bgOpacity by settingsViewModel.bgOpacity.collectAsState()

    val activeBg = when {
        currentScreen != Screen.MAIN -> null
        currentMode == 0 -> bgDict ?: bgUniversal
        currentMode == 1 -> bgCompare ?: bgUniversal
        currentMode == 2 -> bgTranslate ?: bgUniversal
        currentMode == 3 -> bgExplain ?: bgUniversal
        currentMode == 4 -> bgCorrect ?: bgUniversal
        else -> null
    }

    LaunchedEffect(activeBg) { if (activeBg == null) onColorExtracted(null) }

    Box(modifier = Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { focusManager.clearFocus() }) {

        if (activeBg != null) {
            coil.compose.AsyncImage(
                model = activeBg,
                contentDescription = null,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.fillMaxSize().blur(bgBlur.dp).alpha(bgOpacity),
                onSuccess = { state ->
                    val bitmap = (state.result.drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap
                    if (bitmap != null) {
                        androidx.palette.graphics.Palette.from(bitmap).generate { palette ->
                            val swatch = palette?.vibrantSwatch ?: palette?.mutedSwatch ?: palette?.dominantSwatch
                            if (swatch != null) {
                                onColorExtracted(androidx.compose.ui.graphics.Color(swatch.rgb))
                            }
                        }
                    }
                }
            )
        }
    val modes = listOf(
        TabItem("Dict", Icons.Default.Search),
        TabItem("Compare", Icons.AutoMirrored.Filled.CompareArrows),
        TabItem("Translate", Icons.Default.Translate),
        TabItem("Explain", Icons.Default.Description),
        TabItem("Correct", Icons.Default.Spellcheck)
    )

        val quoteMode by settingsViewModel.quoteMode.collectAsState()
        val quoteStyleStr by settingsViewModel.quoteStyle.collectAsState()
        val fontFamily = when(quoteStyleStr) { "Serif" -> androidx.compose.ui.text.font.FontFamily.Serif; "Sans Serif" -> androidx.compose.ui.text.font.FontFamily.SansSerif; "Monospace" -> androidx.compose.ui.text.font.FontFamily.Monospace; "Cursive" -> androidx.compose.ui.text.font.FontFamily.Cursive; else -> androidx.compose.ui.text.font.FontFamily.Default }

        val quotesList by settingsViewModel.allQuotes.collectAsState()
        val shuffleEnabledQuotes by settingsViewModel.shuffleEnabledQuotes.collectAsState()
        
        val activeShuffleList = shuffleEnabledQuotes?.filter { it in quotesList }?.takeIf { it.isNotEmpty() } ?: quotesList

        var shuffledQuote by remember { mutableStateOf(activeShuffleList.randomOrNull() ?: "") }

        LaunchedEffect(currentMode, activeShuffleList) { if (quoteMode == "Shuffle") shuffledQuote = activeShuffleList.randomOrNull() ?: "" }

        val displayQuote = when (quoteMode) { "None" -> null; "Shuffle" -> shuffledQuote; else -> quoteMode }



        if (displayQuote != null && currentScreen == Screen.MAIN) {

            Box(modifier = Modifier.fillMaxSize().padding(bottom = 120.dp), contentAlignment = Alignment.Center) {

                Text(

                    text = displayQuote,

                    style = MaterialTheme.typography.headlineMedium.copy(fontFamily = fontFamily, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic),

                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.3f),

                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,

                    modifier = Modifier.padding(32.dp)

                )

            }

        }
    Scaffold(containerColor = androidx.compose.ui.graphics.Color.Transparent,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (isLandscape) 40.dp else 48.dp)
                    .background(androidx.compose.ui.graphics.Color.Transparent)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (currentScreen == Screen.MAIN) {
                        IconButton(onClick = { 
                            appViewModel.clearHistoryUnseen()
                            val modeStr = when (currentMode) {
                                0 -> "dict"
                                1 -> "compare"
                                2 -> "translate"
                                3 -> "explain"
                                4 -> "correct"
                                else -> "dict"
                            }
                            historyViewModel.setMode(modeStr)
                            currentScreen = Screen.HISTORY 
                        }) {
                            if (appState.unseenHistoryItems > 0) {
                                BadgedBox(badge = { Badge { Text(appState.unseenHistoryItems.toString()) } }) {
                                    Icon(Icons.Default.History, contentDescription = "History")
                                }
                            } else {
                                Icon(Icons.Default.History, contentDescription = "History")
                            }
                        }
                    } else {
                        IconButton(onClick = { currentScreen = Screen.MAIN }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                    
                    Column(modifier = Modifier.padding(start = 4.dp), horizontalAlignment = Alignment.Start) {
                        Text("AI Dict", style = if (isLandscape) MaterialTheme.typography.titleSmall else MaterialTheme.typography.titleMedium)
                        var expanded by remember { mutableStateOf(false) }
                        Box {
                            Row(
                                verticalAlignment = Alignment.CenterVertically, 
                                modifier = Modifier.clickable { expanded = true }.padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.Start
                            ) {
                                Text(appState.activeProfile?.name ?: "Default", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                Icon(Icons.Default.ArrowDropDown, contentDescription = "Select", modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                            }
                            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                appState.profiles.forEach { profile ->
                                    DropdownMenuItem(
                                        text = { Text(profile.name) },
                                        onClick = { 
                                            appViewModel.setActiveProfile(profile)
                                            searchViewModel.clearCurrentSearch()
                                            historyViewModel.setActiveSession(null)
                                            expanded = false 
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (currentScreen == Screen.MAIN) {
                        androidx.compose.material3.Text(
                            text = modes[currentMode].title,
                            style = androidx.compose.material3.MaterialTheme.typography.titleSmall,
                            modifier = androidx.compose.ui.Modifier.padding(end = 8.dp),
                            color = androidx.compose.material3.MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)
                        )
                        val currentWord = searchViewModel.dictState.collectAsState().value.word?.term 
                            ?: searchViewModel.translateState.collectAsState().value.word?.term 
                            ?: searchViewModel.explainState.collectAsState().value.word?.term 
                            ?: searchViewModel.compareState.collectAsState().value.word?.term
                            ?: searchViewModel.correctState.collectAsState().value.word?.term
                            ?: searchViewModel.searchInput

                        ExternalDictButton(settingsViewModel, currentWord)
                                                IconButton(onClick = { showManualDialog = true }) {
                            Icon(Icons.Default.HelpOutline, contentDescription = "Help")
                        }
                        IconButton(onClick = { currentScreen = Screen.NOTES }) {
                            Icon(Icons.Default.EditNote, contentDescription = "Notes")
                        }
                        IconButton(onClick = { currentScreen = Screen.SETTINGS }) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    } else {
                        Spacer(modifier = Modifier.width(48.dp))
                    }
                }
            }
        },
        bottomBar = {
            if (currentScreen == Screen.MAIN && !isLandscape) {
                Row(
                    modifier = Modifier.fillMaxWidth().height(48.dp).background(androidx.compose.ui.graphics.Color.Transparent),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    modes.forEachIndexed { index, tab ->
                        val isSelected = currentMode == index
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .clickable {
                                    if (currentMode != index) {
                                        coroutineScope.launch { pagerState.animateScrollToPage(index) }
                                    }
                                }
                                .padding(horizontal = 16.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                tab.icon, 
                                contentDescription = tab.title, 
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(28.dp) // slightly larger since there's no text
                            )
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Row(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            if (currentScreen == Screen.MAIN && isLandscape) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
                    modifier = Modifier.fillMaxHeight().width(52.dp)
                ) {
                    Column(
                        modifier = Modifier.fillMaxHeight().padding(vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.SpaceEvenly
                    ) {
                        modes.forEachIndexed { index, tab ->
                            val isSelected = currentMode == index
                            IconButton(
                                onClick = {
                                    if (currentMode != index) {
                                        coroutineScope.launch { pagerState.animateScrollToPage(index) }
                                    }
                                },
                                modifier = Modifier
                                    .size(38.dp)
                                    .background(
                                        if (isSelected) MaterialTheme.colorScheme.primaryContainer else androidx.compose.ui.graphics.Color.Transparent,
                                        CircleShape
                                    )
                            ) {
                                Icon(
                                    tab.icon,
                                    contentDescription = tab.title,
                                    tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }
            }
            Surface(modifier = Modifier.weight(1f).fillMaxHeight(), color = androidx.compose.ui.graphics.Color.Transparent) {
                when (currentScreen) {
                                Screen.SETTINGS -> SettingsScreen(settingsViewModel)
                Screen.NOTES -> NotesScreen(notesViewModel)
                Screen.HISTORY -> {
                    LaunchedEffect(appState.activeProfile?.id) {
                        historyViewModel.setActiveProfileId(appState.activeProfile?.id ?: 1)
                    }
                    HistoryScreen(
                        appViewModel = appViewModel,
                        onNavigateToChat = { word ->
                            searchViewModel.loadWord(word)
                            val modeInt = when (word.mode) {
                                "dict" -> 0
                                "compare" -> 1
                                "translate" -> 2
                                "explain" -> 3
                                "correct" -> 4
                                else -> 0
                            }
                            coroutineScope.launch { pagerState.scrollToPage(modeInt) }
                            currentScreen = Screen.MAIN
                        },
                        onRestartChat = { word, msg, fallback ->
                            searchViewModel.retryMessage(msg, fallback, word.mode, word)
                        },
                        viewModel = historyViewModel,
                        windowSizeClass = windowSizeClass,
                        searchViewModel = searchViewModel
                    )
                }
                Screen.MAIN -> {
                    val pid = appState.activeProfile?.id ?: 1
                    
                    
        val context = androidx.compose.ui.platform.LocalContext.current

        
        val leftThreshold = 250f
        val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
        
        val coroutineScope = rememberCoroutineScope()
        val leftOverscrollAnim = remember { androidx.compose.animation.core.Animatable(0f) }
        val leftOverscroll = leftOverscrollAnim.value
        
        val leftOverscrollConnection = remember(pagerState) {
            object : NestedScrollConnection {
                var toggled = false
                
                override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                    if (source != androidx.compose.ui.input.nestedscroll.NestedScrollSource.Drag) return Offset.Zero
                    if (pagerState.currentPage == 0 && kotlin.math.abs(pagerState.currentPageOffsetFraction) <= 0.05f) {
                        if (leftOverscrollAnim.value > 0f && available.x < 0f) {
                            val consumedX = minOf(-available.x, leftOverscrollAnim.value)
                            coroutineScope.launch { leftOverscrollAnim.snapTo(leftOverscrollAnim.value - consumedX) }
                            return Offset(-consumedX, 0f)
                        } else if (available.x > 0f) {
                            coroutineScope.launch { leftOverscrollAnim.snapTo(leftOverscrollAnim.value + available.x * 0.5f) }
                            
                            if (leftOverscrollAnim.value > leftThreshold && !toggled) {
                                toggled = true
                                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                                if (com.aidict.app.FloatingBubbleService.isRunning) {
                                    val intent = android.content.Intent(context, com.aidict.app.FloatingBubbleService::class.java)
                                    context.stopService(intent)
                                    android.widget.Toast.makeText(context, "Bubble Disabled", android.widget.Toast.LENGTH_SHORT).show()
                                } else {
                                    if (android.provider.Settings.canDrawOverlays(context)) {
                                        val intent = android.content.Intent(context, com.aidict.app.FloatingBubbleService::class.java)
                                        androidx.core.content.ContextCompat.startForegroundService(context, intent)
                                        android.widget.Toast.makeText(context, "Bubble Enabled", android.widget.Toast.LENGTH_SHORT).show()
                                    } else {
                                        android.widget.Toast.makeText(context, "Overlay permission required", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                            return Offset(available.x, 0f)
                        }
                    }
                    return Offset.Zero
                }

                override suspend fun onPreFling(available: Velocity): Velocity {
                    if (leftOverscrollAnim.value > 0f) {
                        coroutineScope.launch { leftOverscrollAnim.animateTo(0f) }
                        toggled = false
                    }
                    return Velocity.Zero
                }
                
                override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
                    if (leftOverscrollAnim.value > 0f) {
                        coroutineScope.launch { leftOverscrollAnim.animateTo(0f) }
                        toggled = false
                    }
                    return Velocity.Zero
                }
            }
        }


                    val pullRefreshState = androidx.compose.material3.pulltorefresh.rememberPullToRefreshState()
                    
                    if (pullRefreshState.isRefreshing) {
                        LaunchedEffect(Unit) {
                            appViewModel.clearHistoryUnseen()
                            val modeStr = when (currentMode) {
                                0 -> "dict"
                                1 -> "compare"
                                2 -> "translate"
                                3 -> "explain"
                                4 -> "correct"
                                else -> "dict"
                            }
                            historyViewModel.setMode(modeStr)
                            currentScreen = Screen.HISTORY
                            pullRefreshState.endRefresh()
                        }
                    }
                    
                    var bottomOverscroll by remember { mutableFloatStateOf(0f) }
                    val density = androidx.compose.ui.platform.LocalDensity.current
                    val threshold: Float = with(density) { 80.dp.toPx() }
                    
                    val bottomOverscrollConnection = remember {
                        object : androidx.compose.ui.input.nestedscroll.NestedScrollConnection {
                            override fun onPreScroll(available: androidx.compose.ui.geometry.Offset, source: androidx.compose.ui.input.nestedscroll.NestedScrollSource): androidx.compose.ui.geometry.Offset {
                                if (bottomOverscroll > 0f && available.y > 0f) {
                                    val consumed = available.y.coerceAtMost(bottomOverscroll)
                                    bottomOverscroll -= consumed
                                    return androidx.compose.ui.geometry.Offset(0f, consumed)
                                }
                                return androidx.compose.ui.geometry.Offset.Zero
                            }
                            
                            override fun onPostScroll(consumed: androidx.compose.ui.geometry.Offset, available: androidx.compose.ui.geometry.Offset, source: androidx.compose.ui.input.nestedscroll.NestedScrollSource): androidx.compose.ui.geometry.Offset {
                                if (available.y < 0f && source == androidx.compose.ui.input.nestedscroll.NestedScrollSource.Drag) {
                                    bottomOverscroll -= available.y
                                    return androidx.compose.ui.geometry.Offset(0f, available.y)
                                }
                                return androidx.compose.ui.geometry.Offset.Zero
                            }
                            
                            override suspend fun onPreFling(available: androidx.compose.ui.unit.Velocity): androidx.compose.ui.unit.Velocity {
                                if (bottomOverscroll > threshold) {
                                    currentScreen = Screen.NOTES
                                }
                                bottomOverscroll = 0f
                                return androidx.compose.ui.unit.Velocity.Zero
                            }
                        }
                    }
                    
                    Box(modifier = Modifier.fillMaxSize().nestedScroll(pullRefreshState.nestedScrollConnection).nestedScroll(bottomOverscrollConnection).nestedScroll(leftOverscrollConnection)) {
                        val onMoveWordToMode: (com.aidict.app.data.entities.Word, String) -> Unit = { word, targetMode ->
                            searchViewModel.moveWordToModeAndRegenerate(word, targetMode)
                            val pageIndex = when (targetMode) {
                                "dict" -> 0
                                "compare" -> 1
                                "translate" -> 2
                                "explain" -> 3
                                "correct" -> 4
                                else -> 0
                            }
                            coroutineScope.launch { pagerState.animateScrollToPage(pageIndex) }
                        }
                        androidx.compose.foundation.pager.HorizontalPager(
                            state = pagerState,
                            modifier = Modifier.fillMaxSize().graphicsLayer { translationX = leftOverscroll * 0.3f },
                            beyondBoundsPageCount = 1
                        ) { page ->
                            when (page) {
                                0 -> SearchScreen(searchViewModel, pid, autoNewSearch = autoNewSearch, onToggleAutoNewSearch = toggleAutoNewSearch, enterToSend = enterToSend, onMoveToMode = onMoveWordToMode)
                                1 -> CompareScreen(searchViewModel, pid, autoNewSearch = autoNewSearch, onToggleAutoNewSearch = toggleAutoNewSearch, enterToSend = enterToSend, onMoveToMode = onMoveWordToMode)
                                2 -> TranslateScreen(searchViewModel, pid, autoNewSearch = autoNewSearch, onToggleAutoNewSearch = toggleAutoNewSearch, enterToSend = enterToSend, onMoveToMode = onMoveWordToMode)
                                3 -> ExplainScreen(searchViewModel, pid, autoNewSearch = autoNewSearch, onToggleAutoNewSearch = toggleAutoNewSearch, enterToSend = enterToSend, onMoveToMode = onMoveWordToMode)
                                4 -> CorrectScreen(searchViewModel, pid, autoNewSearch = autoNewSearch, onToggleAutoNewSearch = toggleAutoNewSearch, enterToSend = enterToSend, onMoveToMode = onMoveWordToMode)
                            }
                        }
                        
                        androidx.compose.material3.pulltorefresh.PullToRefreshContainer(
                            state = pullRefreshState,
                            modifier = Modifier.align(Alignment.TopCenter)
                        )
                        
                        // Left Edge Bubble Toggle Indicator
                        if (leftOverscroll > 0f) {
                            val progress = (leftOverscroll / leftThreshold).coerceIn(0f, 1f)
                            val iconOffset = (leftOverscroll - 50f).coerceAtMost(100f)
                            if (iconOffset > 0f) {
                                androidx.compose.foundation.layout.Box(
                                    modifier = Modifier
                                        .align(Alignment.CenterStart)
                                        .offset(x = (iconOffset - 24f).dp)
                                        .size(48.dp)
                                        .background(
                                            if (progress >= 1f) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                            shape = androidx.compose.foundation.shape.CircleShape
                                        )
                                        .padding(12.dp)
                                ) {
                                    Icon(
                                        imageVector = if (com.aidict.app.FloatingBubbleService.isRunning) Icons.Default.Close else Icons.Default.Add,
                                        contentDescription = "Toggle Bubble",
                                        tint = if (progress >= 1f) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.fillMaxSize().alpha(progress)
                                    )
                                }
                            }
                        }
                        
                        if (bottomOverscroll > 0f) {
                            val progress = (bottomOverscroll / threshold).coerceIn(0f, 1f)
                            Icon(
                                imageVector = Icons.Default.EditNote,
                                contentDescription = "Quick Notes",
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(bottom = (progress * 60).dp)
                                    .alpha(progress)
                                    .size(32.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
    }
}
}
}


@Composable
fun ExternalDictButton(viewModel: com.aidict.app.ui.viewmodels.SettingsViewModel, currentWord: String?) {
    val externalDictsStr by viewModel.getSettingFlow("EXTERNAL_DICTS", "Cambridge|https://dictionary.cambridge.org/dictionary/english/{{str}}").collectAsState()
    val dicts = remember(externalDictsStr) {
        if (externalDictsStr.isBlank()) emptyList()
        else externalDictsStr.split(",").mapNotNull { 
            val parts = it.split("|")
            if (parts.size >= 2) Triple(parts[0], parts[1], parts.getOrNull(2) ?: "") else null
        }
    }
    
    if (dicts.isNotEmpty()) {
        val context = androidx.compose.ui.platform.LocalContext.current
        var expanded by remember { mutableStateOf(false) }
        
        Box {
            androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(end = 4.dp)) {
                IconButton(onClick = {
                    if (currentWord.isNullOrBlank()) {
                        android.widget.Toast.makeText(context, "Search a word first", android.widget.Toast.LENGTH_SHORT).show()
                        return@IconButton
                    }
                    val urlTemplate = dicts.first().second
                    val url = urlTemplate.replace("{{str}}", currentWord.trim()).replace("%s", currentWord.trim())
                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                    context.startActivity(intent)
                }) {
                    val firstIcon = dicts.first().third
                    if (firstIcon.isNotBlank()) {
                        coil.compose.AsyncImage(
                            model = firstIcon,
                            contentDescription = "External Dict",
                            modifier = Modifier.size(24.dp)
                        )
                    } else {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "External Dict")
                    }
                }
                
                if (dicts.size > 1) {
                    IconButton(onClick = { expanded = true }, modifier = Modifier.size(24.dp)) {
                        Icon(androidx.compose.material.icons.Icons.Default.ArrowDropDown, contentDescription = "More")
                    }
                }
            }
            
            androidx.compose.material3.DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                dicts.forEach { (name, urlTemplate, iconUrl) ->
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text(name) },
                        leadingIcon = {
                            if (iconUrl.isNotBlank()) {
                                coil.compose.AsyncImage(model = iconUrl, contentDescription = name, modifier = Modifier.size(24.dp))
                            } else {
                                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = name, modifier = Modifier.size(20.dp))
                            }
                        },
                        onClick = {
                            expanded = false
                            if (currentWord.isNullOrBlank()) {
                                android.widget.Toast.makeText(context, "Search a word first", android.widget.Toast.LENGTH_SHORT).show()
                            } else {
                                val url = urlTemplate.replace("{{str}}", currentWord.trim()).replace("%s", currentWord.trim())
                                val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                context.startActivity(intent)
                            }
                        }
                    )
                }
            }
        }
    }
}
