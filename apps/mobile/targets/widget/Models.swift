import Foundation

/// Must match ios.entitlements in app.json and src/lib/widgetSync.ts.
let appGroup = "group.com.platform.trains"

struct SavedStation: Codable {
    let crs: String
    let name: String
}

/// Written by the app (src/lib/widgetSync.ts) into the shared App Group.
struct WidgetConfig: Codable {
    let home: SavedStation?
    let work: SavedStation?
    let apiBase: String

    static func load() -> WidgetConfig? {
        guard
            let raw = UserDefaults(suiteName: appGroup)?.string(forKey: "widgetConfig"),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetConfig.self, from: data)
    }
}

// Mirrors `WidgetData` in packages/shared/src/index.ts.
struct StationLite: Codable {
    let crs: String
    let name: String
}

struct TrainRow: Codable, Identifiable {
    let rid: String
    let departs: String
    let expected: String?
    let status: String   // on_time | delayed | cancelled | departed
    let delayMinutes: Int
    let platform: String?
    let arrives: String?
    let arrivesExpected: String?

    var id: String { rid }
    var isRunning: Bool { status != "cancelled" && status != "departed" }

    /// Time to show: the forecast when delayed, otherwise the timetable.
    var departureText: String { clockText(status == "delayed" ? expected : departs) }
    var arrivalText: String { clockText(arrivesExpected ?? arrives) }

    var statusText: String {
        switch status {
        case "on_time": return "On time"
        case "delayed": return "\(delayMinutes) min late"
        case "cancelled": return "Cancelled"
        default: return "Departed"
        }
    }
}

struct WidgetPayload: Codable {
    let updatedAt: String
    let from: StationLite
    let to: StationLite
    let next: [TrainRow]

    /// First train that is actually going to run.
    var hero: TrainRow? { next.first(where: { $0.isRunning }) }

    static let sample = WidgetPayload(
        updatedAt: "2026-11-19T18:00:00Z",
        from: StationLite(crs: "SLO", name: "Slough"),
        to: StationLite(crs: "PAD", name: "London Paddington"),
        next: [
            TrainRow(rid: "1", departs: "2026-11-19T18:30:00+00:00", expected: nil, status: "on_time",
                     delayMinutes: 0, platform: "4", arrives: "2026-11-19T18:57:00+00:00", arrivesExpected: nil),
            TrainRow(rid: "2", departs: "2026-11-19T18:40:00+00:00", expected: "2026-11-19T18:42:00+00:00", status: "delayed",
                     delayMinutes: 2, platform: "4", arrives: "2026-11-19T19:07:00+00:00", arrivesExpected: "2026-11-19T19:09:00+00:00"),
            TrainRow(rid: "3", departs: "2026-11-19T18:50:00+00:00", expected: nil, status: "on_time",
                     delayMinutes: 0, platform: nil, arrives: "2026-11-19T19:17:00+00:00", arrivesExpected: nil),
        ]
    )
}

/// Server times are ISO strings already in UK local time, so the clock is characters 11-15.
func clockText(_ iso: String?) -> String {
    guard let iso = iso, iso.count >= 16 else { return "--:--" }
    let start = iso.index(iso.startIndex, offsetBy: 11)
    let end = iso.index(iso.startIndex, offsetBy: 16)
    return String(iso[start..<end])
}

/// Before midday the widget shows the way to work, after midday the way home.
func isHeadingToWork(at date: Date) -> Bool {
    Calendar.current.component(.hour, from: date) < 12
}
