package com.aidict.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

class AiTranslateActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            ?: intent.getStringExtra(Intent.EXTRA_TEXT)
            ?: intent.getStringExtra("EXTRA_QUERY")
            ?: intent.getStringExtra(android.app.SearchManager.QUERY)
            ?: ""

        val popupIntent = Intent(this, PopupActivity::class.java).apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, text)
            putExtra("EXTRA_MODE", "translate")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        startActivity(popupIntent)
        finish()
    }
}
