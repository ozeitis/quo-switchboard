import Foundation

struct CallOperation: Codable, Identifiable, Sendable {
    let path: String
    let method: String
    let summary: String
    var id: String { "\(method) \(path)" }
}

struct QuoAPIAudit: Codable, Sendable {
    static let specification = URL(string: "https://openphone-public-api-prod.s3.us-west-2.amazonaws.com/public/openphone-public-api-2026-03-30-prod.json")!

    let checkedAt: Date
    let operations: [CallOperation]

    var callWrites: [CallOperation] { operations.filter { $0.method != "GET" } }
    var summary: String {
        callWrites.isEmpty ? "Call records only" : "Call controls need review"
    }

    static func fetch() async throws -> Self {
        var request = URLRequest(url: specification)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
            throw AuditError.unavailable
        }
        guard data.count < 4_000_000,
              let document = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let paths = document["paths"] as? [String: [String: Any]] else {
            throw AuditError.invalidSpecification
        }
        let methods: Set<String> = ["get", "post", "put", "patch", "delete"]
        var operations: [CallOperation] = []
        for (path, entries) in paths where path == "/calls" || path.hasPrefix("/calls/") {
            for (method, value) in entries where methods.contains(method) {
                guard let operation = value as? [String: Any] else { continue }
                operations.append(.init(path: path, method: method.uppercased(), summary: operation["summary"] as? String ?? ""))
            }
        }
        guard !operations.isEmpty else { throw AuditError.invalidSpecification }
        return .init(checkedAt: .now, operations: operations.sorted { $0.id < $1.id })
    }

    enum AuditError: LocalizedError {
        case unavailable, invalidSpecification

        var errorDescription: String? {
            switch self {
            case .unavailable: "Quo’s public specification could not be retrieved. No API verdict is available."
            case .invalidSpecification: "The specification changed or could not be read. Its calling capabilities need review."
            }
        }
    }
}
