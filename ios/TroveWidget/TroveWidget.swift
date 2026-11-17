import SwiftUI
import WidgetKit

// The home screen widget: the first list pinned to Home (or the list changed
// most recently), with the lines still to do. Tapping it opens the list.
// The app writes what to show into the app group (see TroveWidgetModule).

private let appGroupIdentifier = "group.com.rylanloukusa.trove"
private let snapshotFileName = "widget-snapshot.json"

struct WidgetLine: Decodable, Hashable {
  let text: String
  let kind: String
  let indent: Int
}

struct WidgetList: Decodable {
  let id: String
  let title: String
  let open: Int
  let done: Int
  let lines: [WidgetLine]
  let pending: Int
  let url: String
}

struct WidgetSnapshot: Decodable {
  let version: Int
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

struct ListEntry: TimelineEntry {
  let date: Date
  let list: WidgetList?
  let pinned: Bool
}

struct Provider: TimelineProvider {
  private static let sample = WidgetList(
    id: "sample",
    title: "Groceries",
    open: 3,
    done: 2,
    lines: [
      WidgetLine(text: "Milk", kind: "check", indent: 0),
      WidgetLine(text: "Bread", kind: "check", indent: 0),
      WidgetLine(text: "Apples", kind: "check", indent: 0),
    ],
    pending: 3,
    url: "trove://home"
  )

  func placeholder(in context: Context) -> ListEntry {
    ListEntry(date: Date(), list: Provider.sample, pinned: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (ListEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    completion(currentEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ListEntry>) -> Void) {
    // The app asks for a redraw whenever its lists change, so there is
    // nothing to refresh on a schedule.
    completion(Timeline(entries: [currentEntry()], policy: .never))
  }

  private func currentEntry() -> ListEntry {
    let snapshot = WidgetSnapshot.load()
    return ListEntry(date: Date(), list: snapshot?.lists.first, pinned: snapshot?.source == "pinned")
  }
}

private let accent = Color(red: 23 / 255, green: 63 / 255, blue: 42 / 255)

struct LineRow: View {
  let line: WidgetLine

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      if line.kind == "check" {
        Image(systemName: "circle")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.secondary)
      } else if line.kind == "bullet" {
        Text("•").foregroundColor(.secondary)
      }
      Text(line.text)
        .font(.system(size: 13))
        .lineLimit(1)
    }
    .padding(.leading, CGFloat(line.indent) * 10)
  }
}

struct TroveWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ListEntry

  private var lineLimit: Int {
    switch family {
    case .systemSmall: return 3
    case .systemMedium: return 4
    default: return 10
    }
  }

  var body: some View {
    Group {
      if let list = entry.list {
        VStack(alignment: .leading, spacing: 4) {
          HStack(alignment: .firstTextBaseline) {
            Text(list.title)
              .font(.system(size: 15, weight: .bold))
              .foregroundColor(accent)
              .lineLimit(1)
            Spacer(minLength: 4)
            if list.open + list.done > 0 {
              Text("\(list.done)/\(list.open + list.done)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            }
          }
          if list.lines.isEmpty {
            Spacer()
            Text(list.open + list.done > 0 ? "All done" : "Nothing on this list yet")
              .font(.system(size: 13))
              .foregroundColor(.secondary)
            Spacer()
          } else {
            ForEach(Array(list.lines.prefix(lineLimit).enumerated()), id: \.offset) { _, line in
              LineRow(line: line)
            }
            if list.pending > lineLimit {
              Text("\(list.pending - lineLimit) more")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: list.url))
      } else {
        VStack(spacing: 6) {
          Text("Trove")
            .font(.system(size: 15, weight: .bold))
            .foregroundColor(accent)
          Text("Pin a list to Home to see it here")
            .font(.system(size: 12))
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "trove://home"))
      }
    }
    .widgetBackground()
  }
}

extension View {
  // iOS 17 draws the widget's background itself and adds its own margins.
  @ViewBuilder
  func widgetBackground() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(for: .widget) { Color(UIColor.systemBackground) }
    } else {
      padding(14).background(Color(UIColor.systemBackground))
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
    .configurationDisplayName("Pinned list")
    .description("The first list pinned to Home, with what's left to do.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
