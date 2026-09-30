package com.aidict.app

import kotlinx.serialization.json.*
import org.junit.Test

class JsonTest {
    @Test
    fun testJson() {
        val json = Json { ignoreUnknownKeys = true }
        val errorBody = """{"id":"gen-123","choices":[{"message":{"role":"assistant","content":"This is a test"}}]}"""
        val obj = json.decodeFromString<JsonObject>(errorBody)
        val content = obj["choices"]?.jsonArray?.get(0)?.jsonObject?.get("message")?.jsonObject?.get("content")?.jsonPrimitive?.content
        println("Content is: $content")
    }
}
