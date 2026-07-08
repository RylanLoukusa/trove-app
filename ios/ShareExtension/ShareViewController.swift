import UIKit
import os
import UniformTypeIdentifiers

private enum TWLStyle {
  static let background = UIColor(red: 0.09, green: 0.09, blue: 0.10, alpha: 1)
  static let surface = UIColor(red: 0.16, green: 0.16, blue: 0.17, alpha: 1)
  static let surfaceRaised = UIColor(red: 0.20, green: 0.19, blue: 0.18, alpha: 1)
  static let ink = UIColor(red: 0.96, green: 0.94, blue: 0.91, alpha: 1)
  static let muted = UIColor(red: 0.64, green: 0.61, blue: 0.57, alpha: 1)
  static let border = UIColor(red: 0.30, green: 0.28, blue: 0.25, alpha: 1)
  static let accent = UIColor(red: 0.43, green: 0.56, blue: 0.45, alpha: 1)
  static let accentDark = UIColor(red: 0.26, green: 0.40, blue: 0.29, alpha: 1)
  static let warm = UIColor(red: 0.87, green: 0.68, blue: 0.45, alpha: 1)
  static let danger = UIColor(red: 0.72, green: 0.36, blue: 0.33, alpha: 1)
}

private struct SharedImportMediaItem: Codable {
  let id: String
  let localUri: String
  let mediaType: String
}

private struct SharedImportPayload: Codable {
  let autoSave: Bool?
  let folderId: String?
  let id: String
  let mediaItems: [SharedImportMediaItem]
  let sharedText: String?
  let sourceUrl: String?
  let title: String?
}

private struct SharedFolder: Codable {
  let id: String
  let name: String
  let parentFolderId: String?
  let icon: String?
  let color: String?
}

private struct SharedFolderSnapshot: Codable {
  let defaultFolderId: String?
  let folders: [SharedFolder]
}

private struct FolderPickerRow {
  let folder: SharedFolder?
  let depth: Int
  let detail: String?
  let hasChildren: Bool
  let isExpanded: Bool
  let isSearchResult: Bool
}

private struct ShareDraft {
  let importId: String
  let importDirectory: URL
  let mediaItems: [SharedImportMediaItem]
  let sharedText: String?
  let sourceUrl: String?
  let title: String?
}

final class ShareViewController: UIViewController {
  private let appGroupIdentifier = "group.com.rylanloukusa.thewaitinglist"
  private let folderSnapshotFileName = "share-extension-folders.json"
  private let latestImportIdKey = "latestSharedImportId"
  private let logger = Logger(subsystem: "com.rylanloukusa.thewaitinglist.shareextension", category: "ShareImport")

  private let scrollView = UIScrollView()
  private let contentStack = UIStackView()
  private let headerLabel = UILabel()
  private let statusLabel = UILabel()
  private let loadingIndicator = UIActivityIndicatorView(style: .medium)
  private let titleField = UITextField()
  private let folderLabel = UILabel()
  private let folderButton = UIButton(type: .system)
  private let folderButtonIconContainer = UIView()
  private let folderButtonIconLabel = UILabel()
  private let folderButtonTitleLabel = UILabel()
  private let folderButtonChevronImageView = UIImageView()
  private let folderPickerStack = UIStackView()
  private let folderSearchField = UITextField()
  private let folderRowsStack = UIStackView()
  private let noteLabel = UILabel()
  private let noteTextView = UITextView()
  private let sourceLabel = UILabel()
  private let mediaLabel = UILabel()
  private let saveButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)
  private let buttonStack = UIStackView()

  private var didCompleteRequest = false
  private var didStartProcessing = false
  private var currentDraft: ShareDraft?
  private var expandedFolderIds: Set<String> = [""]
  private var isFolderPickerOpen = false
  private var selectedFolderId: String?
  private var sharedFolders: [SharedFolder] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    logNotice("TWL share extension started")
    configureView()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !didStartProcessing else { return }
    didStartProcessing = true
    logNotice("TWL share extension appeared")
    processSharedContent()
  }

  private func configureView() {
    overrideUserInterfaceStyle = .dark
    view.backgroundColor = TWLStyle.background

    scrollView.keyboardDismissMode = .interactive
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(scrollView)

    contentStack.axis = .vertical
    contentStack.alignment = .fill
    contentStack.spacing = 12
    contentStack.layoutMargins = UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
    contentStack.isLayoutMarginsRelativeArrangement = true
    contentStack.translatesAutoresizingMaskIntoConstraints = false
    scrollView.addSubview(contentStack)

    headerLabel.text = "Save to Trove"
    headerLabel.font = .preferredFont(forTextStyle: .title3)
    headerLabel.adjustsFontForContentSizeCategory = true
    headerLabel.textColor = TWLStyle.ink
    headerLabel.textAlignment = .center
    headerLabel.numberOfLines = 0

    statusLabel.text = "Preparing shared item..."
    statusLabel.font = .preferredFont(forTextStyle: .subheadline)
    statusLabel.adjustsFontForContentSizeCategory = true
    statusLabel.textColor = TWLStyle.muted
    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0

    loadingIndicator.startAnimating()

    titleField.borderStyle = .none
    titleField.clearButtonMode = .whileEditing
    titleField.font = .preferredFont(forTextStyle: .body)
    titleField.adjustsFontForContentSizeCategory = true
    titleField.backgroundColor = TWLStyle.surface
    titleField.layer.borderColor = TWLStyle.border.cgColor
    titleField.layer.borderWidth = 1
    titleField.layer.cornerRadius = 12
    titleField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    titleField.leftViewMode = .always
    titleField.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    titleField.rightViewMode = .unlessEditing
    titleField.textColor = TWLStyle.ink
    titleField.placeholder = "Title"
    titleField.attributedPlaceholder = NSAttributedString(string: "Title", attributes: [.foregroundColor: TWLStyle.muted])
    titleField.returnKeyType = .done
    titleField.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true

    folderLabel.text = "Folder"
    folderLabel.font = .preferredFont(forTextStyle: .subheadline)
    folderLabel.adjustsFontForContentSizeCategory = true
    folderLabel.textColor = TWLStyle.muted

    folderButton.contentHorizontalAlignment = .leading
    folderButton.backgroundColor = TWLStyle.surface
    folderButton.layer.borderColor = TWLStyle.border.cgColor
    folderButton.layer.borderWidth = 1
    folderButton.layer.cornerRadius = 16
    folderButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 46).isActive = true
    folderButton.addTarget(self, action: #selector(toggleFolderPicker), for: .touchUpInside)

    let folderButtonContent = UIStackView()
    folderButtonContent.axis = .horizontal
    folderButtonContent.alignment = .center
    folderButtonContent.spacing = 10
    folderButtonContent.translatesAutoresizingMaskIntoConstraints = false
    folderButtonContent.isUserInteractionEnabled = false
    folderButton.addSubview(folderButtonContent)

    folderButtonIconContainer.translatesAutoresizingMaskIntoConstraints = false
    folderButtonIconContainer.layer.borderWidth = 1
    folderButtonIconContainer.layer.cornerRadius = 9
    folderButtonIconContainer.widthAnchor.constraint(equalToConstant: 32).isActive = true
    folderButtonIconContainer.heightAnchor.constraint(equalToConstant: 32).isActive = true

    folderButtonIconLabel.translatesAutoresizingMaskIntoConstraints = false
    folderButtonIconLabel.textAlignment = .center
    folderButtonIconLabel.font = .preferredFont(forTextStyle: .caption1)
    folderButtonIconLabel.adjustsFontForContentSizeCategory = true
    folderButtonIconLabel.textColor = TWLStyle.ink
    folderButtonIconContainer.addSubview(folderButtonIconLabel)

    folderButtonTitleLabel.font = .preferredFont(forTextStyle: .body)
    folderButtonTitleLabel.adjustsFontForContentSizeCategory = true
    folderButtonTitleLabel.textColor = TWLStyle.ink
    folderButtonTitleLabel.numberOfLines = 1
    folderButtonTitleLabel.lineBreakMode = .byTruncatingMiddle

    folderButtonChevronImageView.tintColor = TWLStyle.muted
    folderButtonChevronImageView.contentMode = .scaleAspectFit
    folderButtonChevronImageView.setContentHuggingPriority(.required, for: .horizontal)
    folderButtonChevronImageView.widthAnchor.constraint(equalToConstant: 18).isActive = true
    folderButtonChevronImageView.heightAnchor.constraint(equalToConstant: 18).isActive = true

    folderButtonContent.addArrangedSubview(folderButtonIconContainer)
    folderButtonContent.addArrangedSubview(folderButtonTitleLabel)
    folderButtonContent.addArrangedSubview(folderButtonChevronImageView)

    NSLayoutConstraint.activate([
      folderButtonContent.topAnchor.constraint(equalTo: folderButton.topAnchor, constant: 8),
      folderButtonContent.leadingAnchor.constraint(equalTo: folderButton.leadingAnchor, constant: 14),
      folderButtonContent.trailingAnchor.constraint(equalTo: folderButton.trailingAnchor, constant: -14),
      folderButtonContent.bottomAnchor.constraint(equalTo: folderButton.bottomAnchor, constant: -8),
      folderButtonIconLabel.centerXAnchor.constraint(equalTo: folderButtonIconContainer.centerXAnchor),
      folderButtonIconLabel.centerYAnchor.constraint(equalTo: folderButtonIconContainer.centerYAnchor),
    ])

    folderPickerStack.axis = .vertical
    folderPickerStack.alignment = .fill
    folderPickerStack.spacing = 8
    folderPickerStack.isHidden = true

    folderSearchField.borderStyle = .none
    folderSearchField.clearButtonMode = .whileEditing
    folderSearchField.font = .preferredFont(forTextStyle: .body)
    folderSearchField.adjustsFontForContentSizeCategory = true
    folderSearchField.backgroundColor = TWLStyle.surface
    folderSearchField.layer.borderColor = TWLStyle.border.cgColor
    folderSearchField.layer.borderWidth = 1
    folderSearchField.layer.cornerRadius = 12
    folderSearchField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    folderSearchField.leftViewMode = .always
    folderSearchField.textColor = TWLStyle.ink
    folderSearchField.placeholder = "Search folders..."
    folderSearchField.attributedPlaceholder = NSAttributedString(string: "Search folders...", attributes: [.foregroundColor: TWLStyle.muted])
    folderSearchField.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    folderSearchField.addTarget(self, action: #selector(folderSearchChanged), for: .editingChanged)

    folderRowsStack.axis = .vertical
    folderRowsStack.alignment = .fill
    folderRowsStack.spacing = 6

    folderPickerStack.addArrangedSubview(folderSearchField)
    folderPickerStack.addArrangedSubview(folderRowsStack)

    noteLabel.text = "Note"
    noteLabel.font = .preferredFont(forTextStyle: .subheadline)
    noteLabel.adjustsFontForContentSizeCategory = true
    noteLabel.textColor = TWLStyle.muted

    noteTextView.font = .preferredFont(forTextStyle: .body)
    noteTextView.adjustsFontForContentSizeCategory = true
    noteTextView.backgroundColor = TWLStyle.surface
    noteTextView.layer.borderColor = TWLStyle.border.cgColor
    noteTextView.layer.borderWidth = 1
    noteTextView.layer.cornerRadius = 16
    noteTextView.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
    noteTextView.textColor = TWLStyle.ink
    noteTextView.heightAnchor.constraint(greaterThanOrEqualToConstant: 104).isActive = true

    sourceLabel.font = .preferredFont(forTextStyle: .footnote)
    sourceLabel.adjustsFontForContentSizeCategory = true
    sourceLabel.textColor = TWLStyle.muted
    sourceLabel.numberOfLines = 3

    mediaLabel.font = .preferredFont(forTextStyle: .footnote)
    mediaLabel.adjustsFontForContentSizeCategory = true
    mediaLabel.textColor = TWLStyle.muted
    mediaLabel.numberOfLines = 2

    saveButton.setTitle("Save", for: .normal)
    saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    saveButton.backgroundColor = TWLStyle.accentDark
    saveButton.setTitleColor(.white, for: .normal)
    saveButton.layer.cornerRadius = 16
    saveButton.heightAnchor.constraint(equalToConstant: 46).isActive = true
    saveButton.addTarget(self, action: #selector(saveButtonTapped), for: .touchUpInside)

    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
    cancelButton.setTitleColor(TWLStyle.accent, for: .normal)
    cancelButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
    cancelButton.addTarget(self, action: #selector(cancelButtonTapped), for: .touchUpInside)

    buttonStack.axis = .vertical
    buttonStack.alignment = .fill
    buttonStack.spacing = 8
    buttonStack.addArrangedSubview(saveButton)
    buttonStack.addArrangedSubview(cancelButton)

    [headerLabel, statusLabel, loadingIndicator, titleField, folderLabel, folderButton, folderPickerStack, noteLabel, noteTextView, sourceLabel, mediaLabel, buttonStack].forEach {
      contentStack.addArrangedSubview($0)
    }

    setComposerVisible(false)

    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: view.topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
      contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
      contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
      contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
      contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),
    ])
  }

  private func setComposerVisible(_ isVisible: Bool) {
    titleField.isHidden = !isVisible
    folderLabel.isHidden = !isVisible
    folderButton.isHidden = !isVisible
    folderPickerStack.isHidden = !isVisible || !isFolderPickerOpen
    noteLabel.isHidden = !isVisible
    noteTextView.isHidden = !isVisible
    sourceLabel.isHidden = !isVisible
    mediaLabel.isHidden = !isVisible
    buttonStack.isHidden = !isVisible
  }

  private func loadFolderSnapshot() -> SharedFolderSnapshot? {
    guard let snapshotURL = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent(folderSnapshotFileName),
      FileManager.default.fileExists(atPath: snapshotURL.path)
    else {
      logNotice("TWL folder snapshot unavailable")
      return nil
    }

    do {
      let data = try Data(contentsOf: snapshotURL)
      let snapshot = try JSONDecoder().decode(SharedFolderSnapshot.self, from: data)
      logNotice("TWL folder snapshot loaded count=\(snapshot.folders.count)")
      return snapshot
    } catch {
      logError("TWL folder snapshot read failed: \(error.localizedDescription)")
      return nil
    }
  }

  @objc private func toggleFolderPicker() {
    isFolderPickerOpen.toggle()
    folderPickerStack.isHidden = !isFolderPickerOpen
    if isFolderPickerOpen {
      expandSelectedFolderPath()
    }
    renderFolderPicker()
  }

  @objc private func folderSearchChanged() {
    renderFolderPicker()
  }

  private func configureFolderPicker() {
    if selectedFolderId == nil {
      selectedFolderId = ""
    }

    updateFolderSummary()
    expandSelectedFolderPath()
    renderFolderPicker()
    folderButton.isEnabled = true
    saveButton.isEnabled = selectedFolderId != nil
  }

  private func updateFolderSummary() {
    let selectedFolder = Self.folder(for: selectedFolderId, in: sharedFolders)
    let title = Self.folderPathLabel(for: selectedFolderId, in: sharedFolders) ?? "Home"
    let tintColor = Self.folderTintColor(for: selectedFolder)

    folderButtonIconContainer.backgroundColor = tintColor.withAlphaComponent(0.22)
    folderButtonIconContainer.layer.borderColor = tintColor.withAlphaComponent(0.55).cgColor
    folderButtonIconLabel.text = Self.folderIconText(for: selectedFolder)
    folderButtonTitleLabel.text = title
    folderButtonChevronImageView.image = UIImage(systemName: isFolderPickerOpen ? "chevron.up" : "chevron.down")
  }

  private func expandSelectedFolderPath() {
    expandedFolderIds.insert("")
    guard let selectedFolderId, !selectedFolderId.isEmpty else {
      return
    }

    Self.folderPath(for: selectedFolderId, in: sharedFolders).forEach { folder in
      expandedFolderIds.insert(folder.id)
    }
  }

  private func renderFolderPicker() {
    updateFolderSummary()
    folderRowsStack.arrangedSubviews.forEach { view in
      folderRowsStack.removeArrangedSubview(view)
      view.removeFromSuperview()
    }

    let query = folderSearchField.text?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    let rows = query.isEmpty ? browseFolderRows() : searchFolderRows(query: query)

    if rows.isEmpty {
      let emptyLabel = UILabel()
      emptyLabel.text = "No folders found."
      emptyLabel.textColor = TWLStyle.muted
      emptyLabel.font = .preferredFont(forTextStyle: .subheadline)
      emptyLabel.adjustsFontForContentSizeCategory = true
      emptyLabel.textAlignment = .center
      folderRowsStack.addArrangedSubview(emptyLabel)
      return
    }

    rows.forEach { row in
      folderRowsStack.addArrangedSubview(makeFolderRow(row))
    }
  }

  private func browseFolderRows() -> [FolderPickerRow] {
    var rows = [
      FolderPickerRow(
        folder: nil,
        depth: 0,
        detail: "Top level",
        hasChildren: sharedFolders.contains { ($0.parentFolderId ?? "").isEmpty },
        isExpanded: expandedFolderIds.contains(""),
        isSearchResult: false
      )
    ]

    guard expandedFolderIds.contains("") else {
      return rows
    }

    let folderIds = Set(sharedFolders.map { $0.id })
    let childrenByParent = Dictionary(grouping: sharedFolders) { folder -> String in
      guard let parentFolderId = folder.parentFolderId,
        !parentFolderId.isEmpty,
        folderIds.contains(parentFolderId)
      else {
        return ""
      }

      return parentFolderId
    }

    func visit(parentId: String, depth: Int) {
      (childrenByParent[parentId] ?? [])
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        .forEach { folder in
          let children = childrenByParent[folder.id] ?? []
          rows.append(
            FolderPickerRow(
              folder: folder,
              depth: depth,
              detail: Self.parentPathLabel(for: folder.id, in: sharedFolders),
              hasChildren: !children.isEmpty,
              isExpanded: expandedFolderIds.contains(folder.id),
              isSearchResult: false
            )
          )
          if expandedFolderIds.contains(folder.id) {
            visit(parentId: folder.id, depth: depth + 1)
          }
        }
    }

    visit(parentId: "", depth: 1)
    return rows
  }

  private func searchFolderRows(query: String) -> [FolderPickerRow] {
    var rows: [FolderPickerRow] = []

    if "home".contains(query) {
      rows.append(
        FolderPickerRow(
          folder: nil,
          depth: 0,
          detail: "Top level",
          hasChildren: false,
          isExpanded: false,
          isSearchResult: true
        )
      )
    }

    rows.append(
      contentsOf: sharedFolders
        .filter { folder in
          (Self.folderPathLabel(for: folder.id, in: sharedFolders) ?? folder.name)
            .lowercased()
            .contains(query)
        }
        .sorted {
          (Self.folderPathLabel(for: $0.id, in: sharedFolders) ?? $0.name)
            .localizedCaseInsensitiveCompare(Self.folderPathLabel(for: $1.id, in: sharedFolders) ?? $1.name) == .orderedAscending
        }
        .map { folder in
          FolderPickerRow(
            folder: folder,
            depth: max(Self.folderPath(for: folder.id, in: sharedFolders).count - 1, 0),
            detail: Self.parentPathLabel(for: folder.id, in: sharedFolders),
            hasChildren: false,
            isExpanded: false,
            isSearchResult: true
          )
        }
    )

    return rows
  }

  private func makeFolderRow(_ row: FolderPickerRow) -> UIView {
    let folderId = row.folder?.id ?? ""
    let isSelected = selectedFolderId == folderId
    let rowControl = UIControl()
    rowControl.backgroundColor = isSelected ? TWLStyle.accentDark.withAlphaComponent(0.34) : TWLStyle.surface
    rowControl.layer.borderColor = (isSelected ? TWLStyle.accent : TWLStyle.border).cgColor
    rowControl.layer.borderWidth = isSelected ? 1.5 : 1
    rowControl.layer.cornerRadius = 14
    rowControl.clipsToBounds = true

    let rowStack = UIStackView()
    rowStack.axis = .horizontal
    rowStack.alignment = .center
    rowStack.spacing = 10
    rowStack.translatesAutoresizingMaskIntoConstraints = false
    rowStack.isUserInteractionEnabled = false
    rowControl.addSubview(rowStack)

    let disclosureButton = UIButton(type: .system)
    disclosureButton.setTitle(row.hasChildren ? (row.isExpanded ? "v" : ">") : "", for: .normal)
    disclosureButton.setTitleColor(TWLStyle.muted, for: .normal)
    disclosureButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
    disclosureButton.widthAnchor.constraint(equalToConstant: 24).isActive = true
    disclosureButton.heightAnchor.constraint(equalToConstant: 32).isActive = true
    disclosureButton.isEnabled = false
    disclosureButton.isUserInteractionEnabled = false

    let iconContainer = UIView()
    iconContainer.translatesAutoresizingMaskIntoConstraints = false
    iconContainer.backgroundColor = Self.folderTintColor(for: row.folder).withAlphaComponent(0.22)
    iconContainer.layer.borderColor = Self.folderTintColor(for: row.folder).withAlphaComponent(0.55).cgColor
    iconContainer.layer.borderWidth = 1
    iconContainer.layer.cornerRadius = 9
    iconContainer.widthAnchor.constraint(equalToConstant: 32).isActive = true
    iconContainer.heightAnchor.constraint(equalToConstant: 32).isActive = true

    let iconLabel = UILabel()
    iconLabel.translatesAutoresizingMaskIntoConstraints = false
    iconLabel.text = Self.folderIconText(for: row.folder)
    iconLabel.textAlignment = .center
    iconLabel.font = .preferredFont(forTextStyle: .caption1)
    iconLabel.adjustsFontForContentSizeCategory = true
    iconLabel.textColor = TWLStyle.ink
    iconContainer.addSubview(iconLabel)

    NSLayoutConstraint.activate([
      iconLabel.centerXAnchor.constraint(equalTo: iconContainer.centerXAnchor),
      iconLabel.centerYAnchor.constraint(equalTo: iconContainer.centerYAnchor),
    ])

    let labelStack = UIStackView()
    labelStack.axis = .vertical
    labelStack.alignment = .fill
    labelStack.spacing = 2

    let nameLabel = UILabel()
    nameLabel.text = row.folder?.name ?? "Home"
    nameLabel.font = .preferredFont(forTextStyle: .body)
    nameLabel.adjustsFontForContentSizeCategory = true
    nameLabel.textColor = TWLStyle.ink
    nameLabel.numberOfLines = 1
    nameLabel.lineBreakMode = .byTruncatingTail

    let detailLabel = UILabel()
    if let detail = row.detail, !detail.isEmpty {
      detailLabel.text = folderId.isEmpty ? detail : "In \(detail)"
    } else {
      detailLabel.text = nil
    }
    detailLabel.font = .preferredFont(forTextStyle: .caption1)
    detailLabel.adjustsFontForContentSizeCategory = true
    detailLabel.textColor = TWLStyle.muted
    detailLabel.numberOfLines = 1
    detailLabel.lineBreakMode = .byTruncatingMiddle

    labelStack.addArrangedSubview(nameLabel)
    if detailLabel.text != nil {
      labelStack.addArrangedSubview(detailLabel)
    }

    let checkLabel = UILabel()
    checkLabel.text = isSelected ? "✓" : ""
    checkLabel.textAlignment = .right
    checkLabel.font = .preferredFont(forTextStyle: .headline)
    checkLabel.adjustsFontForContentSizeCategory = true
    checkLabel.textColor = TWLStyle.accent
    checkLabel.widthAnchor.constraint(equalToConstant: 26).isActive = true

    rowStack.addArrangedSubview(disclosureButton)
    rowStack.addArrangedSubview(iconContainer)
    rowStack.addArrangedSubview(labelStack)
    rowStack.addArrangedSubview(checkLabel)

    let leadingInset = CGFloat(min(row.depth, 5)) * 18 + 10
    NSLayoutConstraint.activate([
      rowStack.topAnchor.constraint(equalTo: rowControl.topAnchor, constant: 10),
      rowStack.leadingAnchor.constraint(equalTo: rowControl.leadingAnchor, constant: leadingInset),
      rowStack.trailingAnchor.constraint(equalTo: rowControl.trailingAnchor, constant: -12),
      rowStack.bottomAnchor.constraint(equalTo: rowControl.bottomAnchor, constant: -10),
      rowControl.heightAnchor.constraint(greaterThanOrEqualToConstant: 56),
    ])

    let selectHitButton = UIButton(type: .custom)
    selectHitButton.translatesAutoresizingMaskIntoConstraints = false
    selectHitButton.backgroundColor = .clear
    selectHitButton.addAction(UIAction { [weak self] _ in
      self?.selectFolder(folderId)
    }, for: .touchUpInside)
    rowControl.addSubview(selectHitButton)

    let selectLeadingInset = row.hasChildren && !row.isSearchResult ? leadingInset + 38 : 0
    NSLayoutConstraint.activate([
      selectHitButton.topAnchor.constraint(equalTo: rowControl.topAnchor),
      selectHitButton.leadingAnchor.constraint(equalTo: rowControl.leadingAnchor, constant: selectLeadingInset),
      selectHitButton.trailingAnchor.constraint(equalTo: rowControl.trailingAnchor),
      selectHitButton.bottomAnchor.constraint(equalTo: rowControl.bottomAnchor),
    ])

    if row.hasChildren && !row.isSearchResult {
      let disclosureHitButton = UIButton(type: .custom)
      disclosureHitButton.translatesAutoresizingMaskIntoConstraints = false
      disclosureHitButton.backgroundColor = .clear
      disclosureHitButton.addAction(UIAction { [weak self] _ in
        self?.toggleExpandedFolder(folderId)
      }, for: .touchUpInside)
      rowControl.addSubview(disclosureHitButton)

      NSLayoutConstraint.activate([
        disclosureHitButton.topAnchor.constraint(equalTo: rowControl.topAnchor),
        disclosureHitButton.leadingAnchor.constraint(equalTo: rowControl.leadingAnchor, constant: leadingInset),
        disclosureHitButton.bottomAnchor.constraint(equalTo: rowControl.bottomAnchor),
        disclosureHitButton.widthAnchor.constraint(equalToConstant: 38),
      ])
    }

    return rowControl
  }

  private func selectFolder(_ folderId: String) {
    selectedFolderId = folderId
    expandSelectedFolderPath()
    isFolderPickerOpen = true
    folderPickerStack.isHidden = false
    renderFolderPicker()
    saveButton.isEnabled = true
  }

  private func toggleExpandedFolder(_ folderId: String) {
    if expandedFolderIds.contains(folderId) {
      expandedFolderIds.remove(folderId)
    } else {
      expandedFolderIds.insert(folderId)
    }

    renderFolderPicker()
  }

  private func processSharedContent() {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
      logError("TWL app group container missing")
      showLoadFailure("The shared container is unavailable.")
      return
    }
    logNotice("TWL app group container found")

    let importId = UUID().uuidString
    let importDirectory = containerURL
      .appendingPathComponent("SharedImports", isDirectory: true)
      .appendingPathComponent(importId, isDirectory: true)

    do {
      try FileManager.default.createDirectory(at: importDirectory, withIntermediateDirectories: true)
    } catch {
      logError("TWL import directory create failed: \(error.localizedDescription)")
      showLoadFailure("The shared item could not be prepared.")
      return
    }
    logNotice("TWL import id: \(importId)")

    var mediaItems: [SharedImportMediaItem] = []
    var sharedTexts: [String] = []
    var sourceUrl: String?
    let group = DispatchGroup()
    let lock = NSLock()
    var didFinishLoading = false

    let providers = extensionContext?.inputItems
      .compactMap { $0 as? NSExtensionItem }
      .flatMap { $0.attachments ?? [] }
      ?? []

    logNotice("TWL attachment provider count: \(providers.count)")

    providers
      .enumerated()
      .forEach { index, provider in
        logNotice("TWL provider \(index) types: \(provider.registeredTypeIdentifiers.joined(separator: ", "))")

        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          group.enter()
          logNotice("TWL loading URL from provider \(index)")
          _ = provider.loadObject(ofClass: URL.self) { item, error in
            defer { group.leave() }
            if let error {
              self.logError("TWL URL load failed: \(error.localizedDescription)")
            }

            if let url = item {
              lock.lock()
              sourceUrl = sourceUrl ?? url.absoluteString
              lock.unlock()
              self.logNotice("TWL URL loaded: \(url.absoluteString)")
            }
          }
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          group.enter()
          logNotice("TWL loading text from provider \(index)")
          _ = provider.loadObject(ofClass: NSString.self) { item, error in
            defer { group.leave() }
            if let error {
              self.logError("TWL text load failed: \(error.localizedDescription)")
            }

            let text = item?.description

            guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
              self.logNotice("TWL text load returned empty")
              return
            }

            lock.lock()
            if sourceUrl == nil, let detectedURL = Self.firstURL(in: trimmed) {
              sourceUrl = detectedURL.absoluteString
            }
            sharedTexts.append(trimmed)
            lock.unlock()
            self.logNotice("TWL text loaded with length: \(trimmed.count)")
          }
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
          group.enter()
          logNotice("TWL loading image from provider \(index)")
          loadMediaFile(from: provider, typeIdentifier: UTType.image.identifier, mediaType: "image", importDirectory: importDirectory) { item in
            defer { group.leave() }
            guard let item else {
              self.logError("TWL image load returned nil")
              return
            }
            lock.lock()
            mediaItems.append(item)
            lock.unlock()
            self.logNotice("TWL image loaded: \(item.localUri)")
          }
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
          group.enter()
          logNotice("TWL loading video from provider \(index)")
          loadMediaFile(from: provider, typeIdentifier: UTType.movie.identifier, mediaType: "video", importDirectory: importDirectory) { item in
            defer { group.leave() }
            guard let item else {
              self.logError("TWL video load returned nil")
              return
            }
            lock.lock()
            mediaItems.append(item)
            lock.unlock()
            self.logNotice("TWL video loaded: \(item.localUri)")
          }
        }
      }

    let finishLoading = {
      if didFinishLoading { return }
      didFinishLoading = true

      lock.lock()
      let nextMediaItems = mediaItems
      let nextSharedText = sharedTexts.first
      let nextSourceUrl = sourceUrl
      lock.unlock()

      let draft = ShareDraft(
        importId: importId,
        importDirectory: importDirectory,
        mediaItems: nextMediaItems,
        sharedText: nextSharedText,
        sourceUrl: nextSourceUrl,
        title: Self.title(for: nextSourceUrl, sharedText: nextSharedText)
      )

      self.currentDraft = draft
      self.showComposer(for: draft)
    }

    group.notify(queue: .main, execute: finishLoading)

    DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
      guard !didFinishLoading else {
        return
      }

      self.logNotice("TWL import timeout reached; showing composer with partial data")
      finishLoading()
    }
  }

  private func showComposer(for draft: ShareDraft) {
    loadingIndicator.stopAnimating()
    loadingIndicator.isHidden = true
    setComposerVisible(true)

    let folderSnapshot = loadFolderSnapshot()
    sharedFolders = folderSnapshot?.folders ?? []
    selectedFolderId = Self.validDefaultFolderId(from: folderSnapshot) ?? ""

    titleField.text = draft.title ?? "Shared item"
    noteTextView.text = draft.sharedText ?? ""
    configureFolderPicker()

    if let sourceUrl = draft.sourceUrl {
      sourceLabel.text = "Link: \(sourceUrl)"
      sourceLabel.isHidden = false
    } else {
      sourceLabel.isHidden = true
    }

    if draft.mediaItems.isEmpty {
      mediaLabel.isHidden = true
    } else {
      let imageCount = draft.mediaItems.filter { $0.mediaType == "image" }.count
      let videoCount = draft.mediaItems.filter { $0.mediaType == "video" }.count
      mediaLabel.text = Self.mediaSummary(imageCount: imageCount, videoCount: videoCount)
      mediaLabel.isHidden = false
    }

    statusLabel.text = "Review and save this shared item."
    statusLabel.textColor = TWLStyle.muted
    saveButton.isEnabled = selectedFolderId != nil
    cancelButton.isEnabled = true
  }

  private func showLoadFailure(_ message: String) {
    loadingIndicator.stopAnimating()
    loadingIndicator.isHidden = true
    setComposerVisible(false)
    statusLabel.text = message
    statusLabel.textColor = TWLStyle.danger
    buttonStack.isHidden = false
    saveButton.isHidden = true
    cancelButton.setTitle("Close", for: .normal)
  }

  @objc private func saveButtonTapped() {
    guard let draft = currentDraft else {
      return
    }
    guard let folderId = selectedFolderId else {
      statusLabel.text = "Open Trove once to sync folders before saving from the share sheet."
      statusLabel.textColor = TWLStyle.danger
      return
    }

    setSaving(true)

    let title = titleField.text?.trimmingCharacters(in: .whitespacesAndNewlines)
    let note = noteTextView.text?.trimmingCharacters(in: .whitespacesAndNewlines)
    let payload = SharedImportPayload(
      autoSave: true,
      folderId: folderId,
      id: draft.importId,
      mediaItems: draft.mediaItems,
      sharedText: note?.isEmpty == false ? note : draft.sharedText,
      sourceUrl: draft.sourceUrl,
      title: title?.isEmpty == false ? title : draft.title
    )

    do {
      let data = try JSONEncoder().encode(payload)
      try data.write(to: draft.importDirectory.appendingPathComponent("payload.json"), options: .atomic)
      rememberLatestImport(draft.importId)
      logNotice("TWL payload written folder=\(folderId) media=\(draft.mediaItems.count) hasText=\(payload.sharedText != nil) hasUrl=\(payload.sourceUrl != nil)")
      showSavedAndComplete()
    } catch {
      logError("TWL payload write failed: \(error.localizedDescription)")
      setSaving(false)
      statusLabel.text = "The shared item could not be saved."
      statusLabel.textColor = TWLStyle.danger
    }
  }

  @objc private func cancelButtonTapped() {
    if let draft = currentDraft {
      try? FileManager.default.removeItem(at: draft.importDirectory)
    }

    completeRequest()
  }

  private func setSaving(_ isSaving: Bool) {
    saveButton.isEnabled = !isSaving
    cancelButton.isEnabled = !isSaving
    folderButton.isEnabled = !isSaving && selectedFolderId != nil
    folderSearchField.isEnabled = !isSaving
    titleField.isEnabled = !isSaving
    noteTextView.isEditable = !isSaving
    saveButton.setTitle(isSaving ? "Saving..." : "Save", for: .normal)
  }

  private func showSavedAndComplete() {
    setSaving(false)
    setComposerVisible(false)
    loadingIndicator.stopAnimating()
    loadingIndicator.isHidden = true
    statusLabel.text = "Saved to Trove"
    statusLabel.textColor = TWLStyle.muted

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
      self.completeRequest()
    }
  }

  private func rememberLatestImport(_ importId: String) {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      logError("TWL shared defaults unavailable for latest import")
      return
    }

    defaults.set(importId, forKey: latestImportIdKey)
    defaults.synchronize()
    logNotice("TWL remembered latest import id: \(importId)")
  }

  private func loadMediaFile(
    from provider: NSItemProvider,
    typeIdentifier: String,
    mediaType: String,
    importDirectory: URL,
    completion: @escaping (SharedImportMediaItem?) -> Void
  ) {
    provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, _ in
      guard let url else {
        completion(nil)
        return
      }

      let extensionHint = mediaType == "video" ? "mov" : "jpg"
      let fileExtension = url.pathExtension.isEmpty ? extensionHint : url.pathExtension
      let fileName = "\(UUID().uuidString).\(fileExtension)"
      let destinationURL = importDirectory.appendingPathComponent(fileName)

      do {
        if FileManager.default.fileExists(atPath: destinationURL.path) {
          try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: url, to: destinationURL)
        completion(
          SharedImportMediaItem(
            id: UUID().uuidString,
            localUri: destinationURL.absoluteString,
            mediaType: mediaType
          )
        )
      } catch {
        self.logError("TWL media copy failed: \(error.localizedDescription)")
        completion(nil)
      }
    }
  }

  private func completeRequest() {
    if didCompleteRequest { return }
    didCompleteRequest = true
    logNotice("TWL completing share extension request")
    extensionContext?.completeRequest(returningItems: nil)
  }

  private func logNotice(_ message: String) {
    NSLog("%@", message)
    logger.notice("\(message, privacy: .public)")
  }

  private func logError(_ message: String) {
    NSLog("%@", message)
    logger.error("\(message, privacy: .public)")
  }

  private static func firstURL(in text: String) -> URL? {
    let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    return detector?.firstMatch(in: text, options: [], range: range)?.url
  }

  private static func validDefaultFolderId(from snapshot: SharedFolderSnapshot?) -> String? {
    guard let snapshot,
      let defaultFolderId = snapshot.defaultFolderId,
      snapshot.folders.contains(where: { $0.id == defaultFolderId })
    else {
      return nil
    }

    return defaultFolderId
  }

  private static func folderPathLabel(for folderId: String?, in folders: [SharedFolder]) -> String? {
    guard let folderId, !folderId.isEmpty else {
      return "Home"
    }

    let path = folderPath(for: folderId, in: folders)
    return path.isEmpty ? nil : path.map { $0.name }.joined(separator: " / ")
  }

  private static func folder(for folderId: String?, in folders: [SharedFolder]) -> SharedFolder? {
    guard let folderId, !folderId.isEmpty else {
      return nil
    }

    return folders.first { $0.id == folderId }
  }

  private static func parentPathLabel(for folderId: String, in folders: [SharedFolder]) -> String? {
    let path = folderPath(for: folderId, in: folders)
    guard path.count > 1 else {
      return "Home"
    }

    return path.dropLast().map { $0.name }.joined(separator: " / ")
  }

  private static func folderPath(for folderId: String, in folders: [SharedFolder]) -> [SharedFolder] {
    guard !folderId.isEmpty else {
      return []
    }

    let foldersById = Dictionary(uniqueKeysWithValues: folders.map { ($0.id, $0) })
    var path: [SharedFolder] = []
    var visited: Set<String> = []
    var currentId: String? = folderId

    while let id = currentId, let folder = foldersById[id], !visited.contains(id) {
      visited.insert(id)
      path.insert(folder, at: 0)
      if let parentFolderId = folder.parentFolderId, !parentFolderId.isEmpty {
        currentId = parentFolderId
      } else {
        currentId = nil
      }
    }

    return path
  }

  private static func folderIconText(for folder: SharedFolder?) -> String {
    guard let folder else {
      return "📁"
    }

    guard let icon = folder.icon, !icon.isEmpty else {
      return "F"
    }

    return icon
  }

  private static func folderTintColor(for folder: SharedFolder?) -> UIColor {
    guard let folder else {
      return TWLStyle.warm
    }

    guard let color = color(from: folder.color) else {
      return TWLStyle.accent
    }

    return color
  }

  private static func color(from hex: String?) -> UIColor? {
    guard var cleaned = hex?.trimmingCharacters(in: .whitespacesAndNewlines), !cleaned.isEmpty else {
      return nil
    }

    if cleaned.hasPrefix("#") {
      cleaned.removeFirst()
    }

    guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else {
      return nil
    }

    return UIColor(
      red: CGFloat((value >> 16) & 0xff) / 255,
      green: CGFloat((value >> 8) & 0xff) / 255,
      blue: CGFloat(value & 0xff) / 255,
      alpha: 1
    )
  }

  private static func title(for sourceUrl: String?, sharedText: String?) -> String? {
    if let sourceUrl, let host = URL(string: sourceUrl)?.host {
      return "\(host.replacingOccurrences(of: "www.", with: "")) post"
    }

    guard let text = sharedText?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
      return nil
    }

    return String(text.prefix(72))
  }

  private static func mediaSummary(imageCount: Int, videoCount: Int) -> String {
    var parts: [String] = []

    if imageCount == 1 {
      parts.append("1 image")
    } else if imageCount > 1 {
      parts.append("\(imageCount) images")
    }

    if videoCount == 1 {
      parts.append("1 video")
    } else if videoCount > 1 {
      parts.append("\(videoCount) videos")
    }

    return "Media: \(parts.joined(separator: ", "))"
  }
}
