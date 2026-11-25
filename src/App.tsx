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

/** D-6 guided demo: each step starts only after the previous stage has really finished (stage idle). */
const GUIDED_STEPS: Array<{ en: string; zh: string }> = [
  { en: 'Loading the Contract + Quote sample…', zh: '載入合約＋報價單範例…' },
  {
    en: 'Stage 1 · On-device airlock tokenized names, amounts, dates and IDs — in the text and burned into the image pixels.',
    zh: 'Stage 1 · 裝置端氣閘已把姓名、金額、日期、證號換成代號，文字與圖片像素都已處理。',
  },
  {
    en: 'Stage 3 · Layer 3 + SHA-256: this is byte-for-byte what may leave the device.',
    zh: 'Stage 3 · Layer 3 + SHA-256：這就是唯一可能離開裝置的內容。',
  },
  {
    en: 'Stage 2 · Rapid triage — Gemini Nano when available, otherwise the sanitized cloud fallback.',
    zh: 'Stage 2 · 快速風險篩檢：有 Gemini Nano 就在裝置端，否則以脫敏內容走雲端備援。',
  },
  {
    en: 'Stage 4 · Cloud Gemini reasons over tokens and relations; your browser restores names and computes the $ difference.',
    zh: 'Stage 4 · 雲端只看代號與關係推理，瀏覽器在本機還原姓名並計算金額差。',
  },
  { en: 'Guided demo complete.', zh: '導覽完成。' },
];

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
            void actions.executeRapidTriage();
            break;
          case 3:
            setDemoStep(4);
            void actions.executeDeepAudit();
            break;
          case 4:
            setDemoStep(5);
            break;
          default:
            setDemoStep(null);
        }
      },
      demoStep === 0 ? 0 : 2800
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
                ? '第一次使用？30 秒導覽會依序跑完 Stage 1 → 4。'
                : 'New here? The 30-second guided demo runs Stage 1 → 4 for you.'}
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

        {(state.stage === 'scanning_pii' || state.stage === 'translating') && (
          <div className="flex items-center gap-2.5 rounded-md border border-[#0F766E]/30 bg-[#F0FDFA] px-4 py-2.5 font-mono text-[12px] text-[#0F766E]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#0F766E]" />
            <span>{localizeRuntimeMessage(state.stageMessage, state.locale)}</span>
          </div>
        )}

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

        {state.documents.length > 0 && (
          <PipelineStepper
            locale={state.locale}
            stage1Source={
              state.telemetry.find((e) => e.task === 'pii_scan')?.actualSource ?? null
            }
            nanoAvailable={state.nanoStatus === 'available'}
            triageSource={state.triage?.inferenceSource ?? null}
            triageRunning={state.stage === 'running_triage'}
            gatePassed={state.preFlight ? state.preFlight.passed : null}
            deepSource={state.deepAudit?.inferenceSource ?? null}
            deepRunning={state.stage === 'running_deep_audit'}
            deepFailed={state.cloudFailure?.action === 'deep_audit'}
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
