import CallKit
import Foundation
import Observation
import UIKit

struct NativeCallResult: Codable {
    var status = "Not tested"
    var detail = "Ask CallKit to present a local test call. No Quo call is placed."
    var errorDomain: String?
    var errorCode: Int?
}

@MainActor
@Observable
final class CallingProbe: NSObject, @preconcurrency CXProviderDelegate {
    private(set) var audit: QuoAPIAudit?
    private(set) var auditError: String?
    private(set) var checkingAPI = false
    private(set) var native = NativeCallResult()
    private(set) var requestingCall = false
    private(set) var localCallID: UUID?
    private(set) var reportError: String?
    @ObservationIgnored private let provider: CXProvider
    @ObservationIgnored private var latestRequest: UUID?

    var environment: String {
        #if targetEnvironment(simulator)
        "iOS Simulator \(UIDevice.current.systemVersion)"
        #else
        "iPhone · iOS \(UIDevice.current.systemVersion)"
        #endif
    }

    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.supportedHandleTypes = [.generic]
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.includesCallsInRecents = false
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: .main)
    }

    isolated deinit { provider.invalidate() }

    func checkAPI() async {
        guard !checkingAPI else { return }
        checkingAPI = true
        defer { checkingAPI = false; saveReport() }
        do {
            audit = try await QuoAPIAudit.fetch()
            auditError = nil
        } catch {
            audit = nil
            auditError = error.localizedDescription
        }
    }

    func testCallKit() {
        guard !requestingCall, localCallID == nil else { return }
        requestingCall = true
        native = .init(status: "Checking CallKit", detail: "Waiting for the operating system’s result.")
        let id = UUID()
        latestRequest = id
        localCallID = id
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Local capability test")
        update.localizedCallerName = "Switchboard test · no real call"
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        saveReport()
        provider.reportNewIncomingCall(with: id, update: update) { [weak self] error in
            Task { @MainActor in
                guard let self, self.latestRequest == id else { return }
                self.requestingCall = false
                if let error = error as NSError? {
                    self.localCallID = nil
                    self.native = .init(status: "CallKit rejected the request", detail: error.localizedDescription,
                                        errorDomain: error.domain, errorCode: error.code)
                } else if self.localCallID == id {
                    self.native = .init(status: "CallKit accepted the request", detail: "System UI only. Answer ends this local test. Quo audio is not connected.")
                    Task { @MainActor [weak self] in
                        try? await Task.sleep(for: .seconds(60))
                        guard let self, self.localCallID == id else { return }
                        self.endLocalTest(reason: "The local test expired after 60 seconds.")
                    }
                }
                self.saveReport()
            }
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(15))
            guard let self, self.latestRequest == id, self.requestingCall else { return }
            self.endLocalTest(reason: "CallKit did not complete the request within 15 seconds. Native calling support is not established.")
        }
    }

    func endLocalTest(reason: String = "The local test was ended.") {
        guard let id = localCallID else { return }
        provider.reportCall(with: id, endedAt: .now, reason: .remoteEnded)
        localCallID = nil
        latestRequest = nil
        requestingCall = false
        native = .init(status: "Local test ended", detail: reason)
        saveReport()
    }

    func providerDidReset(_ provider: CXProvider) {
        guard localCallID != nil else { return }
        localCallID = nil
        requestingCall = false
        native = .init(status: "CallKit reset", detail: "The operating system reset the call provider before the test completed. Native calling support is not established in this environment.")
        saveReport()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // A native Answer callback is not evidence of a connected provider call.
        action.fail()
        endLocalTest(reason: "Native Answer reached the app. No Quo voice transport is configured, so the test did not connect audio.")
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        localCallID = nil
        latestRequest = nil
        requestingCall = false
        native = .init(status: "Local test declined", detail: "The system End/Decline action reached the app. No real call was placed.")
        action.fulfill()
        saveReport()
    }

    private func saveReport() {
        struct Report: Encodable {
            let checkedAt: Date
            let environment: String
            let specification: URL
            let api: QuoAPIAudit?
            let apiError: String?
            let callKit: NativeCallResult
            let liveQuoAudioVerified = false
            let pushKitDeliveryVerified = false
        }
        do {
            let report = Report(checkedAt: .now, environment: environment, specification: QuoAPIAudit.specification,
                                api: audit, apiError: auditError, callKit: native)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let directory = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            try encoder.encode(report).write(to: directory.appending(path: "capability-report.json"), options: .atomic)
            reportError = nil
        } catch {
            reportError = "The local report could not be saved: \(error.localizedDescription)"
        }
    }
}
