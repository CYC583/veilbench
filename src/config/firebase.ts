import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getRemoteConfig, type RemoteConfig } from 'firebase/remote-config';
// Performance Monitoring and Analytics are non-blocking telemetry: loaded lazily (T-12) so they stay out
// of the first-load bundle. Traces/events requested before they finish loading are simply skipped.
import type { FirebasePerformance, PerformanceTrace } from 'firebase/performance';
import type { Analytics } from 'firebase/analytics';

let perfApi: typeof import('firebase/performance') | null = null;
let analyticsApi: typeof import('firebase/analytics') | null = null;

export type AppCheckUiStatus = 'pending' | 'verified' | 'debug' | 'failed' | 'unconfigured';

export interface FirebaseRuntimeServices {
  isConfigured: boolean;
  app: FirebaseApp | null;
  ai: AI | null;
  appCheck: AppCheck | null;
  /** 'verified' only after a real App Check token exchange succeeds (see verifyAppCheckToken). */
  appCheckStatus: AppCheckUiStatus;
  auth: Auth | null;
  db: Firestore | null;
  remoteConfig: RemoteConfig | null;
  performance: FirebasePerformance | null;
  analyticsReady: boolean;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

function hasValidConfig(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      !String(firebaseConfig.apiKey).startsWith('your_')
  );
}

let cachedServices: FirebaseRuntimeServices | null = null;
let cachedAnalytics: Analytics | null = null;

export function getFirebaseServices(): FirebaseRuntimeServices {
  if (cachedServices) {
    return cachedServices;
  }

  if (!hasValidConfig()) {
    cachedServices = {
      isConfigured: false,
      app: null,
      ai: null,
      appCheck: null,
      appCheckStatus: 'unconfigured',
      auth: null,
      db: null,
      remoteConfig: null,
      performance: null,
      analyticsReady: false,
    };
    return cachedServices;
  }

  const app = initializeApp(firebaseConfig);

  // 1. Firebase App Check (Mandatory for #BuildHybridAI — supports v3 or Enterprise)
  let appCheck: AppCheck | null = null;
  let appCheckStatus: AppCheckUiStatus = 'unconfigured';
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY as string | undefined;
  const appCheckProviderKind = (import.meta.env.VITE_APP_CHECK_PROVIDER as string | undefined)?.toLowerCase();
  const debugTokenFlag = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN as string | undefined;

  if (typeof window !== 'undefined') {
    if (debugTokenFlag && debugTokenFlag !== 'false') {
      (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
        debugTokenFlag === 'true' ? true : debugTokenFlag;
    }

    if (recaptchaSiteKey && !recaptchaSiteKey.startsWith('your_')) {
      const provider =
        appCheckProviderKind === 'enterprise'
          ? new ReCaptchaEnterpriseProvider(recaptchaSiteKey)
          : new ReCaptchaV3Provider(recaptchaSiteKey);

      appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      appCheckStatus = debugTokenFlag && debugTokenFlag !== 'false' ? 'debug' : 'pending';
    }
  }

  // 2. Firebase AI Logic (GoogleAIBackend -> Spark free tier + Hybrid Inference)
  // Limited-use tokens let Firebase AI Logic enforce App Check replay protection (Web SDK >= 12.14).
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: Boolean(appCheck) });

  // 3. Firebase Auth (Anonymous Auth for zero-friction judge demo)
  const auth = getAuth(app);

  // 4. Cloud Firestore with Offline Persistence (true offline-first paired with Gemini Nano)
  let db: Firestore | null = null;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = initializeFirestore(app, {});
  }

  // 5. Firebase Remote Config (Dynamic hybrid routing thresholds & model config)
  let remoteConfig: RemoteConfig | null = null;
  try {
    remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
    remoteConfig.defaultConfig = {
      max_on_device_chars: 7500,
      cloud_model_name: 'gemini-3.5-flash-lite',
      cloud_fallback_model_name: 'gemini-3.6-flash',
      strict_pii_block_enabled: true,
    };
  } catch {
    remoteConfig = null;
  }

  // 6. Firebase Performance Monitoring (Measures real ON_DEVICE vs IN_CLOUD latency)
  const performance: FirebasePerformance | null = null;
  if (typeof window !== 'undefined') {
    void import('firebase/performance')
      .then((mod) => {
        perfApi = mod;
        if (cachedServices) cachedServices.performance = mod.getPerformance(app);
      })
      .catch(() => {
        perfApi = null;
      });
  }

  // 7. Firebase Analytics (Strictly Zero-PII architectural routing telemetry)
  let analyticsReady = false;
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    void import('firebase/analytics')
      .then(async (mod) => {
        analyticsApi = mod;
        if (await mod.isSupported()) {
          cachedAnalytics = mod.getAnalytics(app);
          if (cachedServices) cachedServices.analyticsReady = true;
        }
      })
      .catch(() => {
        cachedAnalytics = null;
      });
    analyticsReady = true;
  }

  cachedServices = {
    isConfigured: true,
    app,
    ai,
    appCheck,
    appCheckStatus,
    auth,
    db,
    remoteConfig,
    performance,
    analyticsReady,
  };

  return cachedServices;
}

/**
 * Starts a Firebase Performance custom trace safely (no-op if offline or unconfigured).
 */
export function startHybridPerfTrace(traceName: string): PerformanceTrace | null {
  const { performance } = getFirebaseServices();
  if (!performance || !perfApi) return null;
  try {
    const t = perfApi.trace(performance, traceName);
    t.start();
    return t;
  } catch {
    return null;
  }
}

/**
 * Logs strictly Zero-PII routing telemetry events to Firebase Analytics.
 */
export function logHybridAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean>
): void {
  if (!cachedAnalytics || !analyticsApi) return;
  try {
    analyticsApi.logEvent(cachedAnalytics, eventName, params);
  } catch {
    // Non-blocking telemetry
  }
}

/**
 * Performs a real App Check token exchange so the UI never claims "Verified" on initialization alone.
 * Only the outcome is surfaced; the token itself is never logged or rendered.
 */
export async function verifyAppCheckToken(): Promise<AppCheckUiStatus> {
  const services = getFirebaseServices();
  if (!services.appCheck) return services.appCheckStatus;
  try {
    await getToken(services.appCheck, false);
    services.appCheckStatus = services.appCheckStatus === 'debug' ? 'debug' : 'verified';
  } catch {
    services.appCheckStatus = 'failed';
  }
  return services.appCheckStatus;
}

export async function ensureAnonymousUser(): Promise<User | null> {
  const { auth } = getFirebaseServices();
  if (!auth) return null;

  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user);
      } catch {
        resolve(null);
      }
    });
  });
}
