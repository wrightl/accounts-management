package com.dotanddash.alfa

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.view.View
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetProvider

/**
 * What clients owe and, for limited companies, Safe to pay. The app writes
 * the figures when it loads the Overview; with the app lock on, or signed
 * out, it writes none and this says to open Alfa.
 */
class AlfaWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        val owed = widgetData.getString("owed", null)
        val safe = widgetData.getString("safe_to_pay", null)
        val updated = widgetData.getString("updated", null)

        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.alfa_widget).apply {
                setOnClickPendingIntent(
                    R.id.widget_container,
                    HomeWidgetLaunchIntent.getActivity(context, MainActivity::class.java),
                )
                if (owed == null) {
                    setViewVisibility(R.id.widget_owed_label, View.GONE)
                    setTextViewText(R.id.widget_owed, "Open Alfa to see your figures")
                } else {
                    setViewVisibility(R.id.widget_owed_label, View.VISIBLE)
                    setTextViewText(R.id.widget_owed, owed)
                }
                if (safe == null) {
                    setViewVisibility(R.id.widget_safe_label, View.GONE)
                    setViewVisibility(R.id.widget_safe, View.GONE)
                } else {
                    setViewVisibility(R.id.widget_safe_label, View.VISIBLE)
                    setViewVisibility(R.id.widget_safe, View.VISIBLE)
                    setTextViewText(R.id.widget_safe, safe)
                }
                setTextViewText(R.id.widget_updated, updated ?: "")
            }
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
