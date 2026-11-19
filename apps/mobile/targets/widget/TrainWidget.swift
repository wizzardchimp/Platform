import SwiftUI
import WidgetKit

// MARK: - Timeline

struct TrainEntry: TimelineEntry {
    enum State {
        case needsSetup
        case failed(from: String, to: String)
        case loaded(WidgetPayload)
    }

    let date: Date
    let state: State
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> TrainEntry {
        let now = Date()
        return TrainEntry(date: now, state: .loaded(.sample(now: now)))
    }

    func getSnapshot(in context: Context, completion: @escaping (TrainEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await load(at: Date())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TrainEntry>) -> Void) {
        Task {
            let now = Date()
            let first = await load(at: now)
            var entries = [first]
            // One fetch, then one entry per minute: the "minutes to go" counts down and the
            // next train takes over after a departure without another network call.
            if case .loaded(let payload) = first.state {
                for minute in 1..<20 {
                    entries.append(TrainEntry(date: now.addingTimeInterval(Double(minute) * 60), state: .loaded(payload)))
                }
            }
            // A request, not a guarantee: iOS decides the real refresh time.
            let refresh = now.addingTimeInterval(15 * 60)
            completion(Timeline(entries: entries, policy: .after(refresh)))
        }
    }

    private func load(at now: Date) async -> TrainEntry {
        guard let config = WidgetConfig.load(), let home = config.home, let work = config.work else {
            return TrainEntry(date: now, state: .needsSetup)
        }
        let toWork = isHeadingToWork(at: now)
        let from = toWork ? home : work
        let to = toWork ? work : home

        guard let url = URL(string: "\(config.apiBase)/v1/widget/\(from.crs)/\(to.crs)") else {
            return TrainEntry(date: now, state: .failed(from: from.name, to: to.name))
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(WidgetPayload.self, from: data)
            return TrainEntry(date: now, state: .loaded(payload))
        } catch {
            return TrainEntry(date: now, state: .failed(from: from.name, to: to.name))
        }
    }
}

// MARK: - Views

private func statusColor(_ status: String) -> Color {
    switch status {
    case "on_time": return .green
    case "delayed": return .orange
    case "cancelled": return .red
    default: return .gray
    }
}

struct TrainWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TrainEntry

    var body: some View {
        switch entry.state {
        case .needsSetup:
            message("Open Platform and choose your home and work stations.")
        case .failed(let from, let to):
            message("Can't load trains for \(from) to \(to).")
        case .loaded(let payload):
            content(payload, now: entry.date)
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .multilineTextAlignment(.leading)
    }

    @ViewBuilder
    private func content(_ p: WidgetPayload, now: Date) -> some View {
        let hero = p.hero(at: now)
        switch family {
        case .accessoryRectangular:
            lockScreen(p, hero: hero, now: now)
        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                Text("\(p.from.name) → \(p.to.name)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                let rows = p.upcoming(at: now)
                if rows.isEmpty {
                    Text("No trains in the next few hours.").font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(rows.prefix(3)) { t in row(t) }
                Spacer(minLength: 0)
            }
        default: // systemSmall
            smallWidget(p, hero: hero, now: now)
        }
    }

    // Small widget, top to bottom: departure time, route, minutes to go,
    // status and arrival, then the platform.
    @ViewBuilder
    private func smallWidget(_ p: WidgetPayload, hero: TrainRow?, now: Date) -> some View {
        if let t = hero {
            VStack(alignment: .leading, spacing: 2) {
                Text(t.departureText)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text("\(p.from.crs) → \(p.to.crs)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(t.minutesText(from: now))
                    .font(.title3.weight(.bold))
                    .lineLimit(1)
                Text(t.statusText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor(t.status))
                    .lineLimit(1)
                Text("Arrives \(p.to.crs) \(t.arrivalText)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text("Departing (\(t.platformText))")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(p.from.crs) → \(p.to.crs)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("No trains soon").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    // Lock screen: the small-widget content on the left, a divider, then the next two trains.
    @ViewBuilder
    private func lockScreen(_ p: WidgetPayload, hero: TrainRow?, now: Date) -> some View {
        HStack(alignment: .top, spacing: 5) {
            if let t = hero {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(t.departureText).font(.subheadline.weight(.bold)).monospacedDigit()
                        Text("\(p.from.crs)→\(p.to.crs)").font(.system(size: 9.5)).foregroundStyle(.secondary)
                    }
                    Text("\(t.minutesText(from: now)) · \(t.statusText)").font(.caption.weight(.semibold))
                    Text("Arrives \(p.to.crs) \(t.arrivalText)").font(.caption2)
                    Text("Departing (\(t.platformText))").font(.caption2).foregroundStyle(.secondary)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            } else {
                Text("No trains soon").font(.caption)
            }
            Spacer(minLength: 0)
            Rectangle().fill(.secondary).frame(width: 1)
            VStack(alignment: .trailing, spacing: 3) {
                ForEach(p.following(after: hero, at: now, count: 2)) { t in
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(t.departureText)
                            .font(.caption.weight(.bold))
                            .monospacedDigit()
                            .strikethrough(t.status == "cancelled")
                        Text(t.shortStatusText)
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func row(_ t: TrainRow) -> some View {
        HStack(spacing: 8) {
            Circle().fill(statusColor(t.status)).frame(width: 8, height: 8)
            Text(t.departureText)
                .font(.headline)
                .strikethrough(t.status == "cancelled")
                .monospacedDigit()
            Text(t.statusText).font(.caption).foregroundStyle(statusColor(t.status))
            Spacer(minLength: 4)
            if let plat = t.platform {
                Text("Plat \(plat)").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Widget

struct TrainWidget: Widget {
    let kind = "TrainWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            TrainWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "platform://"))
        }
        .configurationDisplayName("Next trains")
        .description("Your next trains between home and work.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
