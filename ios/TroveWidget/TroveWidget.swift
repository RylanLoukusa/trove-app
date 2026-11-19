import SwiftUI
import WidgetKit

// The home screen widget. Today comes first (what's due today or overdue);
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

// Trove's colors, for light and dark.
private func adaptive(light: UInt32, dark: UInt32) -> Color {
  func color(_ hex: UInt32) -> UIColor {
    UIColor(
      red: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1
    )
  }
  return Color(UIColor { $0.userInterfaceStyle == .dark ? color(dark) : color(light) })
}

private let brand = adaptive(light: 0x2F4A37, dark: 0x9FC2A3)
private let ink = adaptive(light: 0x1D1B18, dark: 0xF3EDE3)
private let muted = adaptive(light: 0x6B655C, dark: 0xB3AB9F)
private let widgetBackgroundColor = adaptive(light: 0xFBF8F3, dark: 0x1E1A15)
private let rule = adaptive(light: 0xE6DFD4, dark: 0x3A342B)

struct BrandHeader: View {
  var body: some View {
    HStack(spacing: 5) {
      Image("TroveMark")
        .resizable()
        .frame(width: 14, height: 14)
        .accessibilityHidden(true)
      Text("Trove")
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .foregroundColor(brand)
      Spacer(minLength: 0)
    }
  }
}

struct LineRow: View {
  let line: WidgetLine

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      if line.kind == "check" {
        Image(systemName: "circle")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(muted)
      } else if line.kind == "bullet" {
        Text("•").foregroundColor(muted)
      }
      Text(line.text)
        .font(.system(size: 13))
        .foregroundColor(ink)
        .lineLimit(1)
    }
    .padding(.leading, CGFloat(line.indent) * 10)
  }
}

struct ListSection: View {
  let shown: ShownList
  let lineLimit: Int

  private var emptyText: String {
    if shown.showCount && shown.list.done > 0 && shown.list.open == 0 { return "All done" }
    switch shown.list.role {
    case "today": return "Nothing due today"
    case "week": return "Nothing due this week"
    default: return "Nothing on this list yet"
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline) {
        Text(shown.list.title)
          .font(.system(size: 15, weight: .bold))
          .foregroundColor(ink)
          .lineLimit(1)
        Spacer(minLength: 4)
        if shown.showCount && shown.list.open + shown.list.done > 0 {
          Text("\(shown.list.done)/\(shown.list.open + shown.list.done)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(brand)
        }
      }
      if shown.lines.isEmpty {
        Text(emptyText)
          .font(.system(size: 13))
          .foregroundColor(muted)
      } else {
        ForEach(Array(shown.lines.prefix(lineLimit).enumerated()), id: \.offset) { _, line in
          LineRow(line: line)
        }
        if shown.pending > lineLimit {
          Text("\(shown.pending - lineLimit) more")
            .font(.system(size: 11))
            .foregroundColor(muted)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
  }
}

struct TroveWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TroveEntry

  var body: some View {
    let lists = entry.lists
    VStack(alignment: .leading, spacing: 6) {
      BrandHeader()
      if lists.isEmpty {
        Spacer(minLength: 0)
        Text("Your lists will show here once you open Trove.")
          .font(.system(size: 12))
          .foregroundColor(muted)
        Spacer(minLength: 0)
      } else {
        content(lists)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: lists.first?.list.url ?? "trove://home"))
    .widgetBackground()
  }

  @ViewBuilder
  private func content(_ lists: [ShownList]) -> some View {
    switch family {
    case .systemSmall:
      ListSection(shown: lists[0], lineLimit: 3)
    case .systemMedium:
      if lists.count > 1 {
        HStack(alignment: .top, spacing: 12) {
          link(lists[0]) { ListSection(shown: lists[0], lineLimit: 3) }
          Rectangle().fill(rule).frame(width: 1)
          link(lists[1]) { ListSection(shown: lists[1], lineLimit: 3) }
        }
      } else {
        ListSection(shown: lists[0], lineLimit: 4)
      }
    default:
      if lists.count > 1 {
        link(lists[0]) { ListSection(shown: lists[0], lineLimit: 5) }
        Rectangle().fill(rule).frame(height: 1).padding(.vertical, 2)
        link(lists[1]) { ListSection(shown: lists[1], lineLimit: 5) }
      } else {
        ListSection(shown: lists[0], lineLimit: 11)
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

extension View {
  // iOS 17 draws the widget's background itself and adds its own margins.
  @ViewBuilder
  func widgetBackground() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(for: .widget) { widgetBackgroundColor }
    } else {
      padding(14).background(widgetBackgroundColor)
    }
  }
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
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
