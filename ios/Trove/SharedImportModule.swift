import Foundation

@objc(SharedImportModule)
class SharedImportModule: NSObject {
  private let appGroupIdentifier = "group.com.rylanloukusa.thewaitinglist"
  private let folderSnapshotFileName = "share-extension-folders.json"
  private let latestImportIdKey = "latestSharedImportId"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  private var sharedDefaults: UserDefaults? {
    UserDefaults(suiteName: appGroupIdentifier)
  }

  private func sharedImportsDirectory() -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent("SharedImports", isDirectory: true)
  }

  private func folderSnapshotURL() -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent(folderSnapshotFileName)
  }

  private func importDirectory(for importId: String) -> URL? {
    sharedImportsDirectory()?
      .appendingPathComponent(importId, isDirectory: true)
  }

  private func payloadURL(for importId: String) -> URL? {
    importDirectory(for: importId)?
      .appendingPathComponent("payload.json")
  }

  private func hasPayload(for importId: String) -> Bool {
    guard let payloadURL = payloadURL(for: importId) else {
      return false
    }

    return FileManager.default.fileExists(atPath: payloadURL.path)
  }

  private func latestImportIdFromFiles() -> String? {
    guard let importsDirectory = sharedImportsDirectory() else {
      return nil
    }

    let directoryKeys: [URLResourceKey] = [
      .contentModificationDateKey,
      .creationDateKey,
      .isDirectoryKey,
    ]

    guard let importDirectories = try? FileManager.default.contentsOfDirectory(
      at: importsDirectory,
      includingPropertiesForKeys: directoryKeys,
      options: [.skipsHiddenFiles]
    ) else {
      return nil
    }

    return importDirectories
      .compactMap { directory -> (importId: String, date: Date)? in
        let directoryValues = try? directory.resourceValues(forKeys: Set(directoryKeys))
        guard directoryValues?.isDirectory == true else {
          return nil
        }

        let payloadURL = directory.appendingPathComponent("payload.json")
        guard FileManager.default.fileExists(atPath: payloadURL.path) else {
          return nil
        }

        let payloadValues = try? payloadURL.resourceValues(forKeys: [
          .contentModificationDateKey,
          .creationDateKey,
        ])
        let date = payloadValues?.contentModificationDate
          ?? payloadValues?.creationDate
          ?? directoryValues?.contentModificationDate
          ?? directoryValues?.creationDate
          ?? .distantPast

        return (directory.lastPathComponent, date)
      }
      .sorted { $0.date > $1.date }
      .first?
      .importId
  }

  private func clearLatestImportIdIfNeeded(_ importId: String) {
    guard sharedDefaults?.string(forKey: latestImportIdKey) == importId else {
      return
    }

    sharedDefaults?.removeObject(forKey: latestImportIdKey)
    sharedDefaults?.synchronize()
  }

  @objc(getLatestImportId:rejecter:)
  func getLatestImportId(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    if let importId = sharedDefaults?.string(forKey: latestImportIdKey) {
      guard hasPayload(for: importId) else {
        clearLatestImportIdIfNeeded(importId)
        resolve(latestImportIdFromFiles())
        return
      }

      resolve(importId)
      return
    }

    resolve(latestImportIdFromFiles())
  }

  @objc(syncFolderSnapshot:resolver:rejecter:)
  func syncFolderSnapshot(
    _ snapshot: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let snapshotURL = folderSnapshotURL() else {
      resolve(false)
      return
    }

    do {
      let data = try JSONSerialization.data(withJSONObject: snapshot, options: [])
      try data.write(to: snapshotURL, options: .atomic)
      resolve(true)
    } catch {
      reject("shared_folder_snapshot_failed", error.localizedDescription, error)
    }
  }

  @objc(readImport:resolver:rejecter:)
  func readImport(
    _ importId: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let directory = importDirectory(for: importId) else {
      resolve(nil)
      return
    }

    let payloadURL = directory.appendingPathComponent("payload.json")
    guard FileManager.default.fileExists(atPath: payloadURL.path) else {
      clearLatestImportIdIfNeeded(importId)
      resolve(nil)
      return
    }

    do {
      let data = try Data(contentsOf: payloadURL)
      let object = try JSONSerialization.jsonObject(with: data, options: [])
      clearLatestImportIdIfNeeded(importId)
      resolve(object)
    } catch {
      reject("shared_import_read_failed", error.localizedDescription, error)
    }
  }

  @objc(clearImport:resolver:rejecter:)
  func clearImport(
    _ importId: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let directory = importDirectory(for: importId) else {
      resolve(false)
      return
    }

    do {
      if FileManager.default.fileExists(atPath: directory.path) {
        try FileManager.default.removeItem(at: directory)
      }
      clearLatestImportIdIfNeeded(importId)
      resolve(true)
    } catch {
      reject("shared_import_clear_failed", error.localizedDescription, error)
    }
  }

  @objc(markImportConsumed:resolver:rejecter:)
  func markImportConsumed(
    _ importId: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let payloadURL = payloadURL(for: importId) else {
      resolve(false)
      return
    }

    do {
      if FileManager.default.fileExists(atPath: payloadURL.path) {
        try FileManager.default.removeItem(at: payloadURL)
      }
      clearLatestImportIdIfNeeded(importId)
      resolve(true)
    } catch {
      reject("shared_import_consume_failed", error.localizedDescription, error)
    }
  }
}
