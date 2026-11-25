import SwiftUI

@main
struct VeilBenchPocketApp: App {
  init() {
    FirebaseBootstrap.configure()
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
        .preferredColorScheme(.light)
    }
  }
}
