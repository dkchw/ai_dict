package com.aidict.app.data.dao

import androidx.room.*
import com.aidict.app.data.entities.AppSetting
import com.aidict.app.data.entities.ChatMessage
import com.aidict.app.data.entities.Profile
import com.aidict.app.data.entities.Word
import com.aidict.app.data.entities.Note
import kotlinx.coroutines.flow.Flow

@Dao
interface AppDao {

    @Query("SELECT * FROM word WHERE profileId = :profileId AND mode = :mode AND term = :term AND (:language IS NULL OR language = :language) ORDER BY createdAt DESC LIMIT 1")
    suspend fun findWordExact(profileId: Int, mode: String, term: String, language: String?): com.aidict.app.data.entities.Word?
    
    @Query("UPDATE word SET searchCount = searchCount + 1 WHERE id = :wordId")
    suspend fun incrementSearchCount(wordId: Int)
    
    @Query("UPDATE word SET viewCount = viewCount + 1 WHERE id = :wordId")
    suspend fun incrementViewCount(wordId: Int)

    @Query("SELECT * FROM profile ORDER BY rank ASC")
    fun getProfiles(): Flow<List<Profile>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProfile(profile: Profile): Long

    @Query("SELECT * FROM profile WHERE isDefault = 1 LIMIT 1")
    suspend fun getDefaultProfile(): Profile?

    @Query("SELECT * FROM app_setting WHERE `key` = :key")
    suspend fun getSetting(key: String): AppSetting?
    
    @Query("SELECT * FROM app_setting")
    fun getSettingsFlow(): Flow<List<AppSetting>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSetting(setting: AppSetting)

    @Query("DELETE FROM app_setting WHERE `key` = :key")
    suspend fun deleteSetting(key: String)

    @Query("DELETE FROM app_setting WHERE `key` LIKE 'PROFILE_' || :profileId || '_%'")
    suspend fun deleteProfileSettings(profileId: Int)

    @Query("SELECT DISTINCT wordId FROM chat_message WHERE content LIKE '%' || :query || '%'")
    suspend fun getWordIdsMatchingContent(query: String): List<Int>

    @Query("SELECT * FROM word WHERE profileId = :profileId AND mode = :mode AND term LIKE '%' || :query || '%' ORDER BY createdAt DESC LIMIT 5")
    suspend fun getWordSuggestions(profileId: Int, mode: String, query: String): List<Word>

    @Query("SELECT * FROM word WHERE profileId = :profileId AND mode = :mode ORDER BY createdAt DESC")
    fun getWordsByMode(profileId: Int, mode: String): Flow<List<Word>>

    @Query("SELECT * FROM word WHERE profileId = :profileId ORDER BY createdAt DESC")
    fun getWordsByProfile(profileId: Int): Flow<List<Word>>

    @Query("UPDATE word SET mode = :targetMode WHERE id = :wordId")
    suspend fun updateWordMode(wordId: Int, targetMode: String)

    @Query("UPDATE word SET mode = :targetMode WHERE id IN (:wordIds)")
    suspend fun updateWordsMode(wordIds: List<Int>, targetMode: String)

    @Query("DELETE FROM chat_message WHERE wordId = :wordId")
    suspend fun deleteChatMessagesByWordId(wordId: Int)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWord(word: Word): Long

    @androidx.room.Update
    suspend fun updateWord(word: Word)

    @Query("SELECT * FROM word WHERE id = :wordId")
    suspend fun getWord(wordId: Int): Word?

    @Query("SELECT * FROM chat_message WHERE wordId = :wordId ORDER BY createdAt ASC")
    fun getChatMessages(wordId: Int): Flow<List<ChatMessage>>
    @Query("SELECT * FROM chat_message WHERE wordId = :wordId ORDER BY createdAt ASC")
    suspend fun getChatMessagesSync(wordId: Int): List<ChatMessage>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChatMessage(chatMessage: ChatMessage): Long

    @Delete
    suspend fun deleteWord(word: Word)
    @androidx.room.Delete
    suspend fun deleteChatMessage(msg: com.aidict.app.data.entities.ChatMessage)

    @Delete
    suspend fun deleteProfile(profile: Profile)

    @Query("SELECT * FROM session WHERE profileId = :profileId ORDER BY createdAt DESC")
    fun getSessions(profileId: Long): Flow<List<com.aidict.app.data.entities.Session>>

    @Query("SELECT * FROM session WHERE profileId = :profileId ORDER BY createdAt DESC")
    suspend fun getSessionsSync(profileId: Long): List<com.aidict.app.data.entities.Session>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: com.aidict.app.data.entities.Session)

    @Delete
    suspend fun deleteSession(session: com.aidict.app.data.entities.Session)

    @Query("SELECT * FROM app_setting")
    suspend fun getAllSettings(): List<AppSetting>

    @Query("SELECT * FROM profile")
    suspend fun getAllProfiles(): List<Profile>

    @Query("SELECT * FROM word")
    suspend fun getAllWords(): List<Word>

    @Query("SELECT * FROM chat_message")
    suspend fun getAllChatMessages(): List<ChatMessage>

    @Query("DELETE FROM app_setting")
    suspend fun clearSettings()

    @Query("DELETE FROM profile")
    suspend fun clearProfiles()

    @Query("DELETE FROM word")
    suspend fun clearWords()

    @Query("DELETE FROM chat_message")
    suspend fun clearChatMessages()

    @androidx.room.Query("SELECT * FROM note ORDER BY createdAt DESC")
    fun getNotesFlow(): kotlinx.coroutines.flow.Flow<List<Note>>

    @androidx.room.Insert
    suspend fun insertNote(note: Note): Long

    @androidx.room.Update
    suspend fun updateNote(note: Note)

    @androidx.room.Delete
    suspend fun deleteNote(note: Note)

    @androidx.room.Query("DELETE FROM note WHERE id IN (:ids)")
    suspend fun deleteNotesByIds(ids: List<Int>)

    @Query("DELETE FROM session WHERE id IN (:ids)")
    suspend fun deleteSessionsByIds(ids: List<String>)

    @Query("DELETE FROM word WHERE id IN (:ids)")
    suspend fun deleteWordsByIds(ids: List<Int>)
    @Query("UPDATE session SET profileId = :profileId WHERE id IN (:sessionIds)")
    suspend fun moveSessionsByIds(sessionIds: List<String>, profileId: Long)

    @Query("UPDATE word SET profileId = :profileId WHERE sessionId IN (:sessionIds)")
    suspend fun moveWordsBySessionIds(sessionIds: List<String>, profileId: Int)

    @Query("UPDATE word SET profileId = :profileId WHERE id IN (:wordIds)")
    suspend fun moveWordsByIds(wordIds: List<Int>, profileId: Int)
}