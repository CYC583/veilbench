import { Check, Cloud, Cpu, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ActualInferenceSource } from '../types/hybrid';
import type { SupportedLocale } from '../types/audit';

type StepState = 'done' | 'active' | 'blocked' | 'failed' | 'todo';

export interface PipelineStepperProps {
  locale: SupportedLocale;
  /** Source of the latest Stage 1 PII scan (ON_DEVICE when Nano ran, else LOCAL_DETERMINISTIC). */
  stage1Source: ActualInferenceSource | null;
  nanoAvailable: boolean;
  triageSource: ActualInferenceSource | null;
  triageRunning: boolean;
  gatePassed: boolean | null;
  deepSource: ActualInferenceSource | null;
  deepRunning: boolean;
  deepFailed: boolean;
}

const tone: Record<StepState, string> = {
  done: 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]',
  active: 'border-[#0F766E] bg-[#FFFFFF] text-[#141518]',
  blocked: 'border-[#BE123C]/30 bg-[#FFF1F2] text-[#BE123C]',
  failed: 'border-[#B45309]/30 bg-[#FFFBEB] text-[#B45309]',
  todo: 'border-[#E2E5EA] bg-[#FFFFFF] text-[#5C626E]',
};

function SourceTag({ source }: { source: ActualInferenceSource }) {
  const local = source !== 'IN_CLOUD';
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase">
      {local ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
      {source}
    </span>
  );
}

/** The 4-stage hybrid pipeline at a glance, with the SDK-reported inference source per step. */
export function PipelineStepper(props: PipelineStepperProps) {
  const isZh = props.locale === 'zh-TW';
  const steps: Array<{ n: number; title: string; plan: string; state: StepState; source: ActualInferenceSource | null }> = [
    {
      n: 1,
      title: isZh ? '本機脫敏氣閘' : 'Local Airlock',
      plan: props.nanoAvailable
        ? isZh ? '端側 · Gemini Nano' : 'ON-DEVICE · Gemini Nano'
        : isZh ? '端側 · 確定性規則' : 'ON-DEVICE · Deterministic',
      state: props.stage1Source ? 'done' : 'active',
      source: props.stage1Source,
    },
    {
      n: 2,
      title: isZh ? '快速風險篩檢' : 'Rapid Triage',
      plan: props.nanoAvailable
        ? isZh ? '端側 · Gemini Nano' : 'ON-DEVICE · Gemini Nano'
        : isZh ? '雲端備援' : 'CLOUD FALLBACK',
      state: props.triageRunning ? 'active' : props.triageSource ? 'done' : 'todo',
      source: props.triageSource,
    },
    {
      n: 3,
      title: isZh ? '隱私閘門' : 'Privacy Gate',
      plan: 'Layer 3 + SHA-256',
      state: props.gatePassed === null ? 'todo' : props.gatePassed ? 'done' : 'blocked',
      source: null,
    },
    {
      n: 4,
      title: isZh ? '雲端深度稽核' : 'Cloud Deep Audit',
      plan: isZh ? '雲端 · Gemini' : 'IN_CLOUD · Gemini',
      state: props.deepRunning ? 'active' : props.deepFailed ? 'failed' : props.deepSource ? 'done' : 'todo',
      source: props.deepSource,
    },
  ];

  return (
    <nav aria-label={isZh ? 'Hybrid 處理流程' : 'Hybrid pipeline progress'}>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {steps.map((step) => (
          <li
            key={step.n}
            aria-current={step.state === 'active' ? 'step' : undefined}
            className={`flex min-h-[56px] items-start gap-2.5 rounded-md border px-3 py-2 ${tone[step.state]}`}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current font-mono text-[10px]">
              {step.state === 'done' ? (
                <Check className="h-3 w-3" />
              ) : step.state === 'blocked' ? (
                <ShieldAlert className="h-3 w-3" />
              ) : step.n === 3 ? (
                <ShieldCheck className="h-3 w-3" />
              ) : step.n === 1 ? (
                <Lock className="h-3 w-3" />
              ) : (
                step.n
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold leading-tight text-[#141518]">
                {step.n} · {step.title}
              </span>
              <span className="mt-0.5 block break-all font-mono text-[10px] uppercase tracking-wide">
                {step.source ? (
                  <SourceTag source={step.source} />
                ) : step.state === 'blocked' ? (
                  isZh ? '已阻擋' : 'BLOCKED'
                ) : step.state === 'failed' ? (
                  isZh ? '可重試' : 'RETRY AVAILABLE'
                ) : (
                  step.plan
                )}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
