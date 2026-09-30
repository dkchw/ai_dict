package com.aidict.app.utils

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import android.os.Build
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File

class AutoUpdater(private val context: Context) {
    fun checkForUpdates() {
        Toast.makeText(context, "Checking for updates...", Toast.LENGTH_SHORT).show()
        val client = OkHttpClient()
        val request = Request.Builder()
            .url("https://api.github.com/repos/dkchw/ai_dict/releases/latest")
            .build()
            
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            try {
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val body = response.body?.string()
                    if (body != null) {
                        val json = JSONObject(body)
                        val tagName = json.getString("tag_name")
                        val currentVersion = "v" + context.packageManager.getPackageInfo(context.packageName, 0).versionName
                        
                        if (tagName != currentVersion) {
                            val assets = json.getJSONArray("assets")
                            var apkUrl: String? = null
                            for (i in 0 until assets.length()) {
                                val asset = assets.getJSONObject(i)
                                if (asset.getString("name").endsWith(".apk")) {
                                    apkUrl = asset.getString("browser_download_url")
                                    break
                                }
                            }
                            if (apkUrl != null) {
                                withContext(Dispatchers.Main) {
                                    Toast.makeText(context, "Downloading update $tagName...", Toast.LENGTH_LONG).show()
                                    downloadAndInstall(apkUrl, tagName)
                                }
                            }
                        } else {
                            withContext(Dispatchers.Main) {
                                Toast.makeText(context, "App is up to date.", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, "Failed to check for updates.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun downloadAndInstall(url: String, version: String) {
        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val uri = Uri.parse(url)
        val request = DownloadManager.Request(uri)
            .setTitle("AI Dict Update")
            .setDescription("Downloading $version")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "ai_dict_$version.apk")
            
        val downloadId = downloadManager.enqueue(request)
        
        val onComplete = object : BroadcastReceiver() {
            override fun onReceive(ctxt: Context, intent: Intent) {
                if (intent.action == DownloadManager.ACTION_DOWNLOAD_COMPLETE) {
                    val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                    if (id == downloadId) {
                        installApk("ai_dict_$version.apk", downloadId)
                        ctxt.applicationContext.unregisterReceiver(this)
                    }
                }
            }
        }
        
        val appContext = context.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(onComplete, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED)
        } else {
            appContext.registerReceiver(onComplete, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        }
    }

    private fun installApk(filename: String, downloadId: Long) {
        try {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            var apkUri = downloadManager.getUriForDownloadedFile(downloadId)
            
            if (apkUri == null) {
                val file = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), filename)
                if (file.exists()) {
                    apkUri = FileProvider.getUriForFile(context, "${context.packageName}.provider", file)
                }
            }
            
            if (apkUri != null) {
                val intent = Intent(Intent.ACTION_VIEW)
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive")
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } else {
                Toast.makeText(context, "Downloaded file not found.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Failed to install update: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
