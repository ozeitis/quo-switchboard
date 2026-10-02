import SwiftUI

struct ProbeView: View {
    let probe: CallingProbe

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Native calling check", systemImage: "phone.badge.waveform")
                        .font(.title2.weight(.semibold))
                    Text("A capability test for Switchboard on iPhone. No real calls, account credentials, or phone numbers are used.")
                        .foregroundStyle(.secondary)
                    LabeledContent("Environment", value: probe.environment)
                }

                Section("Quo voice access") {
                    LabeledContent("Public API", value: probe.audit?.summary ?? (probe.checkingAPI ? "Checking…" : "Not verified"))
                    if let audit = probe.audit {
                        Text("\(audit.operations.count) documented call operations · \(audit.callWrites.count) call writes")
                        Text("Call webhooks announce events. They do not supply a native audio connection. A supported voice SDK or signaling/media integration is still required.")
                            .foregroundStyle(.secondary)
                        DisclosureGroup("Documented operations") {
                            ForEach(audit.operations) { operation in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(operation.summary)
                                    Text(operation.id).font(.caption.monospaced()).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if let error = probe.auditError { Text(error).foregroundStyle(.red) }
                    Button("Check latest API", systemImage: "arrow.clockwise") {
                        Task { await probe.checkAPI() }
                    }
                    .disabled(probe.checkingAPI)
                }

                Section {
                    LabeledContent("CallKit", value: probe.native.status)
                    Text(probe.native.detail).foregroundStyle(.secondary)
                    if let domain = probe.native.errorDomain, let code = probe.native.errorCode {
                        Text("\(domain) · code \(code)").font(.caption.monospaced()).textSelection(.enabled)
                    }
                    Button("Test system call screen", systemImage: "phone.arrow.down.left") {
                        probe.testCallKit()
                    }
                    .disabled(probe.requestingCall || probe.localCallID != nil)
                    if probe.localCallID != nil {
                        Button("End local test", role: .destructive) { probe.endLocalTest() }
                    }
                } header: {
                    Text("Apple calling interface")
                } footer: {
                    Text("CallKit and locked-device VoIP delivery require physical-device verification. A successful local UI test does not establish Quo calling support.")
                }

                Section("Release gate") {
                    Label("Real Quo audio: unverified", systemImage: "circle.dashed")
                    Label("Locked iPhone delivery: unverified", systemImage: "circle.dashed")
                    Text("Proceed only after a supported Quo connection can receive and answer a real call from either workspace, with two-way audio while the iPhone is locked.")
                        .foregroundStyle(.secondary)
                }
                if let error = probe.reportError {
                    Section("Report") { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Switchboard Probe")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
