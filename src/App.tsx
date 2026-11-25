import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, PlayCircle, Square, X } from 'lucide-react';
import { useWorkbenchStore } from './state/useWorkbenchStore';
import { localizeRuntimeMessage } from './i18n/runtimeMessages';
import { TopCommandBar } from './components/TopCommandBar';
import { NanoSetupBanner } from './components/NanoSetupBanner';
import { DocumentIntake } from './components/DocumentIntake';
import { PrivacyDiffPane } from './components/PrivacyDiffPane';
import { PipelineStepper } from './components/PipelineStepper';
import { PayloadInspectorModal } from './components/PayloadInspectorModal';
import { AuditWorkbench } from './components/AuditWorkbench';
import { XRayTelemetryBar } from './components/XRayTelemetryBar';
import { SessionHistoryDrawer } from './components/SessionHistoryDrawer';
import { DecisionCard } from './components/DecisionCard';
import { HeroIntro } from './components/HeroIntro';

/** Guided demo: each step starts only after the previous stage has really finished (stage idle). */
const GUIDED_STEPS: Array<{ en: string; zh: string }> = [
  { en: 'Loading the Contract + Quote sample…', zh: '載入合約＋報價單範例…' },
  {
    en: 'Stage 1 · On-device: names, amounts, dates and IDs became tokens, in the text and in the image pixels.',
    zh: 'Stage 1 · 裝置端：姓名、金額、日期、證號都已換成代號，文字與圖片像素都處理了。',
  },
  {
    en: 'Stage 3 · Layer 3 + SHA-256: this is byte-for-byte what may leave the device.',
    zh: 'Stage 3 · Layer 3 + SHA-256：這就是唯一可能離開裝置的內容。',
  },
  {
    en: 'Stages 2 + 4 in parallel · on-device first verdict and cloud deep audit start together; the cloud sees tokens and relations only.',
    zh: 'Stage 2 + 4 並行：裝置端初判與雲端深度稽核同時開跑，雲端只看代號與關係。',
  },
  {
    en: 'Done · your device computed the exact gap and wrote the decision.',
    zh: '完成：你的裝置算出確切差額，並給出簽約決定。',
  },
];

function scrollToTestId(id: string) {
  document.querySelector(`[data-testid="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function App() {
  const { state, combinedSanitizedPayload, actions } = useWorkbenchStore();
  const isZh = state.locale === 'zh-TW';
  const [demoStep, setDemoStep] = useState<number | null>(null);

  useEffect(() => {
    if (demoStep === null || state.stage !== 'idle') return;
    const timer = window.setTimeout(
      () => {
        switch (demoStep) {
          case 0:
            setDemoStep(1);
            void actions.loadSamplePack('sample_contract_bundle');
            break;
          case 1:
            setDemoStep(2);
            actions.setIsInspectorOpen(true);
            break;
          case 2:
            actions.setIsInspectorOpen(false);
            setDemoStep(3);
            void actions.executeParallelHybrid();
            window.setTimeout(() => scrollToTestId('decision-card'), 300);
            break;
          case 3:
            setDemoStep(4);
            scrollToTestId('decision-card');
            break;
          default:
            setDemoStep(null);
        }
      },
      demoStep === 0 ? 0 : demoStep === 4 ? 6000 : 2200
    );
    return () => window.clearTimeout(timer);
  }, [actions, demoStep, state.stage]);

  const isBusy = state.stage !== 'idle';
  const isTranslating = state.stage === 'translating';

  const activeDoc = useMemo(
    () => state.documents.find((d) => d.id === state.activeDocId) ?? state.documents[0] ?? null,
    [state.documents, state.activeDocId]
  );

  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] pb-20 text-[#141518]">
      <TopCommandBar
        isOnline={state.isOnline}
        nanoStatus={state.nanoStatus}
        userPreference={state.userPreference}
        locale={state.locale}
        isTranslating={isTranslating}
        hasDocuments={state.documents.length > 0}
        savedCount={state.savedSessions.length}
        onChangePreference={actions.setUserPreference}
        onToggleLocale={() => void actions.toggleLocaleWithAiTranslation()}
        onToggleHistory={() => actions.setIsHistoryOpen(!state.isHistoryOpen)}
        onClearWorkspace={actions.clearWorkspace}
      />

      <NanoSetupBanner
        nanoStatus={state.nanoStatus}
        isFirebaseConfigured={state.isFirebaseConfigured}
        locale={state.locale}
      />

      {state.errorBanner && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-md border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-[13px] text-[#BE123C]">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{localizeRuntimeMessage(state.errorBanner, state.locale)}</span>
            </div>
            <button
              type="button"
              onClick={actions.dismissError}
              className="text-[#BE123C]/70 hover:text-[#BE123C]"
              aria-label={isZh ? '關閉錯誤訊息' : 'Dismiss error'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
        {state.documents.length === 0 && demoStep === null ? (
          <HeroIntro
            locale={state.locale}
            disabled={isBusy}
            onRunDemo={() => setDemoStep(0)}
            onTryOwn={() => document.getElementById('intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        ) : (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-2.5 ${
            demoStep !== null ? 'border-[#0F766E] bg-[#F0FDFA]' : 'border-[#E2E5EA] bg-[#FFFFFF]'
          }`}
          aria-live="polite"
        >
          <p className="text-[13px] leading-relaxed text-[#141518]">
            {demoStep !== null
              ? isZh
                ? GUIDED_STEPS[demoStep].zh
                : GUIDED_STEPS[demoStep].en
              : isZh
                ? '想再看一次？30 秒導覽會從載入範例一路跑到簽約決定。'
                : 'Want the walkthrough? The 30-second guided demo runs from sample to decision.'}
          </p>
          {demoStep === null ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setDemoStep(0)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-1.5 text-[13px] font-medium text-[#FFFFFF] active:translate-y-px disabled:opacity-50 sm:min-h-[36px]"
            >
              <PlayCircle className="h-4 w-4" />
              <span>{isZh ? '開始導覽' : 'Guided demo'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDemoStep(null);
                actions.setIsInspectorOpen(false);
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3.5 py-1.5 text-[13px] font-medium text-[#141518] sm:min-h-[36px]"
            >
              <Square className="h-3.5 w-3.5" />
              <span>{isZh ? '結束導覽' : 'Stop'}</span>
            </button>
          )}
        </div>
        )}

        {(state.stage === 'scanning_pii' || state.stage === 'translating' || state.stage === 'running_parallel') && (
          <div className="flex items-center gap-2.5 rounded-md border border-[#0F766E]/30 bg-[#F0FDFA] px-4 py-2.5 font-mono text-[12px] text-[#0F766E]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#0F766E]" />
            <span>{localizeRuntimeMessage(state.stageMessage, state.locale)}</span>
          </div>
        )}

        <div id="intake" className="scroll-mt-4">
        <DocumentIntake
          documents={state.documents}
          activeDocId={state.activeDocId}
          isBusy={isBusy}
          locale={state.locale}
          onSelectDoc={actions.setActiveDocId}
          onLoadSample={(packId) => void actions.loadSamplePack(packId)}
          onAddDocument={(params) => void actions.addCustomDocument(params)}
          onRemoveDocument={(docId) => void actions.removeDocument(docId)}
        />
        </div>

        {state.documents.length > 0 && (
          <PipelineStepper
            locale={state.locale}
            stage1Source={
              state.telemetry.find((e) => e.task === 'pii_scan')?.actualSource ?? null
            }
            nanoAvailable={state.nanoStatus === 'available'}
            triageSource={state.triage?.inferenceSource ?? null}
            triageRunning={state.triageRunning}
            gatePassed={state.preFlight ? state.preFlight.passed : null}
            deepSource={state.deepAudit?.inferenceSource ?? null}
            deepRunning={state.deepRunning}
            deepFailed={state.cloudFailure?.action === 'deep_audit'}
          />
        )}

        {state.documents.length > 0 && (
          <DecisionCard
            card={state.decisionCard}
            triage={state.triage}
            deepAudit={state.deepAudit}
            parallelRun={state.parallelRun}
            triageRunning={state.triageRunning}
            deepRunning={state.deepRunning}
            isBusy={isBusy}
            locale={state.locale}
            rehydrateLocal={actions.rehydrateLocal}
            onRunDecision={() => void actions.executeParallelHybrid()}
            onVerify={() => actions.setIsInspectorOpen(true)}
          />
        )}

        {activeDoc && (
          <PrivacyDiffPane
            document={activeDoc}
            totalDocuments={state.documents.length}
            entities={state.entitiesByDoc[activeDoc.id] ?? []}
            vault={state.vault}
            preFlight={state.preFlight}
            zeroLeakProof={state.zeroLeakProof}
            isBusy={isBusy}
            isOnline={state.isOnline}
            nanoAvailable={state.nanoStatus === 'available'}
            locale={state.locale}
            onToggleEntity={(docId, entityId) =>
              void actions.toggleEntityRedaction(docId, entityId)
            }
            onSetImageReviewed={(docId, reviewed) => void actions.setImageReviewed(docId, reviewed)}
            onAddManualRegion={(docId, bbox) => void actions.addManualRegion(docId, bbox)}
            onUndoManualRegion={(docId) => void actions.undoManualRegion(docId)}
            onOpenInspector={() => actions.setIsInspectorOpen(true)}
            onRunRapidTriage={() => void actions.executeRapidTriage()}
            onRunDeepAudit={() => actions.setIsInspectorOpen(true)}
          />
        )}

        <AuditWorkbench
          triage={state.triage}
          deepAudit={state.deepAudit}
          chatHistory={state.chatHistory}
          stage={state.stage}
          stageMessage={localizeRuntimeMessage(state.stageMessage, state.locale)}
          locale={state.locale}
          translatedCache={state.translatedCache}
          rehydrateLocal={actions.rehydrateLocal}
          onSendChat={(q) => void actions.sendChatMessage(q)}
          cloudFailure={state.cloudFailure}
          outboundPayloadHash={state.zeroLeakProof?.sanitizedPayloadHash}
          outboundImageHashes={state.zeroLeakProof?.outboundImageHashes}
          hasDocuments={state.documents.length > 0}
          onRetryCloud={actions.retryCloudAction}
          onDismissCloudFailure={actions.dismissCloudFailure}
          triageRunning={state.triageRunning}
          deepRunning={state.deepRunning}
        />
      </main>

      <p className="mx-auto max-w-[1440px] px-4 pb-16 font-mono text-[10.5px] text-[#5C626E] sm:px-6">
        build {__BUILD_ID__}
      </p>

      <PayloadInspectorModal
        isOpen={state.isInspectorOpen}
        documents={state.documents}
        combinedSanitizedPayload={combinedSanitizedPayload}
        vault={state.vault}
        preFlight={state.preFlight}
        zeroLeakProof={state.zeroLeakProof}
        isBusy={isBusy}
        locale={state.locale}
        onClose={() => actions.setIsInspectorOpen(false)}
        onApproveAndEscalate={() => void actions.executeDeepAudit()}
        onTryLeak={() => void actions.tryLeak()}
      />

      <SessionHistoryDrawer
        isOpen={state.isHistoryOpen}
        onClose={() => actions.setIsHistoryOpen(false)}
        onSelectSession={actions.restoreSessionFromHistory}
        sessions={state.savedSessions}
        locale={state.locale}
      />

      <XRayTelemetryBar
        telemetry={state.telemetry}
        vault={state.vault}
        remoteConfig={state.remoteConfig}
        appCheckStatus={state.appCheckStatus}
        lastFirestorePayload={state.lastFirestorePayload}
        firestoreSync={state.firestoreSync}
        onRefetchRemoteConfig={actions.refetchRemoteConfig}
        locale={state.locale}
      />
    </div>
  );
}

export default App;
