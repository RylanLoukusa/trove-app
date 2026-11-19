package com.rylanloukusa.trove

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

// The home screen widget: the first list pinned to Home (or the list changed
// most recently), with the lines still to do. Tapping it opens the list.
class TroveWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    widgetIds.forEach { id -> manager.updateAppWidget(id, render(context)) }
  }

  companion object {
    private const val PREFS = "trove_widget"
    private const val SNAPSHOT_KEY = "snapshot"
    private val LINE_VIEWS = intArrayOf(
      R.id.trove_widget_line_1,
      R.id.trove_widget_line_2,
      R.id.trove_widget_line_3,
      R.id.trove_widget_line_4,
      R.id.trove_widget_line_5,
      R.id.trove_widget_line_6,
    )

    fun saveSnapshot(context: Context, json: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SNAPSHOT_KEY, json).apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TroveWidgetProvider::class.java))
      if (ids.isNotEmpty()) {
        val views = render(context)
        ids.forEach { id -> manager.updateAppWidget(id, views) }
      }
    }

    private fun openIntent(context: Context, url: String): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        context,
        url.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun render(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.trove_widget)
      val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SNAPSHOT_KEY, null)
      val list = try {
        json?.let { JSONObject(it).optJSONArray("lists")?.optJSONObject(0) }
      } catch (error: Exception) {
        null
      }

      if (list == null) {
        views.setTextViewText(R.id.trove_widget_title, "Trove")
        views.setViewVisibility(R.id.trove_widget_count, View.GONE)
        views.setTextViewText(R.id.trove_widget_note, "Pin a list to Home to see it here")
        views.setViewVisibility(R.id.trove_widget_note, View.VISIBLE)
        LINE_VIEWS.forEach { views.setViewVisibility(it, View.GONE) }
        views.setViewVisibility(R.id.trove_widget_more, View.GONE)
        views.setOnClickPendingIntent(R.id.trove_widget_root, openIntent(context, "trove://home"))
        return views
      }

      val open = list.optInt("open")
      val done = list.optInt("done")
      val pending = list.optInt("pending")
      val lines = list.optJSONArray("lines")
      val lineCount = lines?.length() ?: 0

      views.setTextViewText(R.id.trove_widget_title, list.optString("title", "List"))
      if (open + done > 0) {
        views.setTextViewText(R.id.trove_widget_count, "$done/${open + done}")
        views.setViewVisibility(R.id.trove_widget_count, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.trove_widget_count, View.GONE)
      }

      if (lineCount == 0) {
        views.setTextViewText(R.id.trove_widget_note, if (open + done > 0) "All done" else "Nothing on this list yet")
        views.setViewVisibility(R.id.trove_widget_note, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.trove_widget_note, View.GONE)
      }

      LINE_VIEWS.forEachIndexed { index, viewId ->
        val line = if (index < lineCount) lines?.optJSONObject(index) else null
        if (line == null) {
          views.setViewVisibility(viewId, View.GONE)
        } else {
          val marker = when (line.optString("kind")) {
            "check" -> "○  "
            "bullet" -> "•  "
            else -> ""
          }
          val indent = "    ".repeat(line.optInt("indent").coerceIn(0, 3))
          views.setTextViewText(viewId, indent + marker + line.optString("text"))
          views.setViewVisibility(viewId, View.VISIBLE)
        }
      }

      val shown = minOf(lineCount, LINE_VIEWS.size)
      if (pending > shown) {
        views.setTextViewText(R.id.trove_widget_more, "${pending - shown} more")
        views.setViewVisibility(R.id.trove_widget_more, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.trove_widget_more, View.GONE)
      }

      views.setOnClickPendingIntent(R.id.trove_widget_root, openIntent(context, list.optString("url", "trove://home")))
      return views
    }
  }
}
