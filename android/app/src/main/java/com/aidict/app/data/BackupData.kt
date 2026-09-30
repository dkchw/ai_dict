package com.aidict.app.data

import com.aidict.app.data.entities.ChatMessage
import com.aidict.app.data.entities.Profile
import com.aidict.app.data.entities.AppSetting
import com.aidict.app.data.entities.Word
import kotlinx.serialization.Serializable

@Serializable
data class BackupData(
    val version: Int = 1,
    val settings: List<AppSetting>,
    val profiles: List<Profile>,
    val words: List<Word>,
    val chatMessages: List<ChatMessage>
)
