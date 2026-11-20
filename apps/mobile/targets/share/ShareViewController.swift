import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()

    let host = UIHostingController(rootView: ShareSetupView())
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
  var body: some View {
    VStack(spacing: 8) {
      Text("Share to Mates")
        .font(.headline)
      Text("Share setup is ready.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding()
  }
}
