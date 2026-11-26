/**
 * Central UI string dictionary (English + Traditional Chinese). Components read strings from here
 * through `translator(locale)` instead of inline `isZh ? … : …` pairs, so every pair can be checked
 * in one place (tests/core/i18nCoverage.test.ts).
 */
import { app } from './app';
import { commandBar } from './commandBar';
import { decision } from './decision';
import { hero } from './hero';
import { history } from './history';
import { inspector } from './inspector';
import { intake } from './intake';
import { nanoSetup } from './nanoSetup';
import { privacyDiff } from './privacyDiff';
import { stepper } from './stepper';
import { telemetry } from './telemetry';
import { workbench } from './workbench';

export const UI = {
  app,
  commandBar,
  decision,
  hero,
  history,
  inspector,
  intake,
  nanoSetup,
  privacyDiff,
  stepper,
  telemetry,
  workbench,
};

export { pick, translator, type Msg, type MsgFn } from './types';
