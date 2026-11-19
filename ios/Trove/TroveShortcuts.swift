import AppIntents
import Foundation

// Siri and the Shortcuts app. "Add to Trove" and "Open a Trove list" leave a
// command in the app group; the app carries it out the next time it is
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

@available(iOS 16.0, *)
struct AddToTroveIntent: AppIntent {
  static var title: LocalizedStringResource = "Add to Trove"
  static var description = IntentDescription("Adds lines to a Trove list. Put each line on its own line. Without a list, they go to your Inbox.")
  static var openAppWhenRun: Bool = false

  @Parameter(title: "What to add", requestValueDialog: "What do you want to add?")
  var text: String

  @Parameter(title: "List", requestValueDialog: "Which list?")
  var list: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$text) to \(\.$list)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return .result(dialog: "There was nothing to add.")
    }
    var command = ["action": "add", "text": trimmed]
    let listName = list?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !listName.isEmpty { command["list"] = listName }
    try TroveShortcutQueue.append(command)
    return .result(dialog: listName.isEmpty ? "Added to your Inbox." : "Added to \(listName).")
  }
}

@available(iOS 16.0, *)
struct OpenTroveListIntent: AppIntent {
  static var title: LocalizedStringResource = "Open a Trove list"
  static var description = IntentDescription("Opens a Trove list by its name.")
  static var openAppWhenRun: Bool = true

  @Parameter(title: "List", requestValueDialog: "Which list?")
  var list: String

  func perform() async throws -> some IntentResult {
    try TroveShortcutQueue.append(["action": "open", "list": list])
    return .result()
  }
}

@available(iOS 16.0, *)
struct TroveAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddToTroveIntent(),
      phrases: [
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
}
