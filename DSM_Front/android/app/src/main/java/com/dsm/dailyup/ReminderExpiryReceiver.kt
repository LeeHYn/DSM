package com.dsm.dailyup

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Manifest registration must remain non-exported and in the application's process. */
class ReminderExpiryReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      ReminderExpiryStore.expire(context, intent)
    } catch (_: Exception) {
      // Never log notification identifiers or raw platform/storage failures.
    }
  }
}
