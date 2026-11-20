import SwiftUI
import UIKit
import ClerkKit

final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    let host = UIHostingController(rootView: ShareView(context: extensionContext))
    addChild(host)
    view.addSubview(host.view)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      host.view.topAnchor.constraint(equalTo: view.topAnchor),
      host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    host.didMove(toParent: self)
  }
}

private struct ShareView: View {
  let context: NSExtensionContext?
  @State private var cache: ShareMatesCache?
  @State private var payload: SharePayload?
  @State private var selectedMateId = ""
  @State private var note = ""
  @State private var status = "Preparing share…"
  @State private var sending = false
  @State private var needsApp = false
  @State private var hasPending = false

  private var selectedMate: ShareMate? { cache?.mates.first { $0.id == selectedMateId } }

  var body: some View {
    NavigationStack {
      Form {
        Section("Sharing") {
          if let payload {
            switch payload {
            case .link(let url): Text(url.absoluteString).lineLimit(3)
            case .file(_, let name, _): Label(name, systemImage: "doc")
            }
          } else {
            Text(status).foregroundStyle(.secondary)
          }
        }
        Section("To") {
          if let cache, !cache.mates.isEmpty {
            Picker("Mate", selection: $selectedMateId) {
              ForEach(cache.mates) { mate in Text(mate.name).tag(mate.id) }
            }
          } else {
            Text("Open Mates to refresh your mates list.").foregroundStyle(.secondary)
          }
        }
        Section("Note (optional)") {
          TextField("What should your mate do with this?", text: $note, axis: .vertical)
            .lineLimit(2...4)
        }
        if needsApp || hasPending {
          Section {
            Text(status).foregroundStyle(.secondary)
            Text("Open Mates to finish this share.").font(.footnote)
          }
        } else if payload != nil {
          Section {
            Button(sending ? "Sending…" : "Send") { Task { await send() } }
              .disabled(sending || selectedMate == nil)
            if status != "Ready to send" {
              Text(status).foregroundStyle(.secondary)
            }
          }
        }
      }
      .navigationTitle("Share to Mates")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") {
            payload?.removeStagingFile()
            context?.cancelRequest(withError: CancellationError())
          }
        }
      }
    }
    .task { await prepare() }
  }

  @MainActor
  private func prepare() async {
    cache = ShareMatesCache.load()
    let last = UserDefaults(suiteName: ShareSend.group)?.string(forKey: "share.last-mate.v1")
    selectedMateId = cache?.mates.first { $0.id == last }?.id ?? cache?.mates.first?.id ?? ""
    hasPending = PendingShare.load() != nil
    if hasPending {
      status = "An earlier share is waiting in Mates."
      needsApp = true
      return
    }
    do {
      payload = try await SharePayload.load(from: context)
      status = "Ready to send"
    } catch {
      status = error.localizedDescription
    }
  }

  @MainActor
  private func send() async {
    guard let payload, let cache, let mate = selectedMate, !sending else { return }
    sending = true
    defer { sending = false }
    var saved = false
    do {
      let share = try PendingShare.create(payload: payload, mate: mate, userId: cache.userId, note: String(note.prefix(8_000)).trimmingCharacters(in: .whitespacesAndNewlines))
      try share.save()
      saved = true
      payload.removeStagingFile()
      guard let token = try await sharedToken() else { throw ShareSend.SendError.noSession }
      try await ShareSend.send(share, token: token)
      status = "Sent to \(mate.name)"
      context?.completeRequest(returningItems: [])
    } catch {
      status = error.localizedDescription
      needsApp = saved
    }
  }

  @MainActor
  private func sharedToken() async throws -> String? {
    guard let publishableKey = UserDefaults(suiteName: ShareSend.group)?
      .string(forKey: "share.clerk-publishable-key.v1"), !publishableKey.isEmpty,
      let accessGroup = Bundle.main.object(forInfoDictionaryKey: "ClerkKeychainAccessGroup") as? String,
      !accessGroup.isEmpty, !accessGroup.hasPrefix("$(") else { return nil }
    Clerk.configure(
      publishableKey: publishableKey,
      options: .init(keychainConfig: .init(service: "app.askorin.mates.share-auth", accessGroup: accessGroup))
    )
    for _ in 0..<50 where !Clerk.shared.isLoaded {
      try? await Task.sleep(for: .milliseconds(100))
    }
    guard Clerk.shared.isLoaded else { return nil }
    return try await Clerk.shared.auth.getToken()
  }
}
