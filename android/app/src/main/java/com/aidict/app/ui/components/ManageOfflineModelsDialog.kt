package com.aidict.app.ui.components

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.aidict.app.data.LocalTranslationEngine
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManageOfflineModelsDialog(
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var modelList by remember { mutableStateOf<List<LocalTranslationEngine.ModelLanguageInfo>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var searchQuery by remember { mutableStateOf("") }
    var filterTab by remember { mutableStateOf("all") } // "all", "downloaded", "available"
    var requireWifi by remember { mutableStateOf(false) }
    val downloadingTags = remember { mutableStateListOf<String>() }

    fun refreshModels() {
        coroutineScope.launch {
            isLoading = true
            modelList = LocalTranslationEngine.getModelStatuses()
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        refreshModels()
    }

    val downloadedCount = modelList.count { it.isDownloaded }
    val approxStorageMb = downloadedCount * 30

    val filteredList = remember(modelList, searchQuery, filterTab) {
        modelList.filter { model ->
            val matchesSearch = searchQuery.isBlank() ||
                    model.name.contains(searchQuery, ignoreCase = true) ||
                    model.tag.contains(searchQuery, ignoreCase = true)
            val matchesTab = when (filterTab) {
                "downloaded" -> model.isDownloaded
                "available" -> !model.isDownloaded
                else -> true
            }
            matchesSearch && matchesTab
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .fillMaxHeight(0.85f),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CloudDownload,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Offline Language Models",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "$downloadedCount downloaded (~$approxStorageMb MB storage)",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Search Bar
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Search languages...", style = MaterialTheme.typography.bodyMedium) },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(20.dp)) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(18.dp))
                            }
                        }
                    },
                    shape = RoundedCornerShape(14.dp)
                )

                Spacer(Modifier.height(8.dp))

                // Filter Chips & Wi-Fi toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = filterTab == "all",
                            onClick = { filterTab = "all" },
                            label = { Text("All (${modelList.size})", style = MaterialTheme.typography.labelSmall) }
                        )
                        FilterChip(
                            selected = filterTab == "downloaded",
                            onClick = { filterTab = "downloaded" },
                            label = { Text("Downloaded ($downloadedCount)", style = MaterialTheme.typography.labelSmall) }
                        )
                        FilterChip(
                            selected = filterTab == "available",
                            onClick = { filterTab = "available" },
                            label = { Text("Available (${modelList.size - downloadedCount})", style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = requireWifi,
                        onCheckedChange = { requireWifi = it },
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "Require Wi-Fi for model downloads",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))

                // Model List
                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(modifier = Modifier.size(32.dp))
                    }
                } else if (filteredList.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = if (searchQuery.isNotBlank()) "No languages match '$searchQuery'" else "No languages in this category",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        items(filteredList, key = { it.tag }) { model ->
                            val isDownloading = downloadingTags.contains(model.tag)
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (model.isDownloaded) {
                                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f)
                                    } else {
                                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                                    }
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = if (model.isDownloaded) Icons.Default.CheckCircle else Icons.Default.Language,
                                        contentDescription = null,
                                        tint = if (model.isDownloaded) Color(0xFF10B981) else MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(24.dp)
                                    )

                                    Spacer(Modifier.width(12.dp))

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = model.name,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = if (model.isDownloaded) "Downloaded • ~30 MB • Code: ${model.tag}"
                                            else if (isDownloading) "Downloading language model pack..."
                                            else "Available for offline use • ~30 MB",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (model.isDownloaded) Color(0xFF10B981) else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }

                                    if (isDownloading) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(22.dp),
                                            strokeWidth = 2.dp,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    } else if (model.isDownloaded) {
                                        // Delete Button
                                        IconButton(
                                            onClick = {
                                                coroutineScope.launch {
                                                    val success = LocalTranslationEngine.deleteModel(model.tag)
                                                    if (success) {
                                                        Toast.makeText(context, "Deleted ${model.name} model pack", Toast.LENGTH_SHORT).show()
                                                        modelList = LocalTranslationEngine.getModelStatuses()
                                                    } else {
                                                        Toast.makeText(context, "Failed to delete ${model.name}", Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                            },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Delete,
                                                contentDescription = "Delete model",
                                                tint = MaterialTheme.colorScheme.error,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                    } else {
                                        // Download Button
                                        IconButton(
                                            onClick = {
                                                coroutineScope.launch {
                                                    downloadingTags.add(model.tag)
                                                    val success = LocalTranslationEngine.downloadModel(model.tag, requireWifi)
                                                    downloadingTags.remove(model.tag)
                                                    if (success) {
                                                        Toast.makeText(context, "Downloaded ${model.name} model pack", Toast.LENGTH_SHORT).show()
                                                        modelList = LocalTranslationEngine.getModelStatuses()
                                                    } else {
                                                        Toast.makeText(context, "Download failed for ${model.name}", Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                            },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Download,
                                                contentDescription = "Download model",
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(20.dp)
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
    }
}
