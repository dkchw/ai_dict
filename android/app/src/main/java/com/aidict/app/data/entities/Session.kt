package com.aidict.app.data.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "session")
data class Session(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val profileId: Long,
    val createdAt: Long = System.currentTimeMillis()
)
