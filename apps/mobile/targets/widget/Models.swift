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

    /// Real departure instant (forecast if there is one), for the live countdown.
    var departureDate: Date? { parseISO(expected ?? departs) }

    /// Whole minutes until departure as shown on the small widget.
    func minutesText(from now: Date) -> String {
        guard let d = departureDate else { return "--" }
        let minutes = Int((d.timeIntervalSince(now) / 60).rounded(.up))
        if minutes <= 0 { return "Due" }
        return minutes == 1 ? "1 min" : "\(minutes) min"
    }

    var platformText: String { platform.map { "Plat \($0)" } ?? "Plat TBC" }

    /// Short form for tight spaces such as the lock-screen side column.
    var shortStatusText: String {
        switch status {
        case "on_time": return "On time"
        case "delayed": return "+\(delayMinutes) min"
        case "cancelled": return "Cancelled"
        default: return "Departed"
        }
    }

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

    /// Trains that have not left yet as of `date` (so the widget moves on by itself).
    func upcoming(at date: Date) -> [TrainRow] {
        next.filter { t in
            if t.status == "departed" { return false }
            guard let d = t.departureDate else { return true }
            return d >= date.addingTimeInterval(-30)
        }
    }

    /// First train that is actually going to run as of `date`.
    func hero(at date: Date) -> TrainRow? {
        upcoming(at: date).first(where: { $0.isRunning })
    }

    /// The trains after `hero`, for the lock-screen side column.
    func following(after hero: TrainRow?, at date: Date, count: Int) -> [TrainRow] {
        upcoming(at: date).filter { $0.rid != hero?.rid }.prefix(count).map { $0 }
    }

    /// Placeholder data for the widget gallery, relative to `now` so it never looks stale.
    static func sample(now: Date) -> WidgetPayload {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = .current
        func at(_ minutes: Double) -> String { f.string(from: now.addingTimeInterval(minutes * 60)) }
        return WidgetPayload(
            updatedAt: at(0),
            from: StationLite(crs: "PAD", name: "London Paddington"),
            to: StationLite(crs: "SLO", name: "Slough"),
            next: [
                TrainRow(rid: "1", departs: at(12), expected: nil, status: "on_time", delayMinutes: 0,
                         platform: "3", arrives: at(40), arrivesExpected: nil),
                TrainRow(rid: "2", departs: at(22), expected: at(24), status: "delayed", delayMinutes: 2,
                         platform: "3", arrives: at(50), arrivesExpected: at(52)),
                TrainRow(rid: "3", departs: at(32), expected: nil, status: "on_time", delayMinutes: 0,
                         platform: nil, arrives: at(60), arrivesExpected: nil),
            ]
        )
    }
}

private let isoPlain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

func parseISO(_ value: String?) -> Date? {
    guard let value = value else { return nil }
    return isoPlain.date(from: value) ?? isoFractional.date(from: value)
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
