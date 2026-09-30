package com.aidict.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.BorderStroke
import androidx.lifecycle.lifecycleScope
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.LocalTranslationEngine
import com.aidict.app.data.entities.AppSetting
import com.aidict.app.ui.components.ManageOfflineModelsDialog
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale

class TranslateActivity : ComponentActivity(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var isTtsReady = false

    private val inputQueryState = mutableStateOf("")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this, this)

        val extracted = extractText(intent)
        inputQueryState.value = extracted

        val database = AppDatabase.getDatabase(this)

        setContent {
            TranslateScreenUI(
                database = database,
                initialText = inputQueryState.value,
                onSpeak = { text, langName -> speak(text, langName) },
                onSendToAiDict = { query, targetMode ->
                    val popupIntent = Intent(this, PopupActivity::class.java).apply {
                        action = Intent.ACTION_SEND
                        putExtra(Intent.EXTRA_TEXT, query)
                        putExtra("EXTRA_MODE", targetMode)
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    }
                    startActivity(popupIntent)
                    finish()
                },
                onClose = { finish() }
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val extracted = extractText(intent)
        if (extracted.isNotBlank()) {
            inputQueryState.value = extracted
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            isTtsReady = true
        }
    }

    private fun speak(text: String, langName: String) {
        if (!isTtsReady || tts == null || text.isBlank()) return
        val tag = LocalTranslationEngine.getLanguageTag(langName) ?: "en"
        val locale = Locale.forLanguageTag(tag)
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "translate_tts_${System.currentTimeMillis()}")
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.onDestroy()
    }

    private fun extractText(intent: Intent?): String {
        if (intent == null) return ""
        return intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            ?: intent.getStringExtra(Intent.EXTRA_TEXT)
            ?: intent.getStringExtra("EXTRA_QUERY")
            ?: intent.getStringExtra(android.app.SearchManager.QUERY)
            ?: ""
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TranslateScreenUI(
    database: AppDatabase,
    initialText: String,
    onSpeak: (String, String) -> Unit,
    onSendToAiDict: (String, String) -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val clipboardManager = remember { context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager }
    val coroutineScope = rememberCoroutineScope()

    var sourceText by remember { mutableStateOf(initialText) }
    var translatedText by remember { mutableStateOf("") }
    var detectedSourceLang by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var isDownloadingModel by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    var sourceLanguage by remember { mutableStateOf("Auto Detect") }
    var targetLanguage by remember { mutableStateOf("English") }
    var mtTier by remember { mutableStateOf(LocalTranslationEngine.Tier.NORMAL) }
    var profileId by remember { mutableIntStateOf(1) }
    var appTheme by remember { mutableStateOf("tokyonight") }
    var showManageModelsDialog by remember { mutableStateOf(false) }

    val downloadedModelTags by LocalTranslationEngine.downloadedModelsFlow.collectAsState()
    var isDownloadingInlineTag by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        LocalTranslationEngine.refreshDownloadedModels()
        val savedProfileId = database.appDao().getSetting("ACTIVE_PROFILE_ID")?.value?.toIntOrNull()
        val defaultProfile = database.appDao().getDefaultProfile()
        val pId = savedProfileId ?: defaultProfile?.id ?: 1
        profileId = pId
        sourceLanguage = database.appDao().getSetting("CORRECT_SOURCE")?.value ?: "Auto Detect"
        targetLanguage = database.appDao().getSetting("CORRECT_TARGET")?.value ?: "English"
        val tierStr = database.appDao().getSetting("CORRECT_MT_TIER")?.value ?: "normal"
        mtTier = if (tierStr == "strong") LocalTranslationEngine.Tier.STRONG else LocalTranslationEngine.Tier.NORMAL
        appTheme = database.appDao().getSetting("APP_THEME")?.value ?: "tokyonight"
    }

    val colorScheme = when (appTheme) {
        "light" -> lightColorScheme()
        "dark" -> darkColorScheme()
        "nord" -> com.aidict.app.ui.theme.NordColors
        "dracula" -> com.aidict.app.ui.theme.DraculaColors
        "tokyonight" -> com.aidict.app.ui.theme.TokyoNightColors
        else -> com.aidict.app.ui.theme.TokyoNightColors
    }

    val supportedLanguages = remember { LocalTranslationEngine.getSupportedLanguages() }
    val sourceOptions = remember { listOf("Auto Detect") + supportedLanguages }

    val targetTag = remember(targetLanguage) { LocalTranslationEngine.getLanguageTag(targetLanguage) }
    val isTargetDownloaded = targetTag != null && downloadedModelTags.contains(targetTag)

    val sourceTag = remember(sourceLanguage) { LocalTranslationEngine.getLanguageTag(sourceLanguage) }
    val isSourceDownloaded = sourceLanguage == "Auto Detect" || (sourceTag != null && downloadedModelTags.contains(sourceTag))

    var translationJob by remember { mutableStateOf<Job?>(null) }

    fun doTranslate(text: String, src: String, tgt: String, tier: LocalTranslationEngine.Tier) {
        val trimmed = text.trim()
        if (trimmed.isBlank()) {
            translatedText = ""
            errorMessage = null
            isLoading = false
            return
        }

        translationJob?.cancel()
        translationJob = coroutineScope.launch {
            isLoading = true
            errorMessage = null
            isDownloadingModel = false

            val result = LocalTranslationEngine.translate(
                text = trimmed,
                sourceLanguage = src,
                targetLanguage = tgt,
                tier = tier,
                onDownloadingModel = { downloading ->
                    isDownloadingModel = downloading
                }
            )

            isLoading = false
            isDownloadingModel = false

            if (result.isSuccess) {
                val res = result.getOrThrow()
                translatedText = res.translatedText
                detectedSourceLang = res.sourceLanguageName
                errorMessage = null
            } else {
                translatedText = ""
                errorMessage = result.exceptionOrNull()?.localizedMessage ?: "Translation failed"
            }
        }
    }

    // Trigger initial translation when sourceText or languages change
    LaunchedEffect(sourceText, sourceLanguage, targetLanguage, mtTier) {
        delay(200) // Small debounce
        doTranslate(sourceText, sourceLanguage, targetLanguage, mtTier)
    }

    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val isLandscape = configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    val isTablet = configuration.screenWidthDp >= 600

    MaterialTheme(colorScheme = colorScheme) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.55f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null
                ) {
                    onClose()
                },
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(if (isLandscape) (if (isTablet) 0.96f else 0.99f) else if (isTablet) 0.85f else 0.92f)
                    .then(
                        if (isLandscape) Modifier.fillMaxHeight(0.96f)
                        else Modifier.widthIn(max = 520.dp)
                    )
                    .padding(vertical = if (isLandscape) 4.dp else 24.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { /* prevent click-through */ },
                shape = RoundedCornerShape(if (isLandscape) 12.dp else 20.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 8.dp,
                shadowElevation = 12.dp
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(if (isLandscape) 10.dp else 16.dp)
                ) {
                    // Header Bar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Translate,
                            contentDescription = "Translate",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(if (isLandscape) 20.dp else 24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "AI Dict Translate",
                            style = if (isLandscape) MaterialTheme.typography.titleSmall else MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        Spacer(Modifier.weight(1f))

                        // Tier selector chip
                        FilterChip(
                            selected = mtTier == LocalTranslationEngine.Tier.STRONG,
                            onClick = {
                                val newTier = if (mtTier == LocalTranslationEngine.Tier.NORMAL) {
                                    LocalTranslationEngine.Tier.STRONG
                                } else {
                                    LocalTranslationEngine.Tier.NORMAL
                                }
                                mtTier = newTier
                                coroutineScope.launch {
                                    database.appDao().insertSetting(AppSetting("CORRECT_MT_TIER", newTier.id))
                                }
                            },
                            label = {
                                Text(
                                    text = if (mtTier == LocalTranslationEngine.Tier.STRONG) "Strong (NLLB)" else "Normal (Offline)",
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = if (mtTier == LocalTranslationEngine.Tier.STRONG) Icons.Default.Check else Icons.Default.OfflinePin,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp)
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        )

                        Spacer(Modifier.width(4.dp))

                        IconButton(
                            onClick = { showManageModelsDialog = true },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Default.CloudDownload,
                                contentDescription = "Manage Offline Models",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        Spacer(Modifier.width(2.dp))

                        IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    if (showManageModelsDialog) {
                        ManageOfflineModelsDialog(onDismiss = {
                            showManageModelsDialog = false
                            coroutineScope.launch {
                                LocalTranslationEngine.refreshDownloadedModels()
                            }
                        })
                    }

                    Spacer(Modifier.height(if (isLandscape) 4.dp else 12.dp))

                    // Language Selector Bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 8.dp, vertical = if (isLandscape) 2.dp else 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        // Source Language Menu
                        var srcExpanded by remember { mutableStateOf(false) }
                        Box(modifier = Modifier.weight(1f)) {
                            TextButton(
                                onClick = { srcExpanded = true },
                                modifier = Modifier.fillMaxWidth(),
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = if (sourceLanguage == "Auto Detect" && !detectedSourceLang.isNullOrBlank()) {
                                            "Auto (${detectedSourceLang})"
                                        } else {
                                            sourceLanguage
                                        },
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    if (sourceLanguage != "Auto Detect") {
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
                                            val tag = LocalTranslationEngine.getLanguageTag(lang)
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
                                            sourceLanguage = lang
                                            srcExpanded = false
                                            coroutineScope.launch {
                                                database.appDao().insertSetting(AppSetting("CORRECT_SOURCE", lang))
                                            }
                                        }
                                    )
                                }
                            }
                        }

                        // Swap Button
                        IconButton(
                            onClick = {
                                if (sourceLanguage != "Auto Detect") {
                                    val temp = sourceLanguage
                                    sourceLanguage = targetLanguage
                                    targetLanguage = temp
                                    coroutineScope.launch {
                                        database.appDao().insertSetting(AppSetting("CORRECT_SOURCE", sourceLanguage))
                                        database.appDao().insertSetting(AppSetting("CORRECT_TARGET", targetLanguage))
                                    }
                                } else if (!detectedSourceLang.isNullOrBlank()) {
                                    sourceLanguage = targetLanguage
                                    targetLanguage = detectedSourceLang!!
                                    coroutineScope.launch {
                                        database.appDao().insertSetting(AppSetting("CORRECT_SOURCE", sourceLanguage))
                                        database.appDao().insertSetting(AppSetting("CORRECT_TARGET", targetLanguage))
                                    }
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

                        // Target Language Menu
                        var tgtExpanded by remember { mutableStateOf(false) }
                        Box(modifier = Modifier.weight(1f)) {
                            TextButton(
                                onClick = { tgtExpanded = true },
                                modifier = Modifier.fillMaxWidth(),
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = targetLanguage,
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
                                        val tag = LocalTranslationEngine.getLanguageTag(lang)
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
                                            targetLanguage = lang
                                            tgtExpanded = false
                                            coroutineScope.launch {
                                                database.appDao().insertSetting(AppSetting("CORRECT_TARGET", lang))
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Inline Model Download Banner if pack is needed
                    if (!isTargetDownloaded || !isSourceDownloaded) {
                        val missingLangName = if (!isTargetDownloaded) targetLanguage else sourceLanguage
                        val missingTag = LocalTranslationEngine.getLanguageTag(missingLangName) ?: ""
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
                                                val success = LocalTranslationEngine.downloadModel(missingTag)
                                                isDownloadingInlineTag = null
                                                if (success) {
                                                    Toast.makeText(context, "$missingLangName model installed!", Toast.LENGTH_SHORT).show()
                                                    doTranslate(sourceText, sourceLanguage, targetLanguage, mtTier)
                                                } else {
                                                    Toast.makeText(context, "Failed to download $missingLangName model.", Toast.LENGTH_SHORT).show()
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
                        // Landscape 2-Column Side-by-Side Layout
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Left: Source Box
                            Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                                SourceInputComposable(
                                    sourceText = sourceText,
                                    onSourceTextChange = { sourceText = it },
                                    detectedSourceLang = detectedSourceLang,
                                    sourceLanguage = sourceLanguage,
                                    onSpeak = onSpeak,
                                    clipboardManager = clipboardManager,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }

                            // Right: Result Card
                            Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                                TargetResultComposable(
                                    isLoading = isLoading,
                                    isDownloadingModel = isDownloadingModel,
                                    errorMessage = errorMessage,
                                    translatedText = translatedText,
                                    targetLanguage = targetLanguage,
                                    isTargetDownloaded = isTargetDownloaded,
                                    onRetry = { doTranslate(sourceText, sourceLanguage, targetLanguage, mtTier) },
                                    onSpeak = onSpeak,
                                    clipboardManager = clipboardManager,
                                    context = context,
                                    isLandscape = true,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                        }

                        Spacer(Modifier.height(4.dp))

                        // Compact Deepen Bar
                        AiDeepenBar(
                            isLandscape = true,
                            sourceText = sourceText,
                            onSendToAiDict = onSendToAiDict
                        )
                    } else {
                        // Portrait Vertical Scroll Layout
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .verticalScroll(rememberScrollState())
                        ) {
                            SourceInputComposable(
                                sourceText = sourceText,
                                onSourceTextChange = { sourceText = it },
                                detectedSourceLang = detectedSourceLang,
                                sourceLanguage = sourceLanguage,
                                onSpeak = onSpeak,
                                clipboardManager = clipboardManager,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 100.dp, max = 160.dp)
                            )

                            Spacer(Modifier.height(12.dp))

                            TargetResultComposable(
                                isLoading = isLoading,
                                isDownloadingModel = isDownloadingModel,
                                errorMessage = errorMessage,
                                translatedText = translatedText,
                                targetLanguage = targetLanguage,
                                isTargetDownloaded = isTargetDownloaded,
                                onRetry = { doTranslate(sourceText, sourceLanguage, targetLanguage, mtTier) },
                                onSpeak = onSpeak,
                                clipboardManager = clipboardManager,
                                context = context,
                                isLandscape = false,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .wrapContentHeight()
                            )

                            Spacer(Modifier.height(16.dp))

                            AiDeepenBar(
                                isLandscape = false,
                                sourceText = sourceText,
                                onSendToAiDict = onSendToAiDict
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SourceInputComposable(
    sourceText: String,
    onSourceTextChange: (String) -> Unit,
    detectedSourceLang: String?,
    sourceLanguage: String,
    onSpeak: (String, String) -> Unit,
    clipboardManager: ClipboardManager,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = sourceText,
        onValueChange = onSourceTextChange,
        modifier = modifier,
        placeholder = { Text("Enter text to translate...") },
        textStyle = MaterialTheme.typography.bodyLarge,
        shape = RoundedCornerShape(12.dp),
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (sourceText.isNotBlank()) {
                    IconButton(onClick = { onSourceTextChange("") }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(18.dp))
                    }
                } else {
                    IconButton(
                        onClick = {
                            val clip = clipboardManager.primaryClip?.getItemAt(0)?.text?.toString() ?: ""
                            if (clip.isNotBlank()) {
                                onSourceTextChange(clip)
                            }
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.ContentPaste, contentDescription = "Paste", modifier = Modifier.size(18.dp))
                    }
                }
                if (sourceText.isNotBlank()) {
                    IconButton(
                        onClick = { onSpeak(sourceText, detectedSourceLang ?: sourceLanguage) },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.VolumeUp, contentDescription = "Listen", modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    )
}

@Composable
private fun TargetResultComposable(
    isLoading: Boolean,
    isDownloadingModel: Boolean,
    errorMessage: String?,
    translatedText: String,
    targetLanguage: String,
    isTargetDownloaded: Boolean,
    onRetry: () -> Unit,
    onSpeak: (String, String) -> Unit,
    clipboardManager: ClipboardManager,
    context: Context,
    isLandscape: Boolean = false,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
    ) {
        Column(
            modifier = if (isLandscape) Modifier.fillMaxSize().padding(12.dp)
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
                    text = "Translation ($targetLanguage)",
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

            // Body
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
                            .padding(vertical = 16.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = if (isDownloadingModel) "Downloading offline language pack (~30MB)..." else "Translating...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                } else if (!errorMessage.isNullOrBlank()) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = errorMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(Modifier.height(6.dp))
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
                            .padding(vertical = 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Translate,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.4f),
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Translation will appear here...",
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
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    IconButton(
                        onClick = { onSpeak(translatedText, targetLanguage) },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.VolumeUp,
                            contentDescription = "Listen translation",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    Spacer(Modifier.width(4.dp))

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
                }
            }
        }
    }
}

@Composable
private fun AiDeepenBar(
    isLandscape: Boolean,
    sourceText: String,
    onSendToAiDict: (String, String) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
    ) {
        if (isLandscape) {
            Row(
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "Deepen with AI LLM:",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.weight(1f))
                FilledTonalButton(
                    onClick = { onSendToAiDict(sourceText, "dict") },
                    modifier = Modifier.height(28.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("📚 Dict", style = MaterialTheme.typography.labelSmall)
                }
                Spacer(Modifier.width(4.dp))
                FilledTonalButton(
                    onClick = { onSendToAiDict(sourceText, "explain") },
                    modifier = Modifier.height(28.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("🧠 Explain", style = MaterialTheme.typography.labelSmall)
                }
                Spacer(Modifier.width(4.dp))
                FilledTonalButton(
                    onClick = { onSendToAiDict(sourceText, "correct") },
                    modifier = Modifier.height(28.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("✍️ Correct", style = MaterialTheme.typography.labelSmall)
                }
            }
        } else {
            Column(modifier = Modifier.padding(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "Need deeper analysis or grammar polish?",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    FilledTonalButton(
                        onClick = { onSendToAiDict(sourceText, "dict") },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                    ) {
                        Text("📚 Dict", style = MaterialTheme.typography.labelSmall)
                    }

                    FilledTonalButton(
                        onClick = { onSendToAiDict(sourceText, "explain") },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                    ) {
                        Text("🧠 Explain", style = MaterialTheme.typography.labelSmall)
                    }

                    FilledTonalButton(
                        onClick = { onSendToAiDict(sourceText, "correct") },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                    ) {
                        Text("✍️ Correct", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
