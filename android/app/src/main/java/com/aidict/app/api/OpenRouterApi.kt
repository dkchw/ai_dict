package com.aidict.app.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Streaming

@Serializable
data class ReasoningDto(
    val effort: String? = null,
    @SerialName("max_tokens") val maxTokens: Int? = null,
    val exclude: Boolean? = null
)

@Serializable
data class ChatMessageDto(
    val role: String,
    val content: String
)

@Serializable
data class ChatRequest(
    val model: String? = null,
    val models: List<String>? = null,
    val messages: List<ChatMessageDto>,
    val stream: Boolean = true,
    val reasoning: ReasoningDto? = null
)

interface OpenRouterApi {
    @Streaming
    @POST("chat/completions")
    fun streamCompletions(
        @Header("Authorization") authHeader: String,
        @Header("HTTP-Referer") referer: String = "https://aidict.app",
        @Header("X-Title") title: String = "AI Dict Android",
        @Body request: ChatRequest
    ): Call<ResponseBody>
}
