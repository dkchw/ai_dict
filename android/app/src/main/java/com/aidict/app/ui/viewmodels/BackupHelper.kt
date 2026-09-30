package com.aidict.app.ui.viewmodels

import android.content.Context
import android.net.Uri
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.BackupData
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object BackupHelper {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    suspend fun exportData(context: Context, database: AppDatabase, uri: Uri): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val settings = database.appDao().getAllSettings()
            val profiles = database.appDao().getAllProfiles()
            val words = database.appDao().getAllWords()
            val chatMessages = database.appDao().getAllChatMessages()

            val backup = BackupData(
                settings = settings,
                profiles = profiles,
                words = words,
                chatMessages = chatMessages
            )

            val jsonString = json.encodeToString(backup)
            
            context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                outputStream.write(jsonString.toByteArray())
            } ?: return@withContext Result.failure(Exception("Could not open output stream"))

            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun importData(context: Context, database: AppDatabase, uri: Uri): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val jsonString = context.contentResolver.openInputStream(uri)?.use { inputStream ->
                inputStream.bufferedReader().readText()
            } ?: return@withContext Result.failure(Exception("Could not open input stream"))

            val backup = json.decodeFromString<BackupData>(jsonString)

            database.runInTransaction {
                // Clear existing
                // Not clearing profiles/settings completely unless necessary?
                // Actually, let's clear EVERYTHING except standard settings
                // But user wants to "import everything seamlessly on new device".
                // So clearing is good. But Room needs runInTransaction. Or just run blocking.
                
                // For simplicity, we just insert REPLACE for profiles, words, chat_messages, settings.
                // Wait, if it's a new device, just REPLACE is fine. If they want to merge, it works too.
                // But ID collisions could occur if not cleared.
            }
            
            // Do it via suspending DAO methods (not in transaction block to avoid blocking)
            database.appDao().clearChatMessages()
            database.appDao().clearWords()
            database.appDao().clearProfiles()
            database.appDao().clearSettings()

            for (s in backup.settings) database.appDao().insertSetting(s)
            for (p in backup.profiles) database.appDao().insertProfile(p)
            for (w in backup.words) database.appDao().insertWord(w)
            for (c in backup.chatMessages) database.appDao().insertChatMessage(c)

            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
