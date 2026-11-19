import AppIntents
import Foundation

// Siri and the Shortcuts app. "Add to Trove" and "Open a Trove list" ask
// which list (from the ones the app last saved) and leave a command in the
// app group; the app carries it out the next time it is
// active (see src/shortcuts/useShortcutCommands.ts). Adding doesn't open the
// app, so it works hands-free; the line shows up when Trove next opens.

enum TroveShortcutQueue {
  static let appGroupIdentifier = "group.com.rylanloukusa.trove"
  static let fileName = "shortcut-commands.json"
  private static let lock = NSLock()

  private static var fileURL: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent(fileName)
  }

  private static func read() -> [[String: String]] {
    guard
      let url = fileURL,
      let data = try? Data(contentsOf: url),
      let commands = try? JSONSerialization.jsonObject(with: data) as? [[String: String]]
    else { return [] }
    return commands
  }

  static func append(_ command: [String: String]) throws {
    lock.lock()
    defer { lock.unlock() }
    guard let url = fileURL else {
      throw NSError(domain: "TroveShortcuts", code: 1, userInfo: [NSLocalizedDescriptionKey: "Trove's shared storage is not available."])
    }
    var commands = read()
    var entry = command
    entry["id"] = UUID().uuidString
    commands.append(entry)
    let data = try JSONSerialization.data(withJSONObject: commands)
    try data.write(to: url, options: .atomic)
  }

  // The waiting commands as JSON, emptying the queue.
  static func take() -> String {
    lock.lock()
    defer { lock.unlock() }
    guard let url = fileURL, let data = try? Data(contentsOf: url) else { return "[]" }
    try? FileManager.default.removeItem(at: url)
    return String(data: data, encoding: .utf8) ?? "[]"
  }
}

// The lists Siri can offer when it asks "Which list?". The app writes them
// whenever they change (see shortcutListIndex in shortcutCommands.ts).
enum TroveListIndex {
  static let fileName = "shortcut-lists.json"

  struct Choice: Codable {
    let id: String
    let title: String
  }

  private static var fileURL: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: TroveShortcutQueue.appGroupIdentifier)?
      .appendingPathComponent(fileName)
  }

  static func load() -> [Choice] {
    guard
      let url = fileURL,
      let data = try? Data(contentsOf: url),
      let choices = try? JSONDecoder().decode([Choice].self, from: data)
    else { return [] }
    return choices
  }

  static func save(_ json: String) -> Bool {
    guard
      let url = fileURL,
      let data = json.data(using: .utf8),
      (try? JSONDecoder().decode([Choice].self, from: data)) != nil
    else { return false }
    do {
      try data.write(to: url, options: .atomic)
      return true
    } catch {
      return false
    }
  }

  // The same name, then one that starts with it, then one that contains it
  // (as the app matches a typed name).
  static func matching(_ name: String) -> [Choice] {
    let wanted = normalize(name)
    guard !wanted.isEmpty else { return [] }
    let all = load().map { (choice: $0, title: normalize($0.title)) }
    let exact = all.filter { $0.title == wanted }
    if !exact.isEmpty { return exact.map { $0.choice } }
    let starts = all.filter { $0.title.hasPrefix(wanted) }
    if !starts.isEmpty { return starts.map { $0.choice } }
    return all.filter { $0.title.contains(wanted) }.map { $0.choice }
  }

  private static func normalize(_ value: String) -> String {
    var text = value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    for prefix in ["my ", "the "] where text.hasPrefix(prefix) {
      text.removeFirst(prefix.count)
    }
    if text.hasSuffix(" list") { text.removeLast(5) }
    let words = text.components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
    return words.joined(separator: " ")
  }
}

@available(iOS 16.0, *)
struct TroveListEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "List"
  static var defaultQuery = TroveListQuery()

  let id: String
  let title: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(title)")
  }

  init(_ choice: TroveListIndex.Choice) {
    id = choice.id
    title = choice.title
  }
}

@available(iOS 16.0, *)
struct TroveListQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [TroveListEntity] {
    let choices = TroveListIndex.load()
    return identifiers.compactMap { id in choices.first { $0.id == id }.map(TroveListEntity.init) }
  }

  func entities(matching string: String) async throws -> [TroveListEntity] {
    TroveListIndex.matching(string).map(TroveListEntity.init)
  }

  func suggestedEntities() async throws -> [TroveListEntity] {
    TroveListIndex.load().map(TroveListEntity.init)
  }
}

@available(iOS 16.0, *)
struct AddToTroveIntent: AppIntent {
  static var title: LocalizedStringResource = "Add to Trove"
  static var description = IntentDescription("Adds lines to one of your Trove lists. Put each line on its own line.")
  static var openAppWhenRun: Bool = false

  @Parameter(title: "What to add", requestValueDialog: "What do you want to add?")
  var text: String

  @Parameter(title: "List", requestValueDialog: "Which list?")
  var list: TroveListEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$text) to \(\.$list)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return .result(dialog: "There was nothing to add.")
    }
    try TroveShortcutQueue.append(["action": "add", "text": trimmed, "list": list.title, "listId": list.id])
    return .result(dialog: "Added to \(list.title).")
  }
}

@available(iOS 16.0, *)
struct OpenTroveListIntent: AppIntent {
  static var title: LocalizedStringResource = "Open a Trove list"
  static var description = IntentDescription("Opens one of your Trove lists.")
  static var openAppWhenRun: Bool = true

  @Parameter(title: "List", requestValueDialog: "Which list?")
  var list: TroveListEntity

  func perform() async throws -> some IntentResult {
    try TroveShortcutQueue.append(["action": "open", "list": list.title, "listId": list.id])
    return .result()
  }
}

@available(iOS 16.0, *)
struct TroveAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddToTroveIntent(),
      phrases: [
        "Add to \(\.$list) in \(.applicationName)",
        "Add to my \(\.$list) list in \(.applicationName)",
        "Add to \(.applicationName)",
        "Add something to \(.applicationName)",
        "Add to my \(.applicationName) list",
      ],
      shortTitle: "Add to Trove",
      systemImageName: "plus.circle"
    )
    AppShortcut(
      intent: OpenTroveListIntent(),
      phrases: [
        "Open \(\.$list) in \(.applicationName)",
        "Open a \(.applicationName) list",
        "Open my list in \(.applicationName)",
      ],
      shortTitle: "Open a list",
      systemImageName: "list.bullet"
    )
  }
}

// Lets the app take the waiting commands.
@objc(TroveShortcutsModule)
class TroveShortcutsModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(takePendingCommands:rejecter:)
  func takePendingCommands(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(TroveShortcutQueue.take())
  }

  // Saves the lists Siri offers, and has Siri learn their names for
  // "Add to Groceries in Trove".
  @objc(saveLists:resolver:rejecter:)
  func saveLists(
    _ json: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let saved = TroveListIndex.save(json)
    if saved, #available(iOS 16.0, *) {
      TroveAppShortcuts.updateAppShortcutParameters()
    }
    resolve(saved)
  }
}
