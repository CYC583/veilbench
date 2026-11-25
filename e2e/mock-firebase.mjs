const services = { isConfigured: true, ai: {}, appCheckStatus: 'verified', db: null, remoteConfig: null };
export const getFirebaseServices = () => services;
export const verifyAppCheckToken = async () => services.appCheckStatus;
export const ensureAnonymousUser = async () => null;
export const startHybridPerfTrace = () => null;
export const logHybridAnalyticsEvent = () => {};
