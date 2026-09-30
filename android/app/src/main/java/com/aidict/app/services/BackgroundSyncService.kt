package com.aidict.app.services

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.aidict.app.AiDictApplication
import com.aidict.app.MainActivity
import com.aidict.app.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicInteger
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.entities.AppSetting

class BackgroundSyncService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 2002
        const val ACTION_START = "com.aidict.app.action.START_BACKGROUND_SERVICE"
        const val ACTION_STOP = "com.aidict.app.action.STOP_BACKGROUND_SERVICE"
        const val ACTION_NOTIFICATION_DISMISSED = "com.aidict.app.action.NOTIFICATION_DISMISSED"

        private val _isRunning = MutableStateFlow(false)
        val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()

        private val _isNetworkOnline = MutableStateFlow(true)
        val isNetworkOnline: StateFlow<Boolean> = _isNetworkOnline.asStateFlow()

        private var wakeLock: PowerManager.WakeLock? = null
        private val lock = Any()

        fun acquireWakeLock(context: Context, timeoutMs: Long = 180_000L) {
            synchronized(lock) {
                try {
                    val pm = context.applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                    if (wakeLock == null && pm != null) {
                        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AIDict:BackgroundApiWakeLock").apply {
                            setReferenceCounted(false)
                        }
                    }
                    wakeLock?.let {
                        if (!it.isHeld) {
                            it.acquire(timeoutMs)
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.e("BackgroundSyncService", "Failed to acquire wake lock", e)
                }
                Unit
            }
        }

        fun releaseWakeLock() {
            synchronized(lock) {
                try {
                    if (wakeLock?.isHeld == true) {
                        wakeLock?.release()
                    }
                } catch (e: Exception) {
                    android.util.Log.e("BackgroundSyncService", "Failed to release wake lock", e)
                }
                Unit
            }
        }

        fun start(context: Context) {
            val intent = Intent(context, BackgroundSyncService::class.java).apply {
                action = ACTION_START
            }
            try {
                CoroutineScope(Dispatchers.IO).launch {
                    val db = AppDatabase.getDatabase(context.applicationContext)
                    db.appDao().insertSetting(AppSetting("PERSISTENT_BACKGROUND_SERVICE", "true"))
                }
            } catch (ignored: Exception) {}
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                android.util.Log.e("BackgroundSyncService", "Error starting BackgroundSyncService", e)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, BackgroundSyncService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                CoroutineScope(Dispatchers.IO).launch {
                    val db = AppDatabase.getDatabase(context.applicationContext)
                    db.appDao().insertSetting(AppSetting("PERSISTENT_BACKGROUND_SERVICE", "false"))
                }
            } catch (ignored: Exception) {}
            try {
                context.startService(intent)
            } catch (e: Exception) {
                try {
                    context.stopService(intent)
                } catch (ignored: Exception) {}
            }
        }
        fun buildNotification(context: Context, statusText: String): Notification {
            val openIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingOpen = PendingIntent.getActivity(
                context,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val stopIntent = Intent(context, BackgroundSyncService::class.java).apply {
                action = ACTION_STOP
            }
            val pendingStop = PendingIntent.getService(
                context,
                1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val dismissIntent = Intent(context, BackgroundSyncService::class.java).apply {
                action = ACTION_NOTIFICATION_DISMISSED
            }
            val pendingDismiss = PendingIntent.getService(
                context,
                2,
                dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            return NotificationCompat.Builder(context, AiDictApplication.BACKGROUND_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("AI Dict 24/7 Engine")
                .setContentText(statusText)
                .setOngoing(true)
                .setAutoCancel(false)
                .setSilent(true)
                .setContentIntent(pendingOpen)
                .setDeleteIntent(pendingDismiss)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop 24/7 Mode", pendingStop)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        }

        fun updateNotification(context: Context, statusText: String) {
            if (!_isRunning.value) return
            try {
                val notification = buildNotification(context, statusText)
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                manager?.notify(NOTIFICATION_ID, notification)
            } catch (ignored: Exception) {}
        }
    }

    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var watchdogJob: Job? = null
    private var currentStatusText = "Running 24/7 in background. API calls & searches active."

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        _isRunning.value = true
        setupNetworkMonitoring()
        startInForeground()

        // Persistent Watchdog: Check every 15 seconds to ensure foreground notification remains active
        watchdogJob = serviceScope.launch {
            while (isActive && _isRunning.value) {
                delay(15_000L)
                if (_isRunning.value) {
                    try {
                        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                        val isShown = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            manager?.activeNotifications?.any { it.id == NOTIFICATION_ID } == true
                        } else true
                        if (!isShown) {
                            startInForeground()
                        }
                    } catch (ignored: Exception) {}
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            _isRunning.value = false
            watchdogJob?.cancel()
            try {
                CoroutineScope(Dispatchers.IO).launch {
                    val db = AppDatabase.getDatabase(applicationContext)
                    db.appDao().insertSetting(AppSetting("PERSISTENT_BACKGROUND_SERVICE", "false"))
                }
            } catch (ignored: Exception) {}
            stopForeground(STOP_FOREGROUND_REMOVE)
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.cancel(NOTIFICATION_ID)
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_NOTIFICATION_DISMISSED) {
            // User cleared or swiped the notification away; resurrect it immediately if 24/7 is enabled
            if (_isRunning.value) {
                startInForeground()
            }
            return START_STICKY
        }

        startInForeground()
        return START_STICKY
    }

    private fun startInForeground() {
        val notification = buildNotification(this, currentStatusText)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            try {
                startForeground(NOTIFICATION_ID, notification)
            } catch (ignored: Exception) {}
        }
    }

    private fun setupNetworkMonitoring() {
        try {
            connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    _isNetworkOnline.value = true
                    updateNotification("Online - Background search & API ready.")
                }

                override fun onLost(network: Network) {
                    _isNetworkOnline.value = false
                    updateNotification("Waiting for internet connection...")
                }
            }
            connectivityManager?.registerNetworkCallback(request, networkCallback!!)
        } catch (e: Exception) {
            android.util.Log.e("BackgroundSyncService", "Failed to register network callback", e)
        }
    }

    private fun updateNotification(text: String) {
        currentStatusText = text
        updateNotification(this, text)
    }

    override fun onDestroy() {
        super.onDestroy()
        _isRunning.value = false
        watchdogJob?.cancel()
        serviceScope.cancel()
        try {
            CoroutineScope(Dispatchers.IO).launch {
                val db = AppDatabase.getDatabase(applicationContext)
                db.appDao().insertSetting(AppSetting("PERSISTENT_BACKGROUND_SERVICE", "false"))
            }
        } catch (ignored: Exception) {}
        try {
            networkCallback?.let { connectivityManager?.unregisterNetworkCallback(it) }
        } catch (ignored: Exception) {}
        synchronized(lock) {
            try {
                if (wakeLock?.isHeld == true) {
                    wakeLock?.release()
                }
                wakeLock = null
            } catch (ignored: Exception) {}
            Unit
        }
    }
}
