import Foundation
import WidgetKit

// Hands the app's list snapshot to the home screen widget: it is written to
// the app group the widget reads from, then the widget is asked to redraw.
@objc(TroveWidgetModule)
class TroveWidgetModule: NSObject {
  private let appGroupIdentifier = "group.com.rylanloukusa.trove"
  private let snapshotFileName = "widget-snapshot.json"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(saveSnapshot:resolver:rejecter:)
  func saveSnapshot(
    _ json: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      ),
      let data = json.data(using: .utf8)
    else {
      reject("widget_unavailable", "The widget's shared storage is not available.", nil)
      return
    }

    do {
      try data.write(to: containerURL.appendingPathComponent(snapshotFileName), options: .atomic)
    } catch {
      reject("widget_write_failed", "Could not save the widget's lists.", error)
      return
    }

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    resolve(true)
  }
}
