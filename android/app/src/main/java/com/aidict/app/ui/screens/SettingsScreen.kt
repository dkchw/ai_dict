package com.aidict.app.ui.screens

import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Add
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.Slider
import androidx.compose.foundation.clickable

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.aidict.app.ui.viewmodels.SettingsViewModel
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.KeyboardArrowDown
import com.aidict.app.data.entities.Profile
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.ui.platform.LocalContext
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import android.content.Intent
import android.net.Uri
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.ui.text.font.FontWeight
import com.aidict.app.ui.viewmodels.ProfileSettingItem
import com.aidict.app.ui.viewmodels.BackupHelper
import kotlinx.coroutines.launch
import android.widget.Toast
import android.os.Build
import android.os.PowerManager
import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner

@OptIn(ExperimentalMaterial3Api::class)

@Composable
fun SettingsGroup(title: String, content: @Composable () -> Unit) {
    var expanded by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded }
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Icon(if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, contentDescription = "Toggle")
            }
            if (expanded) {
                Column(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                    content()
                }
            }
        }
    }
}

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun SettingsScreen(viewModel: SettingsViewModel, modifier: Modifier = Modifier) {
    val apiKey by viewModel.apiKey.collectAsState()
    val appTheme by viewModel.appTheme.collectAsState()
    val profiles by viewModel.profiles.collectAsState()
    val availableModels by viewModel.availableModels.collectAsState()
    val aiConfig by viewModel.aiConfig.collectAsState()

    var showProfileDialog by remember { mutableStateOf(false) }
    var newProfileName by remember { mutableStateOf("") }
    
    var showRenameDialog by remember { mutableStateOf<Profile?>(null) }
    var renameProfileName by remember { mutableStateOf("") }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let {
            scope.launch {
                val result = BackupHelper.exportData(context, viewModel.getDatabase(), it)
                if (result.isSuccess) Toast.makeText(context, "Export successful", Toast.LENGTH_SHORT).show()
                else Toast.makeText(context, "Export failed: ${result.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
    
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let {
            scope.launch {
                val result = BackupHelper.importData(context, viewModel.getDatabase(), it)
                if (result.isSuccess) Toast.makeText(context, "Import successful. Please restart the app.", Toast.LENGTH_LONG).show()
                else Toast.makeText(context, "Import failed: ${result.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    LazyColumn(modifier = modifier.fillMaxSize().padding(16.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { com.aidict.app.utils.AutoUpdater(context).checkForUpdates() },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
                ) { Text("Check Updates") }
                
                Button(
                    onClick = {
                        if (!android.provider.Settings.canDrawOverlays(context)) {
                            val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:${context.packageName}"))
                            context.startActivity(intent)
                        } else {
                            val intent = android.content.Intent(context, com.aidict.app.FloatingBubbleService::class.java)
                            androidx.core.content.ContextCompat.startForegroundService(context, intent)
                            android.widget.Toast.makeText(context, "Floating Bubble Started", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
                ) { Text("Floating Bubble") }
            }
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            val versionName = packageInfo.versionName
            Text(
                "Version: $versionName", 
                style = MaterialTheme.typography.bodySmall, 
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp), 
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
        item { BackgroundSyncSettings(viewModel) }
        item {
        SettingsGroup("Floating UI & Bubble Sizing") {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
                val bubbleSizeStr by viewModel.getSettingFlow("BUBBLE_SIZE", "160").collectAsState()
                val popupWidthStr by viewModel.getSettingFlow("POPUP_WIDTH", "0.95").collectAsState()
                val popupHeightStr by viewModel.getSettingFlow("POPUP_HEIGHT", "0.90").collectAsState()

                var localBubbleSizeStr by remember { mutableStateOf(bubbleSizeStr) }
                LaunchedEffect(bubbleSizeStr) {
                    localBubbleSizeStr = bubbleSizeStr
                }

                var localPopupWidth by remember { mutableStateOf(0.95f) }
                var isDraggingWidth by remember { mutableStateOf(false) }
                LaunchedEffect(popupWidthStr) {
                    if (!isDraggingWidth) localPopupWidth = popupWidthStr.toFloatOrNull() ?: 0.95f
                }

                var localPopupHeight by remember { mutableStateOf(0.90f) }
                var isDraggingHeight by remember { mutableStateOf(false) }
                LaunchedEffect(popupHeightStr) {
                    if (!isDraggingHeight) localPopupHeight = popupHeightStr.toFloatOrNull() ?: 0.90f
                }

                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    Text("Bubble Size (px):", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    OutlinedTextField(
                        value = localBubbleSizeStr,
                        onValueChange = { localBubbleSizeStr = it.filter { char -> char.isDigit() } },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                        modifier = Modifier.width(80.dp),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(onClick = {
                        val newSize = localBubbleSizeStr.toIntOrNull()?.coerceIn(50, 500) ?: 160
                        localBubbleSizeStr = newSize.toString()
                        viewModel.saveSetting("BUBBLE_SIZE", newSize.toString())
                        
                        val intent = android.content.Intent(context, com.aidict.app.FloatingBubbleService::class.java)
                        context.stopService(intent)
                        if (android.provider.Settings.canDrawOverlays(context)) {
                            context.startService(intent)
                            android.widget.Toast.makeText(context, "Bubble Restarted!", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }) {
                        Text("Apply")
                    }
                }

                Text("Popup Width: ${Math.round(localPopupWidth * 100)}%", style = MaterialTheme.typography.bodyMedium)
                androidx.compose.material3.Slider(
                    value = localPopupWidth,
                    onValueChange = { 
                        isDraggingWidth = true
                        localPopupWidth = it 
                    },
                    onValueChangeFinished = { 
                        isDraggingWidth = false
                        val rounded = Math.round(localPopupWidth * 100) / 100f
                        viewModel.saveSetting("POPUP_WIDTH", rounded.toString()) 
                    },
                    valueRange = 0.3f..1.0f
                )

                Text("Popup Height: ${Math.round(localPopupHeight * 100)}%", style = MaterialTheme.typography.bodyMedium)
                androidx.compose.material3.Slider(
                    value = localPopupHeight,
                    onValueChange = { 
                        isDraggingHeight = true
                        localPopupHeight = it 
                    },
                    onValueChangeFinished = { 
                        isDraggingHeight = false
                        val rounded = Math.round(localPopupHeight * 100) / 100f
                        viewModel.saveSetting("POPUP_HEIGHT", rounded.toString()) 
                    },
                    valueRange = 0.3f..1.0f
                )


            }
        }

        }

        item { ExternalDictManager(viewModel) }
        item {
            SettingsGroup("App Behavior") {
                val autoNewSearchStr by viewModel.autoNewSearch.collectAsState()
                val autoNewSearch = autoNewSearchStr.toBooleanStrictOrNull() ?: false
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Auto New Search", style = MaterialTheme.typography.titleMedium)
                        Text("Automatically clear chat and start a new search when submitting", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(checked = autoNewSearch, onCheckedChange = { viewModel.saveSetting("AUTO_NEW_SEARCH", it.toString()) })
                }
                val enterToSendStr by viewModel.enterToSend.collectAsState()
                val enterToSend = enterToSendStr.toBooleanStrictOrNull() ?: false
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Enter to Send", style = MaterialTheme.typography.titleMedium)
                        Text("Pressing enter on the keyboard sends the message instead of new line", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(checked = enterToSend, onCheckedChange = { viewModel.saveSetting("ENTER_TO_SEND", it.toString()) })
                }
            }
        }
        item {
            SettingsGroup("Display & Scaling") {

                
                val textScaleStr by viewModel.getSettingFlow("TEXT_SIZE_SCALE", "1.0").collectAsState()
                var localTextScale by remember { mutableStateOf(1.0f) }
                var isDraggingTextScale by remember { mutableStateOf(false) }
                
                LaunchedEffect(textScaleStr) {
                    if (!isDraggingTextScale) localTextScale = textScaleStr.toFloatOrNull() ?: 1.0f
                }
                
                Text(text = "Text Size: ${java.lang.String.format("%.2f", localTextScale)}", modifier = Modifier.padding(top = 8.dp))
                Slider(
                    value = localTextScale,
                    onValueChange = { 
                        isDraggingTextScale = true
                        localTextScale = it 
                    },
                    onValueChangeFinished = { 
                        isDraggingTextScale = false
                        val rounded = Math.round(localTextScale * 100) / 100f
                        viewModel.saveSetting("TEXT_SIZE_SCALE", rounded.toString()) 
                    },
                    valueRange = 0.5f..2.0f
                )

            }
        }
        
        item {
            SettingsGroup("Backgrounds") {
                val bgUniversal by viewModel.bgUniversal.collectAsState()
                val universalLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION); viewModel.saveSetting("BG_UNIVERSAL", it.toString()) } }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Universal BG (Fallback)"); Button(onClick = { universalLauncher.launch(arrayOf("image/*")) }) { Text(if (bgUniversal == null) "Select" else "Change") }; if (bgUniversal != null) IconButton(onClick = { viewModel.saveSetting("BG_UNIVERSAL", "") }) { Icon(Icons.Default.Delete, "Clear") } }
                
                val bgDict by viewModel.bgDict.collectAsState()
                val dictLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION); viewModel.saveSetting("BG_DICT", it.toString()) } }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Dict Mode BG"); Button(onClick = { dictLauncher.launch(arrayOf("image/*")) }) { Text(if (bgDict == null) "Select" else "Change") }; if (bgDict != null) IconButton(onClick = { viewModel.saveSetting("BG_DICT", "") }) { Icon(Icons.Default.Delete, "Clear") } }

                val bgCompare by viewModel.bgCompare.collectAsState()
                val compareLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION); viewModel.saveSetting("BG_COMPARE", it.toString()) } }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Compare Mode BG"); Button(onClick = { compareLauncher.launch(arrayOf("image/*")) }) { Text(if (bgCompare == null) "Select" else "Change") }; if (bgCompare != null) IconButton(onClick = { viewModel.saveSetting("BG_COMPARE", "") }) { Icon(Icons.Default.Delete, "Clear") } }

                val bgTranslate by viewModel.bgTranslate.collectAsState()
                val translateLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION); viewModel.saveSetting("BG_TRANSLATE", it.toString()) } }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Translate Mode BG"); Button(onClick = { translateLauncher.launch(arrayOf("image/*")) }) { Text(if (bgTranslate == null) "Select" else "Change") }; if (bgTranslate != null) IconButton(onClick = { viewModel.saveSetting("BG_TRANSLATE", "") }) { Icon(Icons.Default.Delete, "Clear") } }

                val bgExplain by viewModel.bgExplain.collectAsState()
                val explainLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION); viewModel.saveSetting("BG_EXPLAIN", it.toString()) } }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Explain Mode BG"); Button(onClick = { explainLauncher.launch(arrayOf("image/*")) }) { Text(if (bgExplain == null) "Select" else "Change") }; if (bgExplain != null) IconButton(onClick = { viewModel.saveSetting("BG_EXPLAIN", "") }) { Icon(Icons.Default.Delete, "Clear") } }

                val bgCorrect by viewModel.bgCorrect.collectAsState()
                val correctLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION); viewModel.saveSetting("BG_CORRECT", it.toString()) } }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Correct Mode BG"); Button(onClick = { correctLauncher.launch(arrayOf("image/*")) }) { Text(if (bgCorrect == null) "Select" else "Change") }; if (bgCorrect != null) IconButton(onClick = { viewModel.saveSetting("BG_CORRECT", "") }) { Icon(Icons.Default.Delete, "Clear") } }
            }
        }

        item {

            val blur by viewModel.bgBlurRadius.collectAsState()

            Column(modifier = Modifier.padding(vertical = 8.dp)) {

                Text("Background Blur Radius: ${blur.toInt()} dp")

                Slider(value = blur, onValueChange = { viewModel.saveSetting("BG_BLUR_RADIUS", it.toString()) }, valueRange = 0f..50f)

            }

        }

        item {

            val opacity by viewModel.bgOpacity.collectAsState()

            Column(modifier = Modifier.padding(vertical = 8.dp)) {

                Text("Background Opacity: ${(opacity * 100).toInt()}%")

                Slider(value = opacity, onValueChange = { viewModel.saveSetting("BG_OPACITY", it.toString()) }, valueRange = 0f..1f)

            }

        }

        item {
            SettingsGroup("Inspirational Quote") {
                val quote by viewModel.quoteMode.collectAsState()

            val allQuotesList by viewModel.allQuotes.collectAsState()
            val quotes = listOf("None", "Shuffle") + allQuotesList
            var showAddQuoteDialog by remember { mutableStateOf(false) }

            var newQuoteText by remember { mutableStateOf("") }

            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.End) {

                Button(onClick = { showAddQuoteDialog = true }) {

                    Text("Add Custom Quote")

                }

            }

            if (showAddQuoteDialog) {

                AlertDialog(

                    onDismissRequest = { showAddQuoteDialog = false },

                    title = { Text("Add Custom Quote") },

                    text = {

                        OutlinedTextField(value = newQuoteText, onValueChange = { newQuoteText = it }, label = { Text("Quote Text") }, modifier = Modifier.fillMaxWidth())

                    },

                    confirmButton = {

                        Button(onClick = {

                            if (newQuoteText.isNotBlank()) {

                                viewModel.addCustomQuote(newQuoteText.trim())

                                viewModel.saveSetting("QUOTE_MODE", newQuoteText.trim())

                                newQuoteText = ""

                                showAddQuoteDialog = false

                            }

                        }) { Text("Add") }

                    },

                    dismissButton = { TextButton(onClick = { showAddQuoteDialog = false }) { Text("Cancel") } }

                )

            }
            val quoteStyle by viewModel.quoteStyle.collectAsState()
            val styles = listOf("Serif", "Sans Serif", "Monospace", "Cursive")
            com.aidict.app.ui.components.SearchableDropdown(
                label = "Quote Style",
                currentValue = quoteStyle,
                options = styles,
                onSelected = { viewModel.saveSetting("QUOTE_STYLE", it) }
            )

            com.aidict.app.ui.components.SearchableDropdown(
                label = "Display Quote on Empty Screens",
                currentValue = quote,
                options = quotes,
                onSelected = { viewModel.saveSetting("QUOTE_MODE", it) }
            )

            if (quote == "Shuffle") {
                val enabledQuotes by viewModel.shuffleEnabledQuotes.collectAsState()
                val currentEnabled = enabledQuotes ?: allQuotesList
                
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Quotes included in Shuffle:", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                        allQuotesList.forEach { q ->
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable {
                                val newSet = currentEnabled.toMutableSet()
                                if (newSet.contains(q)) newSet.remove(q) else newSet.add(q)
                                if (newSet.isEmpty()) newSet.add(q) // Ensure at least one
                                viewModel.saveSetting("SHUFFLE_ENABLED_QUOTES", Json.encodeToString(newSet.toList()))
                            }.padding(vertical = 4.dp)) {
                                androidx.compose.material3.Checkbox(
                                    checked = currentEnabled.contains(q),
                                    onCheckedChange = null
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(q, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
            } // end group
        }

        item { Spacer(Modifier.height(16.dp)) }

        item {
            SettingsGroup("General") {
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Button(onClick = { exportLauncher.launch("aidict_backup.json") }) {
                    Text("Export Data")
                }
                Button(onClick = { importLauncher.launch(arrayOf("application/json")) }) {
                    Text("Import Data")
                }
            }
        }
        
        var expanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = !expanded },
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
            ) {
                OutlinedTextField(
                    value = when(appTheme) {
                        "light" -> "Light"
                        "dark" -> "Dark"
                        "tokyonight" -> "Tokyo Night (Default)"
                        "nord" -> "Nord"
                        "dracula" -> "Dracula"
                        else -> "Tokyo Night (Default)"
                    },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("App Theme") },
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    listOf("light", "dark", "tokyonight", "nord", "dracula").forEach { theme ->
                        DropdownMenuItem(
                            text = { 
                                Text(when(theme) {
                                    "light" -> "Light"
                                    "dark" -> "Dark"
                                    "tokyonight" -> "Tokyo Night (Default)"
                                    "nord" -> "Nord"
                                    "dracula" -> "Dracula"
                                    else -> theme
                                }) 
                            },
                            onClick = {
                                viewModel.saveSetting("APP_THEME", theme)
                                if (theme == "light") viewModel.toggleDarkMode(false)
                                else if (theme == "dark") viewModel.toggleDarkMode(true)
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
        item {
            SettingsGroup("Languages") {
                com.aidict.app.ui.components.MultiSelectSearchableDropdown(
                    label = "Starred Languages", 
                    currentCsv = viewModel.starredLanguages.collectAsState().value, 
                    options = viewModel.allAvailableLanguages.collectAsState().value, 
                    onCsvChange = { viewModel.saveSetting("STARRED_LANGUAGES", it) }
                )
                
                Spacer(Modifier.height(16.dp))
                Text("Add Custom Language", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                
                var newLangName by remember { mutableStateOf("") }
                var newLangFlag by remember { mutableStateOf("") }
                
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newLangName,
                        onValueChange = { newLangName = it },
                        label = { Text("Name (e.g. Dothraki)") },
                        modifier = Modifier.weight(1.5f).padding(end = 8.dp),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = newLangFlag,
                        onValueChange = { newLangFlag = it },
                        label = { Text("Flag / Icon") },
                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                        singleLine = true
                    )
                    IconButton(
                        onClick = { 
                            if (newLangName.isNotBlank()) {
                                viewModel.addCustomLanguage(newLangName.trim(), newLangFlag.trim())
                                newLangName = ""
                                newLangFlag = ""
                            }
                        }
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add Language")
                    }
                }
            }
        }
        item {
            SettingsGroup("API Configuration") {
                var passwordVisible by remember { mutableStateOf(false) }
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { viewModel.saveSetting("OPENROUTER_API_KEY", it) },
                    label = { Text("OpenRouter API Key") },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        val image = if (passwordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff
                        val description = if (passwordVisible) "Hide API key" else "Show API key"
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(imageVector = image, contentDescription = description)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                )
            }
        }
        
        item { Spacer(Modifier.height(16.dp)) }
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.35f))
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "AI Configuration Scope",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Surface(
                            color = if (aiConfig.selectedProfileId == null) MaterialTheme.colorScheme.tertiaryContainer else if (aiConfig.hasCustomOverrides) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = if (aiConfig.selectedProfileId == null) "Global" else if (aiConfig.hasCustomOverrides) "Custom Overrides" else "Inheriting Global",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (aiConfig.selectedProfileId == null) MaterialTheme.colorScheme.onTertiaryContainer else if (aiConfig.hasCustomOverrides) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }
                    
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Configure models and prompts globally or customize them independently for each profile.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(12.dp))

                    var scopeMenuExpanded by remember { mutableStateOf(false) }
                    val currentScopeLabel = if (aiConfig.selectedProfileId == null) {
                        "🌐 Global Defaults (App-wide fallback)"
                    } else {
                        "👤 Profile: ${aiConfig.selectedProfileName}"
                    }

                    ExposedDropdownMenuBox(
                        expanded = scopeMenuExpanded,
                        onExpandedChange = { scopeMenuExpanded = !scopeMenuExpanded },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = currentScopeLabel,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Editing Scope") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = scopeMenuExpanded) },
                            modifier = Modifier.menuAnchor().fillMaxWidth(),
                            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                        )
                        ExposedDropdownMenu(
                            expanded = scopeMenuExpanded,
                            onDismissRequest = { scopeMenuExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("🌐 Global Defaults (App-wide fallback)") },
                                onClick = {
                                    viewModel.selectProfileScope(null)
                                    scopeMenuExpanded = false
                                }
                            )
                            if (profiles.isNotEmpty()) {
                                HorizontalDivider()
                            }
                            profiles.sortedBy { it.rank }.forEach { profile ->
                                DropdownMenuItem(
                                    text = {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text("👤 ${profile.name}")
                                            if (profile.isDefault) {
                                                Spacer(Modifier.width(6.dp))
                                                Text("(Default)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                            }
                                        }
                                    },
                                    onClick = {
                                        viewModel.selectProfileScope(profile.id)
                                        scopeMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    if (aiConfig.selectedProfileId != null) {
                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            var showCopyDialog by remember { mutableStateOf(false) }
                            OutlinedButton(
                                onClick = { showCopyDialog = true },
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Copy From...", style = MaterialTheme.typography.labelMedium)
                            }

                            if (aiConfig.hasCustomOverrides) {
                                Spacer(Modifier.width(8.dp))
                                var showConfirmReset by remember { mutableStateOf(false) }
                                FilledTonalButton(
                                    onClick = { showConfirmReset = true },
                                    colors = ButtonDefaults.filledTonalButtonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                ) {
                                    Icon(Icons.Default.Restore, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Reset All", style = MaterialTheme.typography.labelMedium)
                                }

                                if (showConfirmReset) {
                                    AlertDialog(
                                        onDismissRequest = { showConfirmReset = false },
                                        title = { Text("Reset Profile Settings?") },
                                        text = { Text("Reset all models and prompts for \"${aiConfig.selectedProfileName}\" back to Global Defaults?") },
                                        confirmButton = {
                                            TextButton(onClick = {
                                                viewModel.resetCurrentProfileToDefaults()
                                                showConfirmReset = false
                                            }) { Text("Reset", color = MaterialTheme.colorScheme.error) }
                                        },
                                        dismissButton = {
                                            TextButton(onClick = { showConfirmReset = false }) { Text("Cancel") }
                                        }
                                    )
                                }
                            }

                            if (showCopyDialog) {
                                AlertDialog(
                                    onDismissRequest = { showCopyDialog = false },
                                    title = { Text("Copy Settings From") },
                                    text = {
                                        Column {
                                            Text("Select source to copy models and prompts from into \"${aiConfig.selectedProfileName}\":")
                                            Spacer(Modifier.height(8.dp))
                                            TextButton(
                                                onClick = {
                                                    viewModel.copyAiSettings(null, aiConfig.selectedProfileId!!)
                                                    showCopyDialog = false
                                                },
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Text("🌐 Global Defaults", modifier = Modifier.fillMaxWidth())
                                            }
                                            profiles.filter { it.id != aiConfig.selectedProfileId }.forEach { p ->
                                                TextButton(
                                                    onClick = {
                                                        viewModel.copyAiSettings(p.id, aiConfig.selectedProfileId!!)
                                                        showCopyDialog = false
                                                    },
                                                    modifier = Modifier.fillMaxWidth()
                                                ) {
                                                    Text("👤 Profile: ${p.name}", modifier = Modifier.fillMaxWidth())
                                                }
                                            }
                                        }
                                    },
                                    confirmButton = {},
                                    dismissButton = {
                                        TextButton(onClick = { showCopyDialog = false }) { Text("Cancel") }
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(8.dp)) }
        item {
            val scopeTitle = if (aiConfig.selectedProfileId == null) "Models (Global Defaults)" else "Models (${aiConfig.selectedProfileName})"
            SettingsGroup(scopeTitle) {
                Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.End) {
                    Button(onClick = { viewModel.refreshModels() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh Models", modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Refresh Models")
                    }
                }
                AiModelSettingItem(
                    label = "Dict Model",
                    settingItem = aiConfig.dictModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("DICT_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("DICT_MODEL") }
                )
                AiReasoningSettingItem(
                    label = "Dict Reasoning Effort",
                    settingItem = aiConfig.dictReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("DICT_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("DICT_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Compare Model",
                    settingItem = aiConfig.compareModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("COMPARE_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("COMPARE_MODEL") }
                )
                AiReasoningSettingItem(
                    label = "Compare Reasoning Effort",
                    settingItem = aiConfig.compareReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("COMPARE_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("COMPARE_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Explain Model",
                    settingItem = aiConfig.explainModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("EXPLAIN_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("EXPLAIN_MODEL") }
                )
                AiReasoningSettingItem(
                    label = "Explain Reasoning Effort",
                    settingItem = aiConfig.explainReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("EXPLAIN_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("EXPLAIN_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Translate Model",
                    settingItem = aiConfig.translateModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("TRANSLATE_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("TRANSLATE_MODEL") }
                )
                AiReasoningSettingItem(
                    label = "Translate Reasoning Effort",
                    settingItem = aiConfig.translateReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("TRANSLATE_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("TRANSLATE_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Correct Model",
                    settingItem = aiConfig.correctModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("CORRECT_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("CORRECT_MODEL") }
                )
                AiReasoningSettingItem(
                    label = "Correct Reasoning Effort",
                    settingItem = aiConfig.correctReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("CORRECT_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("CORRECT_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Fallback Model",
                    settingItem = aiConfig.fallbackModels,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("FALLBACK_MODELS", it) },
                    onReset = { viewModel.resetAiSetting("FALLBACK_MODELS") }
                )
                AiReasoningSettingItem(
                    label = "Fallback Reasoning Effort",
                    settingItem = aiConfig.fallbackReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("FALLBACK_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("FALLBACK_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Chat Model",
                    settingItem = aiConfig.chatModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("CHAT_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("CHAT_MODEL") }
                )
                AiReasoningSettingItem(
                    label = "Chat Reasoning Effort",
                    settingItem = aiConfig.chatReasoning,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("CHAT_REASONING", it) },
                    onReset = { viewModel.resetAiSetting("CHAT_REASONING") }
                )
                Spacer(Modifier.height(4.dp))
                AiModelSettingItem(
                    label = "Quick LLM / Lens Model",
                    settingItem = aiConfig.simpleLlmModel,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    availableModels = availableModels,
                    onSave = { viewModel.saveAiSetting("SIMPLE_LLM_MODEL", it) },
                    onReset = { viewModel.resetAiSetting("SIMPLE_LLM_MODEL") }
                )
            }
        }

        item { Spacer(Modifier.height(8.dp)) }
        item {
            val scopeTitle = if (aiConfig.selectedProfileId == null) "Prompts (Global Defaults)" else "Prompts (${aiConfig.selectedProfileName})"
            SettingsGroup(scopeTitle) {
                AiPromptSettingItem(
                    label = "Dictionary Prompt",
                    settingItem = aiConfig.dictPrompt,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("DICT_PROMPT", it) },
                    onReset = { viewModel.resetAiSetting("DICT_PROMPT") }
                )
                AiPromptSettingItem(
                    label = "Explain Prompt",
                    settingItem = aiConfig.explainPrompt,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("EXPLAIN_PROMPT", it) },
                    onReset = { viewModel.resetAiSetting("EXPLAIN_PROMPT") }
                )
                AiPromptSettingItem(
                    label = "Translate Prompt",
                    settingItem = aiConfig.translatePrompt,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("TRANSLATE_PROMPT", it) },
                    onReset = { viewModel.resetAiSetting("TRANSLATE_PROMPT") }
                )
                AiPromptSettingItem(
                    label = "Compare Prompt",
                    settingItem = aiConfig.comparePrompt,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("COMPARE_PROMPT", it) },
                    onReset = { viewModel.resetAiSetting("COMPARE_PROMPT") }
                )
                AiPromptSettingItem(
                    label = "Correct Prompt",
                    settingItem = aiConfig.correctPrompt,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("CORRECT_PROMPT", it) },
                    onReset = { viewModel.resetAiSetting("CORRECT_PROMPT") }
                )
                QuickLlmDefaultLensSettingItem(
                    settingItem = aiConfig.simpleLlmDefaultPrompt,
                    isProfileScope = aiConfig.selectedProfileId != null,
                    onSave = { viewModel.saveAiSetting("SIMPLE_LLM_DEFAULT_PROMPT", it) },
                    onReset = { viewModel.resetAiSetting("SIMPLE_LLM_DEFAULT_PROMPT") }
                )
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Profiles", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                Button(onClick = { showProfileDialog = true }) { Text("Add Profile") }
            }
        }

        items(profiles.sortedBy { it.rank }, key = { it.id }) { profile ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { viewModel.setDefaultProfile(profile) }) {
                    Icon(if (profile.isDefault) Icons.Default.Star else Icons.Outlined.StarBorder, contentDescription = "Default Profile")
                }
                Text(profile.name, modifier = Modifier.weight(1f))
                IconButton(onClick = { 
                    viewModel.selectProfileScope(profile.id)
                    Toast.makeText(context, "Editing AI settings for: ${profile.name}", Toast.LENGTH_SHORT).show()
                }) {
                    Icon(
                        Icons.Default.Tune,
                        contentDescription = "Configure AI Settings",
                        tint = if (aiConfig.selectedProfileId == profile.id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = { viewModel.moveProfileUp(profile) }) {
                    Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Move Up")
                }
                IconButton(onClick = { viewModel.moveProfileDown(profile) }) {
                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Move Down")
                }
                IconButton(onClick = { 
                    renameProfileName = profile.name
                    showRenameDialog = profile 
                }) {
                    Icon(Icons.Default.Edit, contentDescription = "Edit")
                }
                IconButton(onClick = { viewModel.deleteProfile(profile) }) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                }
            }
        }    }

    if (showProfileDialog) {
        AlertDialog(
            onDismissRequest = { showProfileDialog = false },
            title = { Text("New Profile") },
            text = {
                OutlinedTextField(
                    value = newProfileName,
                    onValueChange = { newProfileName = it },
                    label = { Text("Profile Name") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newProfileName.isNotBlank()) viewModel.createProfile(newProfileName)
                    newProfileName = ""
                    showProfileDialog = false
                }) { Text("Create") }
            },
            dismissButton = {
                TextButton(onClick = { showProfileDialog = false }) { Text("Cancel") }
            }
        )
    }
    
    if (showRenameDialog != null) {
        AlertDialog(
            onDismissRequest = { showRenameDialog = null },
            title = { Text("Rename Profile") },
            text = {
                OutlinedTextField(
                    value = renameProfileName,
                    onValueChange = { renameProfileName = it },
                    label = { Text("Profile Name") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (renameProfileName.isNotBlank()) viewModel.renameProfile(showRenameDialog!!, renameProfileName)
                    renameProfileName = ""
                    showRenameDialog = null
                }) { Text("Rename") }
            },
            dismissButton = {
                TextButton(onClick = { showRenameDialog = null }) { Text("Cancel") }
            }
        )

    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchableModelDropdown(label: String, currentValue: String, availableModels: List<String>, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    var searchText by remember(currentValue) { mutableStateOf(currentValue) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
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
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
        )
        if (availableModels.isNotEmpty()) {
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                val filtered = availableModels.filter { it.contains(searchText, ignoreCase = true) }.take(50)
                filtered.forEach { model ->
                    DropdownMenuItem(
                        text = { Text(model) },
                        onClick = {
                            searchText = model
                            onSelected(model)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun AiModelSettingItem(
    label: String,
    settingItem: ProfileSettingItem,
    isProfileScope: Boolean,
    availableModels: List<String>,
    onSave: (String) -> Unit,
    onReset: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (isProfileScope) {
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        color = if (settingItem.isCustom) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = if (settingItem.isCustom) "Custom" else "Inherited",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (settingItem.isCustom) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            if (isProfileScope && settingItem.isCustom) {
                TextButton(
                    onClick = onReset,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Icon(Icons.Default.Restore, contentDescription = "Reset to global", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Inherit", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        SearchableModelDropdown(
            label = if (isProfileScope && !settingItem.isCustom) "$label (Inherited: ${settingItem.globalValue.take(24)}...)" else label,
            currentValue = settingItem.effectiveValue,
            availableModels = availableModels,
            onSelected = onSave
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiReasoningSettingItem(
    label: String,
    settingItem: ProfileSettingItem,
    isProfileScope: Boolean,
    onSave: (String) -> Unit,
    onReset: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val options = listOf(
        "default" to "Default (Model Native)",
        "none" to "None (Disabled)",
        "minimal" to "Minimal",
        "low" to "Low",
        "medium" to "Medium",
        "high" to "High",
        "xhigh" to "Extra High",
        "max" to "Max"
    )
    val currentEffort = settingItem.effectiveValue.ifBlank { "default" }
    val displayLabel = options.find { it.first == currentEffort }?.second ?: currentEffort

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (isProfileScope) {
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        color = if (settingItem.isCustom) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = if (settingItem.isCustom) "Custom" else "Inherited",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (settingItem.isCustom) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            if (isProfileScope && settingItem.isCustom) {
                TextButton(
                    onClick = onReset,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Icon(Icons.Default.Restore, contentDescription = "Reset to global", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Inherit", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
        ) {
            val inheritedText = if (isProfileScope && !settingItem.isCustom) {
                val gLabel = options.find { it.first == settingItem.globalValue }?.second ?: settingItem.globalValue
                "$label (Inherited: $gLabel)"
            } else {
                label
            }
            OutlinedTextField(
                value = displayLabel,
                onValueChange = {},
                readOnly = true,
                label = { Text(inheritedText) },
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                options.forEach { (value, text) ->
                    DropdownMenuItem(
                        text = { Text(text) },
                        onClick = {
                            onSave(value)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun AiPromptSettingItem(
    label: String,
    settingItem: ProfileSettingItem,
    isProfileScope: Boolean,
    onSave: (String) -> Unit,
    onReset: () -> Unit
) {
    var text by remember(settingItem.key, settingItem.effectiveValue) { mutableStateOf(settingItem.effectiveValue) }

    LaunchedEffect(settingItem.effectiveValue) {
        if (text != settingItem.effectiveValue) {
            text = settingItem.effectiveValue
        }
    }

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (isProfileScope) {
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        color = if (settingItem.isCustom) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = if (settingItem.isCustom) "Custom" else "Inherited",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (settingItem.isCustom) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            if (isProfileScope && settingItem.isCustom) {
                TextButton(
                    onClick = onReset,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Icon(Icons.Default.Restore, contentDescription = "Reset to global", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Inherit", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        OutlinedTextField(
            value = text,
            onValueChange = {
                text = it
                onSave(it)
            },
            label = { Text(if (isProfileScope && !settingItem.isCustom) "$label (Inherited from Global)" else label) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            minLines = 3,
            maxLines = 10
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickLlmDefaultLensSettingItem(
    settingItem: ProfileSettingItem,
    isProfileScope: Boolean,
    onSave: (String) -> Unit,
    onReset: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val lenses = com.aidict.app.utils.DefaultPrompts.QUICK_LLM_PRESETS.values.toList()
    val currentKey = settingItem.effectiveValue.ifBlank { "quick_glance" }
    val currentLens = lenses.find { it.id == currentKey }

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Default Quick LLM Lens",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (isProfileScope) {
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        color = if (settingItem.isCustom) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = if (settingItem.isCustom) "Custom" else "Inherited",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (settingItem.isCustom) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            if (isProfileScope && settingItem.isCustom) {
                TextButton(
                    onClick = onReset,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Icon(Icons.Default.Restore, contentDescription = "Reset to global", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Inherit", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
        ) {
            val inheritedText = if (isProfileScope && !settingItem.isCustom) {
                val gName = lenses.find { it.id == settingItem.globalValue }?.name ?: settingItem.globalValue
                "Default Lens Preset (Inherited: $gName)"
            } else {
                "Default Lens Preset"
            }
            OutlinedTextField(
                value = currentLens?.name ?: currentKey,
                onValueChange = {},
                readOnly = true,
                label = { Text(inheritedText) },
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                lenses.forEach { lens ->
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text(lens.name, fontWeight = FontWeight.Bold)
                                Text(lens.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        },
                        onClick = {
                            onSave(lens.id)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun ExternalDictManager(viewModel: com.aidict.app.ui.viewmodels.SettingsViewModel) {
    val externalDictsStr by viewModel.getSettingFlow("EXTERNAL_DICTS", "Cambridge|https://dictionary.cambridge.org/dictionary/english/{{str}}").collectAsState()
    
    val dicts = remember(externalDictsStr) {
        if (externalDictsStr.isBlank()) emptyList<Triple<String, String, String>>()
        else externalDictsStr.split(",").mapNotNull { 
            val parts = it.split("|")
            if (parts.size >= 2) Triple(parts[0], parts[1], parts.getOrNull(2) ?: "") else null
        }
    }

    var showDialog by remember { mutableStateOf(false) }

    if (showDialog) {
        var newName by remember { mutableStateOf("") }
        var newUrl by remember { mutableStateOf("") }
        var newIcon by remember { mutableStateOf("") }
        
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("Add External Dictionary") },
            text = {
                Column {
                    Text("Use {{str}} for the search word placeholder.", style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        label = { Text("Dictionary Name") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newUrl,
                        onValueChange = { newUrl = it },
                        label = { Text("URL (e.g. https://.../{{str}})") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newIcon,
                        onValueChange = { newIcon = it },
                        label = { Text("Icon URL (Optional)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                val isValid = newName.isNotBlank() && (newUrl.contains("{{str}}") || newUrl.contains("%s"))
                Button(
                    onClick = {
                        if (isValid) {
                            val newList = dicts + Triple(newName, newUrl, newIcon)
                            viewModel.saveSetting("EXTERNAL_DICTS", newList.joinToString(",") { "${it.first}|${it.second}|${it.third}" })
                            showDialog = false
                        }
                    },
                    enabled = isValid
                ) { Text("Add") }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
            }
        )
    }

    Spacer(Modifier.height(16.dp))
    SettingsGroup("External Dictionaries") {
        Column(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            dicts.forEachIndexed { index, (name, url, icon) ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    if (icon.isNotBlank()) {
                        coil.compose.AsyncImage(
                            model = icon,
                            contentDescription = name,
                            modifier = Modifier.size(24.dp).padding(end = 8.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(name, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                        Text(url, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    }
                    if (index > 0) {
                        IconButton(onClick = {
                            val newList = dicts.toMutableList()
                            val temp = newList[index]
                            newList[index] = newList[index - 1]
                            newList[index - 1] = temp
                            viewModel.saveSetting("EXTERNAL_DICTS", newList.joinToString(",") { "${it.first}|${it.second}|${it.third}" })
                        }, modifier = Modifier.size(32.dp)) {
                            Icon(androidx.compose.material.icons.Icons.Default.KeyboardArrowUp, contentDescription = "Up")
                        }
                    }
                    if (index < dicts.size - 1) {
                        IconButton(onClick = {
                            val newList = dicts.toMutableList()
                            val temp = newList[index]
                            newList[index] = newList[index + 1]
                            newList[index + 1] = temp
                            viewModel.saveSetting("EXTERNAL_DICTS", newList.joinToString(",") { "${it.first}|${it.second}|${it.third}" })
                        }, modifier = Modifier.size(32.dp)) {
                            Icon(androidx.compose.material.icons.Icons.Default.KeyboardArrowDown, contentDescription = "Down")
                        }
                    }
                    IconButton(onClick = {
                        val newList = dicts.toMutableList().apply { removeAt(index) }
                        viewModel.saveSetting("EXTERNAL_DICTS", newList.joinToString(",") { "${it.first}|${it.second}|${it.third}" })
                    }, modifier = Modifier.size(32.dp)) {
                        Icon(androidx.compose.material.icons.Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                    }
                }
                androidx.compose.material3.HorizontalDivider()
            }
            
            Button(
                onClick = { showDialog = true },
                modifier = Modifier.align(Alignment.End).padding(top = 8.dp)
            ) {
                Text("Add Link")
            }
        }
    }
}

@Composable
fun BackgroundSyncSettings(viewModel: SettingsViewModel) {
    val context = LocalContext.current
    val isRunning by com.aidict.app.services.BackgroundSyncService.isRunning.collectAsState()
    val isNetworkOnline by com.aidict.app.services.BackgroundSyncService.isNetworkOnline.collectAsState()
    val persistentBgStr by viewModel.persistentBackground.collectAsState()
    val isPersistentBg = persistentBgStr.toBooleanStrictOrNull() ?: false

    val powerManager = remember(context) { context.getSystemService(Context.POWER_SERVICE) as? PowerManager }
    var isIgnoringBattery by remember(context) {
        mutableStateOf(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                powerManager?.isIgnoringBatteryOptimizations(context.packageName) == true
            } else true
        )
    }

    val notificationManager = remember(context) { NotificationManagerCompat.from(context) }
    var hasNotificationPermission by remember(context) {
        mutableStateOf(notificationManager.areNotificationsEnabled())
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasNotificationPermission = granted
        if (granted) {
            Toast.makeText(context, "Notification permission granted", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(context, "Permission denied. Enable notifications in App Settings.", Toast.LENGTH_LONG).show()
        }
    }

    // Synchronize DB setting if stopped externally (e.g. from notification "Stop 24/7 Mode")
    LaunchedEffect(isRunning) {
        if (!isRunning && isPersistentBg) {
            viewModel.saveSetting("PERSISTENT_BACKGROUND_SERVICE", "false")
        }
    }

    // Refresh permission and battery status whenever user returns from system Settings
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    isIgnoringBattery = powerManager?.isIgnoringBatteryOptimizations(context.packageName) == true
                }
                hasNotificationPermission = notificationManager.areNotificationsEnabled()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    fun openAppDetailsSettings() {
        try {
            val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open App Settings", Toast.LENGTH_SHORT).show()
        }
    }

    fun openNotificationSettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } else {
                openAppDetailsSettings()
            }
        } catch (e: Exception) {
            openAppDetailsSettings()
        }
    }

    fun openBatteryOptimizationList() {
        var opened = false
        try {
            val listIntent = Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(listIntent)
            opened = true
        } catch (e: Exception) {
            android.util.Log.w("SettingsScreen", "Battery optimization list failed", e)
        }
        if (!opened) {
            openAppDetailsSettings()
        }
    }

    var showDetails by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isRunning) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
        ),
        border = androidx.compose.foundation.BorderStroke(
            width = if (isRunning) 1.5.dp else 1.dp,
            color = if (isRunning) MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)
            else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
        )
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            // Header: Title, Active Badge, and Direct Switch
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "24/7 Background Engine",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(8.dp))
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isRunning) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                        ) {
                            Text(
                                text = if (isRunning) " ACTIVE " else " OFF ",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (isRunning) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(
                        if (isRunning) "24/7 Protected. CPU WakeLock & persistent notification active."
                        else "Run 24/7 in background. Never drop searches or streaming.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.width(8.dp))
                Switch(
                    checked = isRunning,
                    onCheckedChange = { enable ->
                        viewModel.saveSetting("PERSISTENT_BACKGROUND_SERVICE", enable.toString())
                        if (enable) {
                            com.aidict.app.services.BackgroundSyncService.start(context)
                            if (!hasNotificationPermission) {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    openNotificationSettings()
                                }
                            }
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !isIgnoringBattery) {
                                openBatteryOptimizationList()
                            }
                        } else {
                            com.aidict.app.services.BackgroundSyncService.stop(context)
                        }
                    }
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Live status badges
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (isNetworkOnline) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.6f) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f),
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = if (isNetworkOnline) "🌐 Online" else "⚠️ Offline",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = if (isNetworkOnline) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
                        textAlign = TextAlign.Center
                    )
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (hasNotificationPermission) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.6f) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f),
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = if (hasNotificationPermission) "🔔 Notice: OK" else "⚠️ Notice: Need Perm",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = if (hasNotificationPermission) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
                        textAlign = TextAlign.Center
                    )
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (isIgnoringBattery) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.6f) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = if (isIgnoringBattery) "🔋 Battery: Safe" else "⚠️ Battery: Sleep Risk",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            color = if (isIgnoringBattery) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // Direct Action Buttons if permission or battery optimization needed
            if (!hasNotificationPermission || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !isIgnoringBattery)) {
                Spacer(modifier = Modifier.height(10.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!hasNotificationPermission) {
                        Button(
                            onClick = {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    openNotificationSettings()
                                }
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text("Grant Notice Perm", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !isIgnoringBattery) {
                        Button(
                            onClick = { openBatteryOptimizationList() },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text("Whitelist Battery", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Expandable details toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showDetails = !showDetails }
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Network & Battery Details",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Icon(
                    if (showDetails) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = "Toggle Details",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
            }

            if (showDetails) {
                Spacer(modifier = Modifier.height(6.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(
                            "🛡️ Resilience Architecture",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "• Indestructible foreground service notification resurrects immediately if swiped away.\n" +
                            "• Automatic CPU WakeLock prevents Android Doze from freezing streaming tokens.\n" +
                            "• 180s read / 240s call timeouts support deep reasoning models.\n" +
                            "• 4x auto-retry with exponential backoff on timeouts & 50x/429/52x errors.\n" +
                            "• Auto-waits up to 15s for network reconnect when switching Wi-Fi / mobile data.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { openNotificationSettings() },
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("Notice Settings", style = MaterialTheme.typography.labelSmall)
                            }
                            OutlinedButton(
                                onClick = { openAppDetailsSettings() },
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("App Info Settings", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}