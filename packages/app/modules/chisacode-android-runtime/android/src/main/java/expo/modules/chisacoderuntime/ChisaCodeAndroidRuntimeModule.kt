package expo.modules.chisacoderuntime

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicInteger

class ChisaCodeAndroidRuntimeModule : Module() {
    private val alertIdCounter = AtomicInteger(ChisaCodeForegroundService.ALERT_NOTIFICATION_ID_BASE)

    override fun definition() = ModuleDefinition {
        Name("ChisaCodeAndroidRuntime")

        AsyncFunction("startForegroundService") { text: String ->
            ChisaCodeForegroundService.ensureChannels(appContext.reactContext!!)
            ChisaCodeForegroundService.start(appContext.reactContext!!, text)
        }

        AsyncFunction("updateForegroundServiceText") { text: String ->
            ChisaCodeForegroundService.update(appContext.reactContext!!, text)
        }

        AsyncFunction("stopForegroundService") {
            ChisaCodeForegroundService.stop(appContext.reactContext!!)
        }

        AsyncFunction("sendLocalNotification") { title: String, body: String, data: String? ->
            val context = appContext.reactContext!!
            ChisaCodeForegroundService.ensureChannels(context)

            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(context, ChisaCodeForegroundService.CHANNEL_ID_ALERTS)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(context.resources.getIdentifier("notification_icon", "drawable", context.packageName))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)

            if (data != null) {
                builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
            }

            val notificationId = alertIdCounter.incrementAndGet()
            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
        }
    }
}
