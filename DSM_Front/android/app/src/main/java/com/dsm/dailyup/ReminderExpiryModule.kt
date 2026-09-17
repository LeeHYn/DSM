package com.dsm.dailyup

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import app.notifee.core.Notifee
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ViewManager

@ReactModule(name = ReminderExpiryModule.NAME)
class ReminderExpiryModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object {
    const val NAME = "ReminderExpiry"
  }

  override fun getName() = NAME

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun elapsedRealtime(): Double = SystemClock.elapsedRealtime().toDouble()

  @ReactMethod
  fun schedule(id: String, deadlineElapsedMs: Double, promise: Promise) {
    try {
      require(ReminderExpiryStore.validId(id))
      val remainingMs = deadlineElapsedMs - SystemClock.elapsedRealtime()
      require(deadlineElapsedMs.isFinite() && remainingMs >= 1 && remainingMs <= 300_000)
      require(Build.VERSION.SDK_INT < Build.VERSION_CODES.O)
      promise.resolve(ReminderExpiryStore.schedule(reactApplicationContext, id, deadlineElapsedMs.toLong()))
    } catch (_: Exception) {
      promise.reject("E_REMINDER_EXPIRY", "Reminder expiry unavailable")
    }
  }

  @ReactMethod
  fun display(notification: ReadableMap, deadlineElapsedMs: Double, ticket: Double, promise: Promise) {
    try {
      require(ReminderExpiryStore.validTicket(ticket))
      require(deadlineElapsedMs.isFinite())
      require(deadlineElapsedMs - SystemClock.elapsedRealtime() in 1.0..300_000.0)
      val payload = checkNotNull(Arguments.toBundle(notification))
      val id = checkNotNull(payload.getString("id"))
      require(ReminderExpiryStore.validId(id) && payload.getBundle("android")?.getString("tag") == id)
      ReminderExpiryStore.display(
        reactApplicationContext, payload, id, deadlineElapsedMs.toLong(), ticket.toLong(), promise,
      )
    } catch (_: Exception) {
      promise.reject("E_REMINDER_EXPIRY", "Reminder expiry unavailable")
    }
  }

  @ReactMethod
  fun cancel(id: String, ticket: Double, promise: Promise) {
    try {
      require(ReminderExpiryStore.validId(id) && ReminderExpiryStore.validTicket(ticket))
      ReminderExpiryStore.cancel(reactApplicationContext, id, ticket.toLong())
      promise.resolve(null)
    } catch (_: Exception) {
      promise.reject("E_REMINDER_EXPIRY", "Reminder expiry unavailable")
    }
  }

  @ReactMethod
  fun cancelAll(promise: Promise) {
    try {
      ReminderExpiryStore.cancelAll(reactApplicationContext)
      promise.resolve(null)
    } catch (_: Exception) {
      promise.reject("E_REMINDER_EXPIRY", "Reminder expiry unavailable")
    }
  }
}

class ReminderExpiryPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(ReminderExpiryModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}

/** Only this module and the non-exported receiver own this bounded deadline journal. */
internal object ReminderExpiryStore {
  private const val PREFERENCES = "dsm_reminder_expiry_v1"
  private const val ACTION = "com.dsm.dailyup.REMINDER_EXPIRY"
  private const val SCHEME = "dsm-reminder-expiry"
  private const val MAX_ENTRIES = 100
  private const val MAX_TICKET = 9_007_199_254_740_991L
  private val lock = Any()
  private val handler = Handler(Looper.getMainLooper())
  private val callbacks = mutableMapOf<String, Runnable>()
  private val tickets = mutableMapOf<String, Long>()
  private var lastTicket = 0L
  private var generation = 0L
  private val displayQueue = java.util.ArrayDeque<DisplayRequest>()
  private var activeDisplay: DisplayRequest? = null

  private class DisplayRequest(
    val context: Context,
    val payload: Bundle,
    val id: String,
    val deadline: Long,
    val ticket: Long,
    val generation: Long,
    val promise: Promise,
    var settled: Boolean = false,
  )

  private fun settle(request: DisplayRequest, success: Boolean) {
    if (request.settled) return
    request.settled = true
    // Bridge teardown must not strand the native queue or prevent cancellation.
    runCatching {
      if (success) request.promise.resolve(null)
      else request.promise.reject("E_REMINDER_EXPIRY", "Reminder expiry unavailable")
    }
  }

  private fun authorized(request: DisplayRequest): Boolean =
    request.generation == generation &&
      tickets[request.id] == request.ticket &&
      request.deadline - SystemClock.elapsedRealtime() in 1L..300_000L &&
      preferences(request.context).getLong(request.id, Long.MIN_VALUE) == request.deadline

  fun display(context: Context, payload: Bundle, id: String, deadline: Long, ticket: Long, promise: Promise) =
    synchronized(lock) {
      // Count the active call too: a SDK call that never completes cannot grow memory unboundedly.
      check(displayQueue.size + (if (activeDisplay == null) 0 else 1) < MAX_ENTRIES)
      val request = DisplayRequest(context.applicationContext, payload, id, deadline, ticket, generation, promise)
      check(authorized(request))
      displayQueue.addLast(request)
      drainDisplays()
    }

  /** Called under lock; keep the active slot until the SDK completes, even after cancelAll. */
  private fun drainDisplays() {
    while (activeDisplay == null && displayQueue.isNotEmpty()) {
      val request = displayQueue.removeFirst()
      if (!runCatching { authorized(request) }.getOrDefault(false)) {
        settle(request, false)
        continue
      }
      activeDisplay = request
      try {
        Notifee.getInstance().displayNotification(request.payload) { error, _ ->
          completeDisplay(request, error != null)
        }
      } catch (_: Exception) {
        completeDisplay(request, true)
      }
    }
  }

  private fun completeDisplay(request: DisplayRequest, sdkFailed: Boolean) = synchronized(lock) {
    if (activeDisplay !== request) return@synchronized
    val success = !sdkFailed && runCatching { authorized(request) }.getOrDefault(false)
    if (!success) {
      // Cancel before starting the next SDK call. Its replacement may use exactly the same ID.
      runCatching {
        checkNotNull(request.context.getSystemService(NotificationManager::class.java))
          .cancel(request.id, request.id.hashCode())
      }
    }
    settle(request, success)
    activeDisplay = null
    drainDisplays()
  }

  fun validId(id: String): Boolean =
    id.isNotBlank() && id.length <= 8192 && Charsets.UTF_8.newEncoder().canEncode(id)

  fun validTicket(ticket: Double): Boolean =
    ticket.isFinite() && ticket >= 1.0 && ticket <= MAX_TICKET.toDouble() &&
      ticket == ticket.toLong().toDouble()

  private fun preferences(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun intent(context: Context, id: String): Intent =
    Intent(context, ReminderExpiryReceiver::class.java).apply {
      action = ACTION
      // Extras and Java hash codes cannot uniquely identify a PendingIntent.
      data = Uri.Builder().scheme(SCHEME).authority(context.packageName).appendPath(id).build()
    }

  private fun operation(context: Context, id: String, create: Boolean): PendingIntent? =
    PendingIntent.getBroadcast(
      context,
      0,
      intent(context, id),
      (if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE) or
        PendingIntent.FLAG_IMMUTABLE,
    )

  private fun cancelAlarm(context: Context, id: String) {
    operation(context, id, false)?.let { pending ->
      try {
        checkNotNull(context.getSystemService(AlarmManager::class.java)).cancel(pending)
      } finally {
        pending.cancel()
      }
    }
  }

  private fun cancelCallback(id: String) {
    callbacks.remove(id)?.let { handler.removeCallbacks(it) }
  }

  fun schedule(context: Context, id: String, deadline: Long) = synchronized(lock) {
    val journal = preferences(context)
    check(journal.contains(id) || journal.all.size < MAX_ENTRIES)
    check(tickets.containsKey(id) || tickets.size < MAX_ENTRIES)
    try {
      // Waiting for this lock must not turn an expired request into a fresh TTL.
      require(deadline - SystemClock.elapsedRealtime() in 1L..300_000L)
      check(lastTicket < MAX_TICKET)
      val ticket = ++lastTicket
      tickets[id] = ticket
      cancelCallback(id)
      // Commit before arming: a receiver started in a fresh process needs the deadline.
      check(journal.edit().putLong(id, deadline).commit())
      checkNotNull(context.getSystemService(AlarmManager::class.java)).setExactAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        deadline,
        checkNotNull(operation(context, id, true)),
      )
      // AlarmManager may defer short TTLs. Keep one process-live callback per journal ID;
      // the persistent alarm remains the backup when the application process is killed.
      val application = context.applicationContext
      val callback = Runnable {
        try {
          expire(application, intent(application, id))
        } catch (_: Exception) {
          // Leave the persistent alarm available; never expose platform/storage failures.
        }
      }
      callbacks[id] = callback
      check(handler.postDelayed(callback, (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(0)))
      ticket.toDouble()
    } catch (failure: Exception) {
      // Clean up under the same native lock; a delayed JS catch may belong to an old display.
      cancelCallback(id)
      tickets.remove(id)
      runCatching {
        checkNotNull(context.getSystemService(NotificationManager::class.java)).cancel(id, id.hashCode())
      }
      runCatching { cancelAlarm(context, id) }
      runCatching { journal.edit().remove(id).commit() }
      throw failure
    }
  }

  fun cancel(context: Context, id: String, ticket: Long) = synchronized(lock) {
    // A delayed JS catch must not cancel a replacement, including same-deadline ABA.
    if (tickets[id] != ticket) return@synchronized
    tickets.remove(id)
    cancelCallback(id)
    var failed = false
    try {
      checkNotNull(context.getSystemService(NotificationManager::class.java)).cancel(id, id.hashCode())
    } catch (_: Exception) {
      failed = true
    }
    try {
      cancelAlarm(context, id)
    } catch (_: Exception) {
      failed = true
    }
    if (!preferences(context).edit().remove(id).commit()) failed = true
    check(!failed)
  }

  fun cancelAll(context: Context) = synchronized(lock) {
    generation += 1
    tickets.clear()
    while (displayQueue.isNotEmpty()) settle(displayQueue.removeFirst(), false)
    // Reject promptly, but preserve serialization until its late native callback cancels the post.
    activeDisplay?.let { settle(it, false) }
    for (callback in callbacks.values) handler.removeCallbacks(callback)
    callbacks.clear()
    val journal = preferences(context)
    var failed = false
    for (id in journal.all.keys) {
      try {
        cancelAlarm(context, id)
      } catch (_: Exception) {
        failed = true
      }
    }
    // Clear even when an OS cancellation failed; a late broadcast then has no authority.
    if (!journal.edit().clear().commit()) failed = true
    check(!failed)
  }

  fun expire(context: Context, delivered: Intent) = synchronized(lock) {
    val id = delivered.data?.lastPathSegment ?: return@synchronized
    if (!validId(id) || delivered.action != ACTION || delivered.data != intent(context, id).data) {
      return@synchronized
    }
    val journal = preferences(context)
    if (!journal.contains(id)) return@synchronized
    val deadline = journal.getLong(id, Long.MAX_VALUE)
    // A previously queued broadcast must not cancel a replacement with a later deadline.
    if (deadline > SystemClock.elapsedRealtime()) return@synchronized
    tickets.remove(id)
    cancelCallback(id)
    checkNotNull(context.getSystemService(NotificationManager::class.java)).cancel(id, id.hashCode())
    cancelAlarm(context, id)
    check(journal.edit().remove(id).commit())
  }
}
