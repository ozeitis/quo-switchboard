import SwiftUI

@main
struct CallingProbeApp: App {
    @State private var probe = CallingProbe()

    var body: some Scene {
        WindowGroup {
            ProbeView(probe: probe)
                .task {
                    await probe.checkAPI()
                    if CommandLine.arguments.contains("--probe-callkit") {
                        probe.testCallKit()
                    }
                }
        }
    }
}
