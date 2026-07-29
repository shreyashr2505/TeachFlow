export interface PwaRegistrationResult {
  registration: ServiceWorkerRegistration;
  waitingWorker: ServiceWorker | null;
}

export const registerTeachFlowServiceWorker = async (): Promise<PwaRegistrationResult | null> => {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  return {
    registration,
    waitingWorker: registration.waiting ?? null,
  };
};

export const sendFirebaseConfigToWorker = async (registration: ServiceWorkerRegistration, config: Record<string, string>) => {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) {
    return;
  }

  worker.postMessage({
    type: 'INIT_FIREBASE',
    config,
  });
};

export const triggerServiceWorkerUpdate = (worker: ServiceWorker | null) => {
  worker?.postMessage({ type: 'SKIP_WAITING' });
};
