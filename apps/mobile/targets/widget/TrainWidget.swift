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
        TrainEntry(date: Date(), state: .loaded(.sample))
    }

    func getSnapshot(in context: Context, completion: @escaping (TrainEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TrainEntry>) -> Void) {
        Task {
            let entry = await load()
            // iOS decides the real refresh time; this is a request, not a guarantee.
            let next = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date().addingTimeInterval(300)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func load() async -> TrainEntry {
        let now = Date()
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
            content(payload)
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(family == .accessoryInline ? Font.caption : Font.footnote)
            .multilineTextAlignment(.leading)
    }

    @ViewBuilder
    private func content(_ p: WidgetPayload) -> some View {
        switch family {
        case .accessoryInline:
            if let t = p.hero {
                Text("\(t.departureText) to \(p.to.crs) · \(t.statusText)")
            } else {
                Text("No trains to \(p.to.crs)")
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("\(p.from.crs) to \(p.to.crs)").font(.caption2).foregroundStyle(.secondary)
                if let t = p.hero {
                    Text(t.departureText).font(.headline)
                    Text(t.statusText + (t.platform.map { " · Plat \($0)" } ?? "")).font(.caption)
                } else {
                    Text("No trains soon").font(.caption)
                }
            }
        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                header(p)
                if p.next.isEmpty {
                    Text("No trains in the next few hours.").font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(p.next.prefix(3)) { t in row(t) }
                Spacer(minLength: 0)
            }
        default: // systemSmall
            VStack(alignment: .leading, spacing: 2) {
                header(p)
                Spacer(minLength: 0)
                if let t = p.hero {
                    Text(t.departureText)
                        .font(.system(size: 38, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Text(t.statusText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(statusColor(t.status))
                    Text("Arrives \(t.arrivalText)" + (t.platform.map { " · Plat \($0)" } ?? ""))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Text("No trains soon").font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func header(_ p: WidgetPayload) -> some View {
        Text("\(p.from.name) → \(p.to.name)")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .lineLimit(1)
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
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}
