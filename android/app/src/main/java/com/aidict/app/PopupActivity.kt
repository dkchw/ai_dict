package com.aidict.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.LlmRepository
import com.aidict.app.ui.AppNavigation
import com.aidict.app.ui.viewmodels.HistoryViewModel
import com.aidict.app.ui.viewmodels.SearchViewModel
import com.aidict.app.ui.viewmodels.SettingsViewModel
import com.aidict.app.ui.viewmodels.AppViewModel
import com.aidict.app.ui.viewmodels.NotesViewModel

class PopupActivity : ComponentActivity() {
    companion object {
        var isVisible = false
    }

    private data class SearchTrigger(val text: String, val timestamp: Long = System.currentTimeMillis())
    private val pendingTrigger = androidx.compose.runtime.mutableStateOf<SearchTrigger?>(null)

    override fun onStart() {
        super.onStart()
        isVisible = true
    }

    override fun onStop() {
        super.onStop()
        isVisible = false
    }
    
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == "CLOSE_POPUP") {
            finish()
            return
        }
        val textExtra = extractText(intent)
        if (textExtra.isNotBlank()) {
            pendingTrigger.value = SearchTrigger(textExtra)
        }
    }

    private fun extractText(intent: Intent?): String {
        if (intent == null) return ""
        return intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            ?: intent.getStringExtra(Intent.EXTRA_TEXT)
            ?: intent.getStringExtra("EXTRA_QUERY")
            ?: intent.getStringExtra(android.app.SearchManager.QUERY)
            ?: ""
    }

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val initialText = extractText(intent)
        if (initialText.isNotBlank()) {
            pendingTrigger.value = SearchTrigger(initialText)
        }
        
        val database = AppDatabase.getDatabase(this)
        val repository = LlmRepository(database)
        
        val factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return when {
                    modelClass.isAssignableFrom(SearchViewModel::class.java) -> SearchViewModel(repository, database) as T
                    modelClass.isAssignableFrom(AppViewModel::class.java) -> AppViewModel(database) as T
                    modelClass.isAssignableFrom(HistoryViewModel::class.java) -> HistoryViewModel(database) as T
                    modelClass.isAssignableFrom(SettingsViewModel::class.java) -> SettingsViewModel(database, repository) as T
                    modelClass.isAssignableFrom(NotesViewModel::class.java) -> NotesViewModel(database) as T
                    else -> throw IllegalArgumentException("Unknown ViewModel class")
                }
            }
        }

        setContent {
            val windowSizeClass = calculateWindowSizeClass(this)
            
            val appViewModel: AppViewModel = viewModel(factory = factory)
            val searchViewModel: SearchViewModel = viewModel(factory = factory)
            val historyViewModel: HistoryViewModel = viewModel(factory = factory)
            val settingsViewModel: SettingsViewModel = viewModel(factory = factory)
            val notesViewModel: NotesViewModel = viewModel(factory = factory)
            
            val currentTrigger = pendingTrigger.value
            val targetQuery = currentTrigger?.text?.trim() ?: ""
            val words = if (targetQuery.isNotBlank()) targetQuery.split(Regex("\\s+")).filter { it.isNotBlank() } else emptyList()
            val isMultiWordExplain = words.size > 3
            val explicitModeStr = intent.getStringExtra("EXTRA_MODE")
            val targetMode = when (explicitModeStr?.lowercase()) {
                "dict" -> 0
                "compare" -> 1
                "translate" -> 2
                "explain" -> 3
                "correct" -> 4
                else -> if (isMultiWordExplain) 3 else 0
            }

            LaunchedEffect(currentTrigger) {
                if (currentTrigger != null && currentTrigger.text.isNotBlank()) {
                    val text = currentTrigger.text.trim()
                    val queryWords = text.split(Regex("\\s+")).filter { it.isNotBlank() }
                    val explainMode = queryWords.size > 3

                    kotlinx.coroutines.delay(100) // Brief delay to ensure UI and AppViewModel are ready
                    val profileId = appViewModel.uiState.value.activeProfile?.id ?: 1
                    val explicitMode = intent.getStringExtra("EXTRA_MODE")?.lowercase()
                    when (explicitMode) {
                        "correct" -> {
                            searchViewModel.clearCurrentSearch("correct")
                            searchViewModel.correctInput = text
                            val sourceLang = searchViewModel.getProfileSetting(profileId, "CORRECT_SOURCE") ?: "Auto Detect"
                            val targetLang = searchViewModel.getProfileSetting(profileId, "CORRECT_TARGET") ?: "English"
                            val correctType = searchViewModel.getProfileSetting(profileId, "CORRECT_TYPE") ?: "both"
                            val isCorrectionOnly = correctType == "correction_only"
                            searchViewModel.streamCorrect(text, sourceLang, targetLang, profileId, isCorrectionOnly)
                        }
                        "translate" -> {
                            searchViewModel.clearCurrentSearch("translate")
                            searchViewModel.translateInput = text
                            val sourceLang = searchViewModel.getProfileSetting(profileId, "TRANSLATE_SOURCE") ?: "Auto Detect"
                            val targetLang = searchViewModel.getProfileSetting(profileId, "TRANSLATE_TARGET") ?: "English"
                            searchViewModel.streamTranslation(text, sourceLang, targetLang, profileId)
                        }
                        "dict" -> {
                            searchViewModel.clearCurrentSearch("dict")
                            searchViewModel.searchInput = text
                            val sourceLang = searchViewModel.getProfileSetting(profileId, "DICT_SOURCE") ?: "Auto Detect"
                            val targetLang = searchViewModel.getProfileSetting(profileId, "DICT_TARGET") ?: "English"
                            searchViewModel.searchWord(text, sourceLang, targetLang, profileId)
                        }
                        "explain" -> {
                            searchViewModel.clearCurrentSearch("explain")
                            searchViewModel.explainInput = text
                            val sourceLang = searchViewModel.getProfileSetting(profileId, "EXPLAIN_SOURCE") ?: "Auto Detect"
                            val targetLang = searchViewModel.getProfileSetting(profileId, "EXPLAIN_TARGET") ?: "English"
                            searchViewModel.streamExplain(text, sourceLang, targetLang, profileId)
                        }
                        else -> {
                            if (explainMode) {
                                searchViewModel.clearCurrentSearch("explain")
                                searchViewModel.explainInput = text
                                val sourceLang = searchViewModel.getProfileSetting(profileId, "EXPLAIN_SOURCE") ?: "Auto Detect"
                                val targetLang = searchViewModel.getProfileSetting(profileId, "EXPLAIN_TARGET") ?: "English"
                                searchViewModel.streamExplain(text, sourceLang, targetLang, profileId)
                            } else {
                                searchViewModel.clearCurrentSearch("dict")
                                searchViewModel.searchInput = text
                                val sourceLang = searchViewModel.getProfileSetting(profileId, "DICT_SOURCE") ?: "Auto Detect"
                                val targetLang = searchViewModel.getProfileSetting(profileId, "DICT_TARGET") ?: "English"
                                searchViewModel.searchWord(text, sourceLang, targetLang, profileId)
                            }
                        }
                    }
                }
            }
            
            val isDarkMode by settingsViewModel.isDarkMode.collectAsState()
            val appTheme by settingsViewModel.appTheme.collectAsState()
            
            val colorScheme = when (appTheme) {
                "light" -> lightColorScheme()
                "dark" -> darkColorScheme()
                "nord" -> com.aidict.app.ui.theme.NordColors
                "dracula" -> com.aidict.app.ui.theme.DraculaColors
                "tokyonight" -> com.aidict.app.ui.theme.TokyoNightColors
                else -> com.aidict.app.ui.theme.TokyoNightColors
            }

            val dynamicColorState = remember { androidx.compose.runtime.mutableStateOf<Color?>(null) }
            val dynamicColor = dynamicColorState.value
            val modifiedColorScheme = if (dynamicColor != null) {
                colorScheme.copy(
                    primary = dynamicColor!!,
                    onPrimary = Color.White,
                    primaryContainer = dynamicColor!!.copy(alpha = 0.3f),
                    surfaceTint = dynamicColor!!
                )
            } else colorScheme

            val textScaleStr by settingsViewModel.getSettingFlow("TEXT_SIZE_SCALE", "1.0").collectAsState()
            val textScale = textScaleStr.toFloatOrNull() ?: 1.0f
            
            val systemDensity = androidx.compose.ui.platform.LocalDensity.current
            val initialDensity = androidx.compose.runtime.remember { systemDensity }
            val newDensity = androidx.compose.ui.unit.Density(
                density = initialDensity.density,
                fontScale = initialDensity.fontScale * textScale
            )

            MaterialTheme(colorScheme = modifiedColorScheme) {
                androidx.compose.runtime.CompositionLocalProvider(
                    androidx.compose.ui.platform.LocalDensity provides newDensity
                ) {
                    val config = androidx.compose.ui.platform.LocalConfiguration.current
                    val orientation = config.orientation
                    val isLandscape = orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
                    val screenHeight = androidx.compose.runtime.remember(orientation) { config.screenHeightDp.dp }

                    val isTablet = windowSizeClass.widthSizeClass == androidx.compose.material3.windowsizeclass.WindowWidthSizeClass.Expanded || windowSizeClass.widthSizeClass == androidx.compose.material3.windowsizeclass.WindowWidthSizeClass.Medium
                    val defaultWidth = if (isLandscape) {
                        if (isTablet) 0.96f else 0.99f
                    } else {
                        if (isTablet) 0.6f else 0.95f
                    }
                    val defaultHeight = if (isLandscape) {
                        0.98f
                    } else {
                        if (isTablet) 0.8f else 0.9f
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.5f))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                finish()
                            },
                        contentAlignment = if (isLandscape) Alignment.Center else Alignment.BottomCenter
                    ) {
                        
                        val popupWidthStr by settingsViewModel.getSettingFlow("POPUP_WIDTH", defaultWidth.toString()).collectAsState()
                        val popupHeightStr by settingsViewModel.getSettingFlow("POPUP_HEIGHT", defaultHeight.toString()).collectAsState()
                        
                        // In landscape, dedicate maximum screen estate (96-99%) so content is not squished
                        val popupWidth = if (isLandscape) {
                            if (isTablet) 0.96f else 0.99f
                        } else {
                            popupWidthStr.toFloatOrNull()?.coerceIn(0.3f, 1.0f) ?: defaultWidth
                        }
                        val popupHeight = if (isLandscape) {
                            0.98f
                        } else {
                            popupHeightStr.toFloatOrNull()?.coerceIn(0.3f, 1.0f) ?: defaultHeight
                        }

                        Surface(
                            shape = RoundedCornerShape(if (isLandscape) 8.dp else 16.dp),
                            color = MaterialTheme.colorScheme.background,
                            modifier = Modifier
                                .fillMaxWidth(popupWidth)
                                .then(
                                    if (isLandscape) Modifier.fillMaxHeight(popupHeight)
                                    else Modifier.heightIn(max = screenHeight * popupHeight)
                                )
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null
                                ) {
                                    // Do nothing on internal clicks
                                }
                                .clip(RoundedCornerShape(if (isLandscape) 8.dp else 16.dp))
                        ) {
                            AppNavigation(
                                appViewModel = appViewModel,
                                windowSizeClass = windowSizeClass,
                                searchViewModel = searchViewModel,
                                historyViewModel = historyViewModel,
                                settingsViewModel = settingsViewModel,
                                notesViewModel = notesViewModel,
                                initialMode = targetMode,
                                navigationTrigger = currentTrigger?.timestamp ?: 0L,
                                onColorExtracted = { dynamicColorState.value = it }
                            )
                        }
                    }
                }
            }
        }
    }
}
