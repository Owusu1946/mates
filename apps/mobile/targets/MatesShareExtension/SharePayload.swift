import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

enum SharePayload {
  case link(URL)
  case file(url: URL, name: String, contentType: String)

  static let maxFileBytes = 4 * 1024 * 1024

  enum LoadError: LocalizedError {
    case noItem
    case unsupported
    case tooLarge
    case unavailable

    var errorDescription: String? {
      switch self {
      case .noItem: "Choose one item to share."
      case .unsupported: "Mates can receive links, photos, and PDFs."
      case .tooLarge: "Files must be 4 MB or smaller."
      case .unavailable: "That item is no longer available. Try sharing it again."
      }
    }
  }

  static func load(from context: NSExtensionContext?) async throws -> SharePayload {
    guard let providers = context?.inputItems
      .compactMap({ $0 as? NSExtensionItem })
      .flatMap({ $0.attachments ?? [] }), providers.count == 1, let provider = providers.first else {
      throw LoadError.noItem
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      let item = try await loadItem(provider, type: UTType.url.identifier)
      if let url = item as? URL, ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
        return .link(url)
      }
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      let item = try await loadItem(provider, type: UTType.plainText.identifier)
      let text = (item as? String) ?? (item as? URL)?.absoluteString ?? ""
      if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
        ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
        return .link(url)
      }
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
      return try await copyFile(provider, type: UTType.pdf.identifier, contentType: "application/pdf", extension: "pdf")
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      return try await prepareImage(provider)
    }

    throw LoadError.unsupported
  }

  private static func loadItem(_ provider: NSItemProvider, type: String) async throws -> NSSecureCoding? {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: type) { item, error in
        if let error { continuation.resume(throwing: error) }
        else { continuation.resume(returning: item) }
      }
    }
  }

  private static func copyFile(_ provider: NSItemProvider, type: String, contentType: String, extension fileExtension: String) async throws -> SharePayload {
    let name = provider.suggestedName.map { URL(fileURLWithPath: $0).deletingPathExtension().lastPathComponent } ?? "document"
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<SharePayload, Error>) in
      provider.loadFileRepresentation(forTypeIdentifier: type) { source, error in
        do {
          if let error { throw error }
          guard let source else { throw LoadError.unavailable }
          let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
          guard size <= maxFileBytes else { throw LoadError.tooLarge }
          let target = try destination(extension: fileExtension)
          try FileManager.default.copyItem(at: source, to: target)
          let copiedSize = try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
          guard copiedSize <= maxFileBytes else {
            try? FileManager.default.removeItem(at: target)
            throw LoadError.tooLarge
          }
          continuation.resume(returning: .file(url: target, name: "\(name).\(fileExtension)", contentType: contentType))
        } catch { continuation.resume(throwing: error) }
      }
    }
  }

  private static func prepareImage(_ provider: NSItemProvider) async throws -> SharePayload {
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<SharePayload, Error>) in
      provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { source, error in
        do {
          if let error { throw error }
          guard let source,
            let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil),
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: 1600,
            ] as CFDictionary),
            let data = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.7) else {
            throw LoadError.unavailable
          }
          guard data.count <= maxFileBytes else { throw LoadError.tooLarge }
          let target = try destination(extension: "jpg")
          try data.write(to: target, options: .atomic)
          continuation.resume(returning: .file(url: target, name: "photo.jpg", contentType: "image/jpeg"))
        } catch { continuation.resume(throwing: error) }
      }
    }
  }

  private static func destination(extension fileExtension: String) throws -> URL {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ShareStaging", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder.appendingPathComponent(UUID().uuidString).appendingPathExtension(fileExtension)
  }
}
