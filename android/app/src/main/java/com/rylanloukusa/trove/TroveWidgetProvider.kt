package com.rylanloukusa.trove

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

// The home screen widget: Today (or the first list pinned to Home, or the
// list changed most recently) with the lines still to do, and This week
// under it when the widget is tall enough. Tapping a list opens it.
class TroveWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    widgetIds.forEach { id -> manager.updateAppWidget(id, render(context, manager, id)) }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, widgetId: Int, options: Bundle) {
    manager.updateAppWidget(widgetId, render(context, manager, widgetId))
  }

  private class Section(
    val root: Int,
    val title: Int,
    val count: Int,
    val note: Int,
    val lines: IntArray,
    val more: Int,
  )

  companion object {
    private const val PREFS = "trove_widget"
    private const val SNAPSHOT_KEY = "snapshot"
    // Tall enough for a second list under the first.
    private const val TWO_LIST_MIN_HEIGHT_DP = 220

    private val FIRST = Section(
      R.id.trove_widget_section_1,
      R.id.trove_widget_title_1,
      R.id.trove_widget_count_1,
      R.id.trove_widget_note_1,
      intArrayOf(
        R.id.trove_widget_line_1_1,
        R.id.trove_widget_line_1_2,
        R.id.trove_widget_line_1_3,
        R.id.trove_widget_line_1_4,
        R.id.trove_widget_line_1_5,
        R.id.trove_widget_line_1_6,
      ),
      R.id.trove_widget_more_1,
    )
    private val SECOND = Section(
      R.id.trove_widget_section_2,
      R.id.trove_widget_title_2,
      R.id.trove_widget_count_2,
      R.id.trove_widget_note_2,
      intArrayOf(
        R.id.trove_widget_line_2_1,
        R.id.trove_widget_line_2_2,
        R.id.trove_widget_line_2_3,
        R.id.trove_widget_line_2_4,
      ),
      R.id.trove_widget_more_2,
    )

    fun saveSnapshot(context: Context, json: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SNAPSHOT_KEY, json).apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TroveWidgetProvider::class.java))
      ids.forEach { id -> manager.updateAppWidget(id, render(context, manager, id)) }
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

    private fun render(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.trove_widget)
      val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SNAPSHOT_KEY, null)
      val lists = try {
        json?.let { JSONObject(it).optJSONArray("lists") }
      } catch (error: Exception) {
        null
      }
      val appearance = try {
        json?.let { JSONObject(it).optString("appearance", "system") } ?: "system"
      } catch (error: Exception) {
        "system"
      }
      applyAppearance(views, appearance)
      val first = lists?.optJSONObject(0)
      val second = lists?.optJSONObject(1)
      val tall = manager.getAppWidgetOptions(widgetId)
        .getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) >= TWO_LIST_MIN_HEIGHT_DP

      if (first == null) {
        views.setViewVisibility(FIRST.root, View.VISIBLE)
        views.setTextViewText(FIRST.title, "Your lists")
        views.setViewVisibility(FIRST.count, View.GONE)
        views.setTextViewText(FIRST.note, "They'll show here once you open Trove.")
        views.setViewVisibility(FIRST.note, View.VISIBLE)
        FIRST.lines.forEach { views.setViewVisibility(it, View.GONE) }
        views.setViewVisibility(FIRST.more, View.GONE)
        views.setViewVisibility(R.id.trove_widget_divider, View.GONE)
        views.setViewVisibility(SECOND.root, View.GONE)
        views.setOnClickPendingIntent(R.id.trove_widget_root, openIntent(context, "trove://home"))
        return views
      }

      val showSecond = tall && second != null
      // With one list, it gets the lines the second would have had.
      fill(context, views, FIRST, first, if (showSecond) 4 else FIRST.lines.size)
      views.setOnClickPendingIntent(R.id.trove_widget_root, openIntent(context, first.optString("url", "trove://home")))
      if (showSecond && second != null) {
        fill(context, views, SECOND, second, SECOND.lines.size)
        views.setViewVisibility(R.id.trove_widget_divider, View.VISIBLE)
        views.setViewVisibility(SECOND.root, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.trove_widget_divider, View.GONE)
        views.setViewVisibility(SECOND.root, View.GONE)
      }
      return views
    }

    private class Colors(val background: Int, val brand: Int, val ink: Int, val muted: Int, val rule: Int)

    private val LIGHT = Colors(R.drawable.trove_widget_background_light, 0xFF2F4A37.toInt(), 0xFF1D1B18.toInt(), 0xFF6B655C.toInt(), 0xFFE6DFD4.toInt())
    private val DARK = Colors(R.drawable.trove_widget_background_dark, 0xFF9FC2A3.toInt(), 0xFFF3EDE3.toInt(), 0xFFB3AB9F.toInt(), 0xFF3A342B.toInt())

    // Trove set to Light or Dark rather than System: the widget follows it.
    // With System, the colors come from values and values-night.
    private fun applyAppearance(views: RemoteViews, appearance: String) {
      val colors = when (appearance) {
        "light" -> LIGHT
        "dark" -> DARK
        else -> return
      }
      views.setInt(R.id.trove_widget_root, "setBackgroundResource", colors.background)
      views.setTextColor(R.id.trove_widget_brand, colors.brand)
      views.setInt(R.id.trove_widget_divider, "setBackgroundColor", colors.rule)
      listOf(FIRST, SECOND).forEach { section ->
        views.setTextColor(section.title, colors.ink)
        views.setTextColor(section.count, colors.brand)
        views.setTextColor(section.note, colors.muted)
        views.setTextColor(section.more, colors.muted)
        section.lines.forEach { views.setTextColor(it, colors.ink) }
      }
    }

    private fun fill(context: Context, views: RemoteViews, section: Section, list: JSONObject, limit: Int) {
      val open = list.optInt("open")
      val done = list.optInt("done")
      val pending = list.optInt("pending")
      val lines = list.optJSONArray("lines")
      val lineCount = lines?.length() ?: 0

      views.setViewVisibility(section.root, View.VISIBLE)
      views.setTextViewText(section.title, list.optString("title", "List"))
      if (open + done > 0) {
        views.setTextViewText(section.count, "$done/${open + done}")
        views.setViewVisibility(section.count, View.VISIBLE)
      } else {
        views.setViewVisibility(section.count, View.GONE)
      }

      if (lineCount == 0) {
        val empty = when {
          open == 0 && done > 0 -> "All done"
          list.optString("role") == "today" -> "Nothing due today"
          list.optString("role") == "week" -> "Nothing due this week"
          else -> "Nothing on this list yet"
        }
        views.setTextViewText(section.note, empty)
        views.setViewVisibility(section.note, View.VISIBLE)
      } else {
        views.setViewVisibility(section.note, View.GONE)
      }

      section.lines.forEachIndexed { index, viewId ->
        val line = if (index < lineCount && index < limit) lines?.optJSONObject(index) else null
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

      val shown = minOf(lineCount, limit, section.lines.size)
      if (pending > shown) {
        views.setTextViewText(section.more, "${pending - shown} more")
        views.setViewVisibility(section.more, View.VISIBLE)
      } else {
        views.setViewVisibility(section.more, View.GONE)
      }
      views.setOnClickPendingIntent(section.root, openIntent(context, list.optString("url", "trove://home")))
    }
  }
}
