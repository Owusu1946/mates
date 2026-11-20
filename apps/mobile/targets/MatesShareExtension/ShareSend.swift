import Foundation

struct ShareMate: Decodable, Identifiable {
  let id: String
  let name: String
  let chatId: String
}

struct ShareMatesCache: Decodable {
  let version: Int
  let userId: String
  let mates: [ShareMate]

  static func load() -> Self? {
    guard let value = UserDefaults(suiteName: ShareSend.group)?.string(forKey: "share.mates.v1"),
      let data = value.data(using: .utf8),
      let cache = try? JSONDecoder().decode(Self.self, from: data), cache.version == 1 else { return nil }
    return cache
  }
}

struct PendingShare: Codable {
  let id: String
  let userId: String
  let mateId: String
  let chatId: String
  let note: String
  let link: String?
  let filePath: String?
  let fileName: String?
  let contentType: String?
  var uploadedId: String?

  var message: String {
    [note, link ?? ""].filter { !$0.isEmpty }.joined(separator: "\n\n")
  }

  static func load() -> Self? {
    guard let value = UserDefaults(suiteName: ShareSend.group)?.string(forKey: ShareSend.pendingKey),
      let data = value.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Self.self, from: data)
  }

  static func create(payload: SharePayload, mate: ShareMate, userId: String, note: String) throws -> Self {
    if Self.load() != nil {
      throw ShareSend.SendError.rejected("An earlier share is waiting. Open Mates to finish it first.")
    }
    let id = UUID().uuidString.lowercased()
    switch payload {
    case .link(let url):
      return Self(id: id, userId: userId, mateId: mate.id, chatId: mate.chatId, note: note, link: url.absoluteString, filePath: nil, fileName: nil, contentType: nil, uploadedId: nil)
    case .file(let url, let name, let contentType):
      guard let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareSend.group) else {
        throw ShareSend.SendError.unavailable
      }
      let folder = group.appendingPathComponent("PendingShares", isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let target = folder.appendingPathComponent(id).appendingPathExtension(url.pathExtension)
      try FileManager.default.copyItem(at: url, to: target)
      return Self(id: id, userId: userId, mateId: mate.id, chatId: mate.chatId, note: note, link: nil, filePath: target.path, fileName: name, contentType: contentType, uploadedId: nil)
    }
  }

  func save() throws {
    guard let defaults = UserDefaults(suiteName: ShareSend.group) else { throw ShareSend.SendError.unavailable }
    if let existing = Self.load(), existing.id != id {
      throw ShareSend.SendError.rejected("An earlier share is waiting. Open Mates to finish it first.")
    }
    let data = try JSONEncoder().encode(self)
    guard let value = String(data: data, encoding: .utf8) else { throw ShareSend.SendError.unavailable }
    defaults.set(value, forKey: ShareSend.pendingKey)
  }

  func clear() {
    if Self.load()?.id == id {
      UserDefaults(suiteName: ShareSend.group)?.removeObject(forKey: ShareSend.pendingKey)
    }
    if let filePath { try? FileManager.default.removeItem(atPath: filePath) }
  }
}

enum ShareSend {
  static let group = "group.app.askorin.mates"
  static let pendingKey = "share.pending.v1"

  enum SendError: LocalizedError {
    case unavailable
    case noSession
    case rejected(String)

    var errorDescription: String? {
      switch self {
      case .unavailable: "Sharing is unavailable in this build. Open Mates and try again."
      case .noSession: "Your session needs refreshing. Open Mates and sign in."
      case .rejected(let message): message
      }
    }
  }

  static func send(_ initial: PendingShare, token: String) async throws {
    guard let base = UserDefaults(suiteName: group)?.string(forKey: "share.api-base-url.v1"),
      let api = URL(string: base), ["http", "https"].contains(api.scheme?.lowercased() ?? "") else {
      throw SendError.unavailable
    }
    var share = initial
    if share.filePath != nil && share.uploadedId == nil {
      share.uploadedId = try await upload(share, token: token, base: api)
      try share.save()
    }
    try await saveUserMessage(share, token: token, base: api)
    try await submit(share, token: token, base: api)
    UserDefaults(suiteName: group)?.set(share.mateId, forKey: "share.last-mate.v1")
    share.clear()
  }

  private static func upload(_ share: PendingShare, token: String, base: URL) async throws -> String {
    guard let path = share.filePath, let name = share.fileName, let contentType = share.contentType else { throw SendError.unavailable }
    let file = try Data(contentsOf: URL(fileURLWithPath: path))
    guard file.count <= SharePayload.maxFileBytes else { throw SharePayload.LoadError.tooLarge }
    let boundary = "Mates-\(UUID().uuidString)"
    let safeName = name.filter { $0 != "\"" && $0 != "\r" && $0 != "\n" }
    var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(contentType)\r\n\r\n".utf8)
    body.append(file)
    body.append(Data("\r\n--\(boundary)--\r\n".utf8))
    var request = URLRequest(url: base.appending(path: "v1/attachments"))
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.httpBody = body
    let (data, response) = try await URLSession.shared.data(for: request)
    try accepted(response, data: data)
    guard let id = (try? JSONDecoder().decode(UploadResponse.self, from: data))?.attachment.id else {
      throw SendError.rejected("The upload did not return an attachment. Try again.")
    }
    return id
  }

  private static func submit(_ share: PendingShare, token: String, base: URL) async throws {
    let id = share.id
    let messages = [RunTurn(role: "user", content: share.message, attachments: share.uploadedId.map { [AttachmentRef(id: $0)] })]
    let input = RunRequest(chatId: share.chatId, requestKey: "share_\(id)", assistantMessageId: "assistant_share_\(id)", parentId: "user_share_\(id)", messages: messages)
    var request = URLRequest(url: base.appending(path: "v1/runs"))
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(input)
    let (data, response) = try await URLSession.shared.data(for: request)
    try accepted(response, data: data)
    guard (try? JSONDecoder().decode(RunResponse.self, from: data))?.runId != nil else {
      throw SendError.rejected("Mates could not confirm the send. Open Mates to check your chat.")
    }
  }

  /// Save the share message as a child of the current chat head before submitRun creates its reply.
  /// Without this, submitRun's fallback insert makes the synthetic user message a new root, and the
  /// mobile history view follows that new branch instead of the earlier conversation.
  private static func saveUserMessage(_ share: PendingShare, token: String, base: URL) async throws {
    let id = "user_share_\(share.id)"
    var historyRequest = URLRequest(url: base.appending(path: "v1/chats/\(share.chatId)/messages"))
    historyRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let (historyData, historyResponse) = try await URLSession.shared.data(for: historyRequest)
    try accepted(historyResponse, data: historyData)
    let history = try JSONDecoder().decode(HistoryResponse.self, from: historyData)
    if history.messages.contains(where: { $0.message.id == id }) { return }

    let parents = Set(history.messages.compactMap(\.parentId))
    let head = history.messages.last(where: { !parents.contains($0.message.id) })?.message.id
    let content = share.message
    let parts = content.isEmpty ? [] : [MessagePart(type: "text", text: content)]
    let attachments = share.uploadedId.map {
      [SavedAttachment(id: $0, name: share.fileName ?? "Shared file", type: share.contentType?.hasPrefix("image/") == true ? "image" : "file")]
    }
    let body = SavedMessageRequest(
      parentId: head,
      message: SavedMessage(id: id, role: "user", createdAt: ISO8601DateFormatter().string(from: Date()), content: parts, attachments: attachments)
    )
    var request = URLRequest(url: base.appending(path: "v1/chats/\(share.chatId)/messages"))
    request.httpMethod = "PUT"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)
    let (data, response) = try await URLSession.shared.data(for: request)
    try accepted(response, data: data)
  }

  private static func accepted(_ response: URLResponse, data: Data) throws {
    guard let response = response as? HTTPURLResponse else { throw SendError.unavailable }
    guard (200..<300).contains(response.statusCode) else {
      let message = (try? JSONDecoder().decode(ApiFailure.self, from: data))?.error.message
      throw SendError.rejected(message ?? "Mates could not send this. Try again.")
    }
  }

  private struct UploadResponse: Decodable { let attachment: AttachmentRef }
  private struct RunResponse: Decodable { let runId: String }
  private struct HistoryResponse: Decodable { let messages: [HistoryItem] }
  private struct HistoryItem: Decodable { let parentId: String?; let message: HistoryMessage }
  private struct HistoryMessage: Decodable { let id: String }
  private struct ApiFailure: Decodable { let error: ApiError }
  private struct ApiError: Decodable { let message: String }
  private struct SavedMessageRequest: Encodable { let parentId: String?; let message: SavedMessage }
  private struct SavedMessage: Encodable {
    let id: String
    let role: String
    let createdAt: String
    let content: [MessagePart]
    let attachments: [SavedAttachment]?
  }
  private struct MessagePart: Encodable { let type: String; let text: String }
  private struct SavedAttachment: Encodable { let id: String; let name: String; let type: String }
  private struct AttachmentRef: Codable { let id: String }
  private struct RunTurn: Encodable { let role: String; let content: String; let attachments: [AttachmentRef]? }
  private struct RunRequest: Encodable {
    let chatId: String
    let requestKey: String
    let assistantMessageId: String
    let parentId: String
    let messages: [RunTurn]
  }
}
