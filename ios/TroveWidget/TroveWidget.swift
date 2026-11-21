import SwiftUI
import WidgetKit

// The home screen and Lock Screen widget. Today comes first (what's due today or overdue);
// the medium and large sizes show This week beside or under it. Without
// those lists it shows the lists pinned to Home, or the ones changed most
// recently. Tapping a list opens it. The app writes what to show into the
// app group (see src/widget/widgetSnapshot.ts and TroveWidgetModule).

private let appGroupIdentifier = "group.com.rylanloukusa.trove"
private let snapshotFileName = "widget-snapshot.json"

struct WidgetLine: Decodable, Hashable {
  let text: String
  let kind: String
  let indent: Int
  // The line's due date ("2026-11-19"), when it has one.
  let due: String?
}

struct WidgetList: Decodable {
  let id: String
  let title: String
  // "today", "week" or "list" (older snapshots have none).
  let role: String?
  let open: Int
  let done: Int
  let lines: [WidgetLine]
  let pending: Int
  let url: String
}

struct WidgetSnapshot: Decodable {
  let version: Int
  // The day the app made it for.
  let day: String?
  // "light", "dark" or "system", from Trove's settings.
  let appearance: String?
  // False on the free plan; missing (an older app) counts as Pro.
  let pro: Bool?
  let source: String
  let lists: [WidgetList]

  static func load() -> WidgetSnapshot? {
    guard
      let url = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
        .appendingPathComponent(snapshotFileName),
      let data = try? Data(contentsOf: url)
    else {
      return nil
    }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}

private func dayKey(_ date: Date, plusDays days: Int = 0) -> String {
  let calendar = Calendar.current
  let day = calendar.date(byAdding: .day, value: days, to: date) ?? date
  let parts = calendar.dateComponents([.year, .month, .day], from: day)
  return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

// What to show on `date`. After midnight, before the app has run again,
// Today takes the lines from This week that are now due, and the counts are
// left out as they may be out of date.
struct ShownList {
  let list: WidgetList
  let lines: [WidgetLine]
  let pending: Int
  let showCount: Bool

  static func lists(from snapshot: WidgetSnapshot?, on date: Date) -> [ShownList] {
    guard let snapshot = snapshot else { return [] }
    let today = dayKey(date)
    let stale = snapshot.day != nil && snapshot.day != today
    guard stale else {
      return snapshot.lists.map { ShownList(list: $0, lines: $0.lines, pending: $0.pending, showCount: true) }
    }
    let week = snapshot.lists.first { $0.role == "week" }
    let weekEnd = dayKey(date, plusDays: 6)
    return snapshot.lists.map { list in
      switch list.role {
      case "today":
        var lines = list.lines.filter { $0.due == nil || $0.due! <= today }
        for line in week?.lines ?? [] where (line.due ?? "9999") <= today && !lines.contains(line) {
          lines.append(line)
        }
        return ShownList(list: list, lines: lines, pending: lines.count, showCount: false)
      case "week":
        let lines = list.lines.filter { $0.due == nil || $0.due! <= weekEnd }
        return ShownList(list: list, lines: lines, pending: lines.count, showCount: false)
      default:
        return ShownList(list: list, lines: list.lines, pending: list.pending, showCount: true)
      }
    }
  }
}

struct TroveEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  let isSample: Bool

  var lists: [ShownList] { ShownList.lists(from: snapshot, on: date) }
}

struct Provider: TimelineProvider {
  private static let sample = WidgetSnapshot(
    version: 2,
    day: nil,
    appearance: nil,
    pro: nil,
    source: "pinned",
    lists: [
      WidgetList(
        id: "today",
        title: "Today",
        role: "today",
        open: 3,
        done: 1,
        lines: [
          WidgetLine(text: "Call the dentist", kind: "check", indent: 0, due: nil),
          WidgetLine(text: "Pick up groceries", kind: "check", indent: 0, due: nil),
          WidgetLine(text: "Water the plants", kind: "check", indent: 0, due: nil),
        ],
        pending: 3,
        url: "trove://home"
      ),
      WidgetList(
        id: "week",
        title: "This week",
        role: "week",
        open: 5,
        done: 1,
        lines: [
          WidgetLine(text: "Call the dentist", kind: "check", indent: 0, due: nil),
          WidgetLine(text: "Book flights", kind: "check", indent: 0, due: nil),
          WidgetLine(text: "Return library books", kind: "check", indent: 0, due: nil),
        ],
        pending: 5,
        url: "trove://home"
      ),
    ]
  )

  func placeholder(in context: Context) -> TroveEntry {
    TroveEntry(date: Date(), snapshot: Provider.sample, isSample: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (TroveEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    completion(TroveEntry(date: Date(), snapshot: WidgetSnapshot.load(), isSample: false))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TroveEntry>) -> Void) {
    // The app asks for a redraw whenever its lists change. The only change
    // on a schedule is the new day at midnight.
    let now = Date()
    let snapshot = WidgetSnapshot.load()
    let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(24 * 60 * 60))
    completion(
      Timeline(
        entries: [
          TroveEntry(date: now, snapshot: snapshot, isSample: false),
          TroveEntry(date: midnight, snapshot: snapshot, isSample: false),
        ],
        policy: .after(midnight.addingTimeInterval(60))
      )
    )
  }
}

// Trove's colors. The widget follows the app's Light, Dark or System setting.
struct Palette {
  let brand: Color
  let ink: Color
  let muted: Color
  let background: Color
  let rule: Color

  private static func hex(_ value: UInt32) -> Color {
    Color(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }

  static let light = Palette(
    brand: hex(0x2F4A37),
    ink: hex(0x1D1B18),
    muted: hex(0x6B655C),
    background: hex(0xFBF8F3),
    rule: hex(0xE6DFD4)
  )
  static let dark = Palette(
    brand: hex(0x9FC2A3),
    ink: hex(0xF3EDE3),
    muted: hex(0xB3AB9F),
    background: hex(0x1E1A15),
    rule: hex(0x3A342B)
  )

  static func isDark(_ appearance: String?, system: ColorScheme) -> Bool {
    switch appearance {
    case "dark": return true
    case "light": return false
    default: return system == .dark
    }
  }
}

struct BrandHeader: View {
  let palette: Palette

  var body: some View {
    HStack(spacing: 5) {
      Image("TroveMark")
        .resizable()
        .frame(width: 14, height: 14)
        .accessibilityHidden(true)
      Text("Trove")
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .foregroundColor(palette.brand)
      Spacer(minLength: 0)
    }
  }
}

struct LineRow: View {
  let line: WidgetLine
  let palette: Palette

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      if line.kind == "check" {
        Image(systemName: "circle")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(palette.muted)
      } else if line.kind == "bullet" {
        Text("•").foregroundColor(palette.muted)
      }
      Text(line.text)
        .font(.system(size: 13))
        .foregroundColor(palette.ink)
        .lineLimit(1)
    }
    .padding(.leading, CGFloat(line.indent) * 10)
  }
}

extension ShownList {
  var emptyText: String {
    if showCount && list.done > 0 && list.open == 0 { return "All done" }
    switch list.role {
    case "today": return "Nothing due today"
    case "week": return "Nothing due this week"
    default: return "Nothing on this list yet"
    }
  }
}

struct ListSection: View {
  let shown: ShownList
  let lineLimit: Int
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline) {
        Text(shown.list.title)
          .font(.system(size: 15, weight: .bold))
          .foregroundColor(palette.ink)
          .lineLimit(1)
        Spacer(minLength: 4)
        if shown.showCount && shown.list.open + shown.list.done > 0 {
          Text("\(shown.list.done)/\(shown.list.open + shown.list.done)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(palette.brand)
        }
      }
      if shown.lines.isEmpty {
        Text(shown.emptyText)
          .font(.system(size: 13))
          .foregroundColor(palette.muted)
      } else {
        ForEach(Array(shown.lines.prefix(lineLimit).enumerated()), id: \.offset) { _, line in
          LineRow(line: line, palette: palette)
        }
        if shown.pending > lineLimit {
          Text("\(shown.pending - lineLimit) more")
            .font(.system(size: 11))
            .foregroundColor(palette.muted)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
  }
}

struct HomeWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var systemScheme
  let entry: TroveEntry

  var body: some View {
    let lists = entry.lists
    let dark = Palette.isDark(entry.snapshot?.appearance, system: systemScheme)
    let palette = dark ? Palette.dark : Palette.light
    VStack(alignment: .leading, spacing: 6) {
      BrandHeader(palette: palette)
      if lists.isEmpty {
        Spacer(minLength: 0)
        Text("Your lists will show here once you open Trove.")
          .font(.system(size: 12))
          .foregroundColor(palette.muted)
        Spacer(minLength: 0)
      } else {
        content(lists, palette: palette)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .environment(\.colorScheme, dark ? .dark : .light)
    .widgetURL(URL(string: lists.first?.list.url ?? "trove://home"))
    .widgetBackground(palette.background)
  }

  @ViewBuilder
  private func content(_ lists: [ShownList], palette: Palette) -> some View {
    switch family {
    case .systemSmall:
      ListSection(shown: lists[0], lineLimit: 3, palette: palette)
    case .systemMedium:
      if lists.count > 1 {
        HStack(alignment: .top, spacing: 12) {
          link(lists[0]) { ListSection(shown: lists[0], lineLimit: 3, palette: palette) }
          Rectangle().fill(palette.rule).frame(width: 1)
          link(lists[1]) { ListSection(shown: lists[1], lineLimit: 3, palette: palette) }
        }
      } else {
        ListSection(shown: lists[0], lineLimit: 4, palette: palette)
      }
    default:
      if lists.count > 1 {
        link(lists[0]) { ListSection(shown: lists[0], lineLimit: 5, palette: palette) }
        Rectangle().fill(palette.rule).frame(height: 1).padding(.vertical, 2)
        link(lists[1]) { ListSection(shown: lists[1], lineLimit: 5, palette: palette) }
      } else {
        ListSection(shown: lists[0], lineLimit: 11, palette: palette)
      }
    }
  }

  @ViewBuilder
  private func link<Content: View>(_ shown: ShownList, @ViewBuilder content: () -> Content) -> some View {
    if let url = URL(string: shown.list.url) {
      Link(destination: url, label: content)
    } else {
      content()
    }
  }
}

// The Lock Screen: Today in a line, a circle or a few lines. The system
// draws these in its own tint, so they use no colors of their own.
// The large widget on the free plan: what it would show, and a way to Pro.
struct ProUpsellView: View {
  @Environment(\.colorScheme) private var systemScheme
  let entry: TroveEntry

  var body: some View {
    let dark = Palette.isDark(entry.snapshot?.appearance, system: systemScheme)
    let palette = dark ? Palette.dark : Palette.light
    VStack(alignment: .leading, spacing: 8) {
      BrandHeader(palette: palette)
      Spacer(minLength: 0)
      Text("Today and This week, side by side")
        .font(.system(size: 17, weight: .semibold))
        .foregroundColor(palette.ink)
      Text("The large widget comes with Trove Pro. Tap to see what's included.")
        .font(.system(size: 13))
        .foregroundColor(palette.muted)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .environment(\.colorScheme, dark ? .dark : .light)
    .widgetURL(URL(string: "trove://pro/widgets"))
    .widgetBackground(palette.background)
  }
}

// Lock Screen widgets on the free plan.
@available(iOSApplicationExtension 16.0, *)
struct LockScreenProView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      switch family {
      case .accessoryCircular:
        ZStack {
          AccessoryWidgetBackground()
          Image(systemName: "lock.fill")
        }
      case .accessoryInline:
        Text("Trove Pro")
      default:
        VStack(alignment: .leading, spacing: 2) {
          Text("Trove").font(.headline)
          Text("Lock Screen widgets come with Pro").font(.caption)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .widgetURL(URL(string: "trove://pro/widgets"))
    .lockScreenBackground(circular: family == .accessoryCircular)
  }
}

@available(iOSApplicationExtension 16.0, *)
struct LockScreenView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TroveEntry

  private var today: ShownList? {
    let lists = entry.lists
    return lists.first { $0.list.role == "today" } ?? lists.first
  }

  var body: some View {
    let shown = today
    Group {
      switch family {
      case .accessoryCircular:
        circular(shown)
      case .accessoryInline:
        inline(shown)
      default:
        rectangular(shown)
      }
    }
    .widgetURL(URL(string: shown?.list.url ?? "trove://home"))
    .lockScreenBackground(circular: family == .accessoryCircular)
  }

  @ViewBuilder
  private func circular(_ shown: ShownList?) -> some View {
    let left = shown?.pending ?? 0
    let total = (shown?.list.open ?? 0) + (shown?.list.done ?? 0)
    if let shown = shown, shown.showCount, total > 0 {
      Gauge(value: Double(shown.list.done), in: 0...Double(total)) {
        Image(systemName: "checklist")
      } currentValueLabel: {
        Text("\(left)")
      }
      .gaugeStyle(.accessoryCircularCapacity)
      .accessibilityLabel("\(left) left today")
    } else {
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Text("\(left)")
            .font(.system(size: 20, weight: .bold, design: .rounded))
          Text("today")
            .font(.system(size: 9, weight: .semibold))
        }
      }
      .accessibilityLabel("\(left) left today")
    }
  }

  private func inline(_ shown: ShownList?) -> some View {
    let left = shown?.pending ?? 0
    let text: String
    if shown == nil {
      text = "Trove"
    } else if left == 0 {
      text = shown!.list.role == "today" ? "Nothing due today" : shown!.emptyText
    } else {
      text = "\(left) left \(shown!.list.role == "today" ? "today" : "on \(shown!.list.title)")"
    }
    return Label(text, systemImage: "checklist")
  }

  private func rectangular(_ shown: ShownList?) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 4) {
        Image(systemName: "checklist")
          .font(.system(size: 12, weight: .semibold))
        Text(shown?.list.title ?? "Trove")
          .font(.system(size: 14, weight: .bold))
          .lineLimit(1)
        Spacer(minLength: 2)
        if let shown = shown, shown.showCount, shown.list.open + shown.list.done > 0 {
          Text("\(shown.list.done)/\(shown.list.open + shown.list.done)")
            .font(.system(size: 12, weight: .semibold))
        }
      }
      .widgetAccentable()
      if let shown = shown {
        if shown.lines.isEmpty {
          Text(shown.emptyText)
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
        } else {
          ForEach(Array(shown.lines.prefix(2).enumerated()), id: \.offset) { _, line in
            Text("○ \(line.text)")
              .font(.system(size: 13))
              .lineLimit(1)
          }
          if shown.pending > 2 {
            Text("\(shown.pending - 2) more")
              .font(.system(size: 11))
              .foregroundStyle(.secondary)
          }
        }
      } else {
        Text("Open Trove to see today's list")
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct TroveWidgetView: View {
  let entry: TroveEntry

  var body: some View {
    if #available(iOSApplicationExtension 16.0, *) {
      FamilyRouter(entry: entry)
    } else {
      HomeWidgetView(entry: entry)
    }
  }
}

@available(iOSApplicationExtension 16.0, *)
struct FamilyRouter: View {
  @Environment(\.widgetFamily) private var family
  let entry: TroveEntry

  var body: some View {
    let pro = entry.snapshot?.pro ?? true
    switch family {
    case .accessoryCircular, .accessoryRectangular, .accessoryInline:
      if pro { LockScreenView(entry: entry) } else { LockScreenProView() }
    case .systemLarge:
      if pro { HomeWidgetView(entry: entry) } else { ProUpsellView(entry: entry) }
    default:
      HomeWidgetView(entry: entry)
    }
  }
}

extension View {
  // iOS 17 draws the widget's background itself and adds its own margins.
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(for: .widget) { color }
    } else {
      padding(14).background(color)
    }
  }

  @ViewBuilder
  func lockScreenBackground(circular: Bool) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(for: .widget) {
        if circular { AccessoryWidgetBackground() } else { Color.clear }
      }
    } else {
      self
    }
  }
}

private var supportedWidgetFamilies: [WidgetFamily] {
  if #available(iOSApplicationExtension 16.0, *) {
    return [.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular, .accessoryInline]
  }
  return [.systemSmall, .systemMedium, .systemLarge]
}

@main
struct TroveWidget: Widget {
  let kind = "TroveListWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      TroveWidgetView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("What's due today. The bigger sizes show this week too.")
    .supportedFamilies(supportedWidgetFamilies)
  }
}
