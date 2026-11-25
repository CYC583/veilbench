import Foundation
import FirebaseCore
import FirebaseAppCheck

/// Configures Firebase once at launch.
/// - With a real `GoogleService-Info.plist` in the bundle: App Check (debug provider in DEBUG, App Attest
///   in release) is installed *before* `FirebaseApp.configure`, and the cloud stage is enabled.
/// - Without it: placeholder options are used so Firebase AI Logic's on-device path (`.systemModel()`)
///   still works, and the cloud stage reports "Cloud not configured" instead of calling out.
enum FirebaseBootstrap {
  nonisolated(unsafe) private(set) static var cloudConfigured = false

  static func configure() {
    guard FirebaseApp.app() == nil else { return }
    if let options = realOptions() {
      #if DEBUG
      // The debug provider prints a local debug token to the Xcode console on first launch.
      // Register it in Firebase console > App Check > Manage debug tokens. Never commit it.
      AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
      #else
      AppCheck.setAppCheckProviderFactory(PocketAppAttestProviderFactory())
      #endif
      FirebaseApp.configure(options: options)
      cloudConfigured = true
    } else {
      // Placeholder values point to no project. They exist only so FirebaseApp can initialize.
      let options = FirebaseOptions(googleAppID: "1:000000000000:ios:0000000000000000000000",
                                    gcmSenderID: "000000000000")
      options.apiKey = "AIzaSyPLACEHOLDER-PLACEHOLDER-PLACEHOLD"
      options.projectID = "veilbench-pocket-unconfigured"
      options.bundleID = Bundle.main.bundleIdentifier ?? "com.cyc583.veilbench.pocket"
      FirebaseApp.configure(options: options)
      cloudConfigured = false
    }
  }

  /// Returns options only for a real plist (not the committed example with placeholder values).
  private static func realOptions() -> FirebaseOptions? {
    guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
          let options = FirebaseOptions(contentsOfFile: path),
          let apiKey = options.apiKey, !apiKey.isEmpty,
          !apiKey.uppercased().contains("PLACEHOLDER"),
          !options.googleAppID.hasPrefix("1:000000000000") else { return nil }
    return options
  }
}

#if !DEBUG
/// Release builds attest with App Attest (real devices only; the simulator cannot attest).
final class PocketAppAttestProviderFactory: NSObject, AppCheckProviderFactory {
  func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
    AppAttestProvider(app: app)
  }
}
#endif
