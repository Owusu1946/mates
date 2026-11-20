import SwiftUI
import UIKit
import ClerkKit

final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()

    let host = UIHostingController(rootView: ShareSetupView(context: extensionContext))
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

private struct ShareSetupView: View {
  let context: NSExtensionContext?
  @State private var authStatus = "Checking the shared Clerk session…"
  @State private var itemStatus = "Reading shared item…"

  var body: some View {
    VStack(spacing: 8) {
      Text("Share to Mates")
        .font(.headline)
      Text(authStatus)
        .font(.subheadline)
        .foregroundStyle(.secondary)
      Text(itemStatus)
        .font(.subheadline)
        .foregroundStyle(.secondary)
      Button("Check shared session") {
        Task { await checkSharedSession() }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding()
    .task {
      await checkSharedSession()
      do {
        let payload = try await SharePayload.load(from: context)
        switch payload {
        case .link(let url): itemStatus = "Link ready: \(url.host() ?? url.absoluteString)"
        case .file(_, let name, _): itemStatus = "File ready: \(name)"
        }
      } catch {
        itemStatus = error.localizedDescription
      }
    }
  }

  @MainActor
  private func checkSharedSession() async {
    guard let publishableKey = UserDefaults(suiteName: "group.app.askorin.mates")?
      .string(forKey: "share.clerk-publishable-key.v1"),
      !publishableKey.isEmpty else {
      authStatus = "Open Mates once to finish setting up sharing."
      return
    }

    guard let accessGroup = Bundle.main.object(forInfoDictionaryKey: "ClerkKeychainAccessGroup") as? String,
      !accessGroup.isEmpty,
      !accessGroup.hasPrefix("$(") else {
      authStatus = "The shared Keychain group is not configured in this build."
      return
    }

    Clerk.configure(
      publishableKey: publishableKey,
      options: .init(
        keychainConfig: .init(
          service: "app.askorin.mates.share-auth",
          accessGroup: accessGroup
        )
      )
    )

    for _ in 0..<50 where !Clerk.shared.isLoaded {
      try? await Task.sleep(for: .milliseconds(100))
    }

    guard Clerk.shared.isLoaded else {
      authStatus = "Clerk did not finish loading in the extension."
      return
    }

    do {
      guard let token = try await Clerk.shared.auth.getToken() else {
        authStatus = "No shared session. Open Mates to sign in."
        return
      }
      authStatus = "Shared session refreshed; API token is ready (\(token.count) characters)."
    } catch {
      authStatus = "Session refresh failed: \(error.localizedDescription)"
    }
  }
}
