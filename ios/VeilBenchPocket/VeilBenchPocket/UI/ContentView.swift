import SwiftUI

struct ContentView: View {
  @State private var model = PipelineModel()
  @State private var previewExpanded = false
  @State private var showServices = false
  @FocusState private var editorFocused: Bool

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          header
          inputCard
          runButton
          if let stage1 = model.stage1 { stage1Card(stage1).id("stage1") }
          if let layer3 = model.layer3 { layer3Card(layer3).id("layer3") }
          if model.layer3 != nil { cloudCard.id("cloud") }
          if !model.log.isEmpty { logCard.id("log") }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(Theme.background.ignoresSafeArea())
      .toolbar {
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button("Done") { editorFocused = false }
        }
      }
      .sheet(isPresented: $showServices) {
        NavigationStack {
          List {
            if model.cloudConfigured {
              LabeledContent("Firebase AI Logic", value: "Device and cloud audit")
              LabeledContent("App Check", value: "Cloud attestation")
              LabeledContent("Remote Config", value: "Model selection")
              LabeledContent("Anonymous Auth", value: "Private session owner")
              LabeledContent("Cloud Firestore", value: "Sessions and relays")
            } else {
              Text("Local configuration only. Cloud services are unavailable.")
            }
          }
          .navigationTitle("About / Services")
          .toolbar { Button("Done") { showServices = false } }
        }
      }
      .task { await runDemoLaunchArguments(proxy) }
    }
  }

  // MARK: Header

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button("About / Services") { showServices = true }
        .font(.footnote)
      Text("VEILBENCH POCKET")
        .font(.caption.monospaced().weight(.semibold)).tracking(1.2).foregroundStyle(Theme.accent)
      Text("Contract airlock").font(.largeTitle.weight(.bold)).foregroundStyle(Theme.ink)
      Text("Names, amounts and IDs are found and replaced on this iPhone. Only tokens can reach the cloud.")
        .font(.subheadline).foregroundStyle(Theme.muted)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        statusPill(symbol: "iphone", text: model.onDeviceAvailability == nil ? "On-device model ready" : "On-device model off",
                   tint: model.onDeviceAvailability == nil ? Theme.accent : Theme.muted)
        statusPill(symbol: "cloud", text: model.cloudConfigured ? "Cloud ready" : "Cloud not configured",
                   tint: model.cloudConfigured ? Theme.amber : Theme.muted)
      }
      .padding(.top, 4)
    }
    .padding(.top, 8)
  }

  private func statusPill(symbol: String, text: String, tint: Color) -> some View {
    Label(text, systemImage: symbol)
      .font(.caption2.weight(.medium))
      .foregroundStyle(tint)
      .lineLimit(1)
      .padding(.horizontal, 8).padding(.vertical, 4)
      .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
  }

  // MARK: Input

  private var inputCard: some View {
    Card {
      HStack {
        StageHeader(step: "INPUT", title: "Document")
        Spacer()
        Text("\(model.input.count) chars").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
      }
      ZStack(alignment: .topLeading) {
        TextEditor(text: $model.input)
          .font(.footnote)
          .foregroundStyle(Theme.ink)
          .scrollContentBackground(.hidden)
          .focused($editorFocused)
          .frame(minHeight: 180, maxHeight: 240)
          .accessibilityIdentifier("documentEditor")
        if model.input.isEmpty {
          Text("Paste a contract, or load the sample.")
            .font(.footnote).foregroundStyle(Theme.muted)
            .padding(.top, 8).padding(.leading, 5)
            .allowsHitTesting(false)
        }
      }
      .padding(6)
      .background(Theme.background, in: RoundedRectangle(cornerRadius: 8))
      .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.hairline, lineWidth: 1))
      HStack(spacing: 8) {
        Button { model.loadSample() } label: { Label("Load sample contract", systemImage: "doc.text") }
          .buttonStyle(SecondaryButtonStyle())
          .accessibilityIdentifier("loadSample")
        Button { model.clear() } label: { Label("Clear", systemImage: "xmark") }
          .buttonStyle(SecondaryButtonStyle())
          .disabled(model.input.isEmpty)
        Spacer(minLength: 0)
      }
      Text("Sample is fictional: reserved .example domains, 555 numbers, a non-issuable SSN.")
        .font(.caption2).foregroundStyle(Theme.muted)
    }
  }

  private var runButton: some View {
    Button {
      editorFocused = false
      Task { await model.runAirlock() }
    } label: {
      HStack(spacing: 8) {
        if model.isRunningStage1 {
          ProgressView().tint(.white)
          Text("Running on this iPhone…")
        } else {
          Image(systemName: "lock.shield")
          Text("Run on-device airlock")
        }
      }
    }
    .buttonStyle(PrimaryButtonStyle())
    .disabled(model.isRunningStage1 || model.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    .accessibilityIdentifier("runAirlock")
  }

  // MARK: Stage 1

  private func stage1Card(_ s: Stage1Result) -> some View {
    Card {
      StageHeader(step: "STAGE 1", title: "On-device airlock")
      switch s.mode {
      case .onDeviceModel:
        VStack(alignment: .leading, spacing: 6) {
          SiteBadge(site: .onDeviceModel)
          SiteBadge(site: .onDeviceRules)
        }
      case .rulesOnly(let reason):
        SiteBadge(site: .onDeviceRules)
        notice(symbol: "exclamationmark.triangle", tint: Theme.ink,
               title: "Local rules only",
               body: "\(reason) Stage 1 ran with deterministic rules on this iPhone. Raw text is never sent to the cloud as a fallback.")
      }
      let stats = s.airlock.stats
      HStack(alignment: .firstTextBaseline, spacing: 16) {
        metric("\(stats.totalDetected)", "values vaulted")
        metric("\(stats.byOnDevice)", "by on-device model")
        metric("\(stats.byRegex)", "by rules")
      }
      Divider().overlay(Theme.hairline)
      VStack(alignment: .leading, spacing: 10) {
        Text("LOCAL VAULT · never leaves this iPhone")
          .font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Theme.muted)
        ForEach(s.airlock.vault.entries) { entry in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(entry.originalValue)
              .font(.footnote).foregroundStyle(Theme.rose)
              .lineLimit(2)
              .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.right").font(.caption2).foregroundStyle(Theme.muted)
            VStack(alignment: .trailing, spacing: 1) {
              Text(entry.token).font(.caption.monospaced().weight(.semibold)).foregroundStyle(Theme.accent)
              Text(entry.layer == .onDevice ? "on-device model" : "rule")
                .font(.caption2).foregroundStyle(Theme.muted)
            }
            .fixedSize()
          }
        }
      }
      Divider().overlay(Theme.hairline)
      VStack(alignment: .leading, spacing: 8) {
        Text("TOKENIZED TEXT")
          .font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Theme.muted)
        Text(TokenStyling.attributed(s.airlock.sanitizedText))
          .font(.footnote)
          .lineLimit(previewExpanded ? nil : 8)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
        Button(previewExpanded ? "Show less" : "Show full text") { previewExpanded.toggle() }
          .font(.caption.weight(.semibold)).tint(Theme.accent)
      }
    }
  }

  private func metric(_ value: String, _ label: String) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(value).font(.title3.weight(.semibold).monospacedDigit()).foregroundStyle(Theme.ink)
      Text(label).font(.caption2).foregroundStyle(Theme.muted)
    }
  }

  // MARK: Layer 3

  private func layer3Card(_ l: Layer3State) -> some View {
    Card {
      StageHeader(step: "LAYER 3", title: "Zero-leak check")
      SiteBadge(site: .onDeviceRules)
      if l.result.passed {
        HStack(alignment: .top, spacing: 10) {
          Image(systemName: "checkmark.shield.fill").font(.title2).foregroundStyle(Theme.accent)
          VStack(alignment: .leading, spacing: 2) {
            Text("Passed. No raw value in the outbound payload.").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
            Text("Inspected \(l.result.inspectedChars) characters against \(l.result.checkedValues) vault values and every raw email, IBAN, SSN, phone and date pattern.")
              .font(.caption).foregroundStyle(Theme.muted)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .accessibilityIdentifier("layer3Passed")
      } else {
        HStack(alignment: .top, spacing: 10) {
          Image(systemName: "xmark.shield.fill").font(.title2).foregroundStyle(Theme.rose)
          VStack(alignment: .leading, spacing: 4) {
            Text("Blocked. The cloud call will not be made.").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.rose)
            ForEach(Array(l.result.leaks.enumerated()), id: \.offset) { _, leak in
              Text("\(leak.reason) (\(leak.maskedSnippet))").font(.caption).foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
      }
      if !l.hintsText.isEmpty {
        Divider().overlay(Theme.hairline)
        VStack(alignment: .leading, spacing: 6) {
          Text("RELATIONS SENT INSTEAD OF VALUES · \(l.hintCount)")
            .font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Theme.muted)
          Text(TokenStyling.attributed(hintLines(l.hintsText)))
            .font(.caption)
            .lineLimit(6)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  private func hintLines(_ text: String) -> String {
    text.split(separator: "\n").filter { $0.hasPrefix("- ") }.map { String($0.dropFirst(2)) }.joined(separator: "\n")
  }

  // MARK: Stage 4

  private var cloudCard: some View {
    Card {
      StageHeader(step: "STAGE 4", title: "Cloud audit over tokens")
      HStack(spacing: 8) {
        Rectangle().fill(Theme.amber).frame(height: 1)
          .overlay(Rectangle().stroke(Theme.amber, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        Text("CLOUD BOUNDARY · TOKENS ONLY").font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Theme.amber)
          .fixedSize()
        Rectangle().fill(Theme.amber).frame(height: 1)
      }
      switch model.cloud {
      case .idle:
        sendButton(title: "Send tokens to Gemini")
      case .notConfigured:
        notice(symbol: "cloud.slash", tint: Theme.amber, title: "Cloud not configured",
               body: "Add this app's GoogleService-Info.plist to enable the Gemini audit. Stages 1 to 3 ran entirely on this iPhone and nothing was sent.")
          .accessibilityIdentifier("cloudNotConfigured")
      case .running:
        HStack(spacing: 10) {
          ProgressView().tint(Theme.amber)
          Text("Gemini is auditing the tokenized contract…").font(.footnote).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
      case .failed(let failure):
        notice(symbol: "exclamationmark.icloud", tint: Theme.amber, title: "Cloud audit unavailable", body: failure.userMessage)
        sendButton(title: "Retry")
      case .done(let report, _):
        auditResults(report)
        Divider()
        Text(model.syncStatus).font(.footnote)
        Text("Anyone with the link can read the tokenized flags and letter for up to 15 minutes.")
          .font(.caption).foregroundStyle(Theme.muted)
        if let relay = model.relay {
          TimelineView(.explicit([Date(), relay.expiresAt].sorted())) { timeline in
            if timeline.date < relay.expiresAt {
              ShareLink(item: relay.url) { Label("Share audit link", systemImage: "square.and.arrow.up") }
              Text("Expires at \(relay.expiresAt, style: .time)").font(.caption)
            } else {
              createLinkButton
            }
          }
        } else {
          createLinkButton
        }
        if !model.relayStatus.isEmpty { Text(model.relayStatus).font(.footnote) }
      }
    }
  }

  private var createLinkButton: some View {
    Button("Create share link") { Task { await model.publishRelay() } }
      .disabled(!model.canPublish)
  }

  private func sendButton(title: String) -> some View {
    Button { Task { await model.runCloudAudit() } } label: {
      Label(title, systemImage: "arrow.up.forward.circle")
    }
    .buttonStyle(PrimaryButtonStyle(tint: Theme.ink))
    .disabled(!model.canSendToCloud)
    .accessibilityIdentifier("sendToCloud")
  }

  @ViewBuilder
  private func auditResults(_ report: AuditReport) -> some View {
    HStack(spacing: 6) {
      SiteBadge(site: .cloud(model: report.model))
      Text(report.model).font(.caption2.monospaced()).foregroundStyle(Theme.muted).lineLimit(1)
    }
    Picker("View", selection: $model.showRestored) {
      Text("Tokens (as sent)").tag(false)
      Text("Restored on device").tag(true)
    }
    .pickerStyle(.segmented)
    .accessibilityIdentifier("rehydrateToggle")
    VStack(alignment: .leading, spacing: 12) {
      ForEach(report.flags) { flag in
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 8) {
            Text(flag.severity.rawValue.uppercased())
              .font(.caption2.monospaced().weight(.bold))
              .foregroundStyle(flag.severity == .low ? Theme.muted : Theme.ink)
              .padding(.horizontal, 6).padding(.vertical, 2)
              .overlay(RoundedRectangle(cornerRadius: 4)
                .strokeBorder(flag.severity == .high ? Theme.ink : Theme.hairline, lineWidth: 1))
            Text(model.display(flag.title)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
          }
          Text(TokenStyling.attributed(model.display(flag.summary), highlightOriginals: model.restoredOriginals))
            .font(.footnote)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
    Divider().overlay(Theme.hairline)
    VStack(alignment: .leading, spacing: 6) {
      Text("NEGOTIATION EMAIL").font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Theme.muted)
      Text(TokenStyling.attributed(model.display(report.email), highlightOriginals: model.restoredOriginals))
        .font(.footnote)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
    }
    Text(model.showRestored
         ? "Real values restored from the local vault. Exact differences were computed on this iPhone."
         : "This is exactly what Gemini saw and returned: tokens only.")
      .font(.caption2).foregroundStyle(Theme.muted)
  }

  // MARK: Log

  private var logCard: some View {
    Card {
      StageHeader(step: "LOG", title: "Where each step ran")
      VStack(alignment: .leading, spacing: 12) {
        ForEach(model.log) { entry in
          HStack(alignment: .top, spacing: 10) {
            Image(systemName: entry.site.symbol)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(entry.site.tint)
              .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
              HStack(alignment: .firstTextBaseline) {
                Text(entry.title).font(.footnote.weight(.semibold)).foregroundStyle(outcomeColor(entry.outcome))
                Spacer(minLength: 8)
                if let ms = entry.latencyMs {
                  Text("\(ms.formatted()) ms").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                }
              }
              Text(entry.site.label).font(.caption2.weight(.semibold)).foregroundStyle(entry.site.tint)
              Text(entry.detail).font(.caption2).foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
      }
    }
  }

  private func outcomeColor(_ o: StepLogEntry.Outcome) -> Color {
    switch o {
    case .blocked, .failed: return Theme.rose
    default: return Theme.ink
    }
  }

  private func notice(symbol: String, tint: Color, title: String, body: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: symbol).font(.body.weight(.semibold)).foregroundStyle(tint)
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
        Text(body).font(.caption).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(tint.opacity(0.3), lineWidth: 1))
  }

  // MARK: Demo / evidence automation (launch arguments only; no effect in normal use)

  private func runDemoLaunchArguments(_ proxy: ScrollViewProxy) async {
    let d = UserDefaults.standard
    if d.bool(forKey: "demoSample") { model.loadSample() }
    if d.bool(forKey: "demoRun") { await model.runAirlock() }
    if d.bool(forKey: "demoCloud") { await model.runCloudAudit() }
    if d.bool(forKey: "demoRestored") { model.showRestored = true }
    if d.bool(forKey: "demoExpand") { previewExpanded = true }
    if let anchor = d.string(forKey: "demoScroll") {
      try? await Task.sleep(for: .milliseconds(300))
      withAnimation { proxy.scrollTo(anchor, anchor: .top) }
    }
  }
}

#Preview { ContentView() }
