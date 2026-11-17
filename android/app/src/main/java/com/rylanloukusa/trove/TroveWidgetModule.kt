package com.rylanloukusa.trove

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

// Hands the app's list snapshot to the home screen widget: it is kept in
// shared preferences, then every Trove widget is redrawn.
class TroveWidgetModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "TroveWidgetModule"

  @ReactMethod
  fun saveSnapshot(json: String, promise: Promise) {
    try {
      TroveWidgetProvider.saveSnapshot(reactApplicationContext, json)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("widget_write_failed", "Could not save the widget's lists.", error)
    }
  }
}

@Suppress("DEPRECATION")
class TroveWidgetPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(TroveWidgetModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<in Nothing, in Nothing>> =
    emptyList()
}
