package com.aidict.app.data.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ForeignKey
import androidx.room.Index
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "profile")
data class Profile(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val rank: Int,
    val isDefault: Boolean,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
@Entity(tableName = "app_setting")
data class AppSetting(
    @PrimaryKey val key: String,
    val value: String
)

@Serializable
@Entity(
    tableName = "word",
    foreignKeys = [
        ForeignKey(
            entity = Profile::class,
            parentColumns = ["id"],
            childColumns = ["profileId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("profileId")]
)
data class Word(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val profileId: Int,
    val term: String,
    val language: String? = null,
    val lemma: String? = null,
    val color: String? = null,
    val stars: Int = 0,
    val searchCount: Int = 1,
    val viewCount: Int = 0,
    val generationCount: Int = 1,
    val sessionId: String,
    val mode: String = "dict",
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
@Entity(
    tableName = "chat_message",
    foreignKeys = [
        ForeignKey(
            entity = Word::class,
            parentColumns = ["id"],
            childColumns = ["wordId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("wordId")]
)
data class ChatMessage(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val wordId: Int,
    val role: String, // "user" or "assistant"
    val content: String,
    val createdAt: Long = System.currentTimeMillis()
)
