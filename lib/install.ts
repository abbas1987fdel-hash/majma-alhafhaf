type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
export function createInstallController(target: EventTarget, standalone: () => boolean) {
  let deferred: InstallEvent | null = null;
  let installed = standalone();
  let busy = false;
  const listeners = new Set<() => void>();
  let state = { available: false, installed, busy };
  const update = () => { state = { available: !!deferred, installed: installed || standalone(), busy }; listeners.forEach(listener => listener()); };
  target.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferred = event as InstallEvent; installed = false; update();
  });
  target.addEventListener('appinstalled', () => { installed = true; deferred = null; update(); });
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async install(): Promise<'unavailable' | 'installed' | 'accepted' | 'dismissed' | 'busy'> {
      if (installed || standalone()) return 'installed';
      if (busy) return 'busy';
      if (!deferred) return 'unavailable';
      const event = deferred;
      deferred = null; busy = true; update();
      try {
        // Call immediately in the click handler, preserving browser user activation.
        await event.prompt();
        return (await event.userChoice).outcome;
      } finally { busy = false; update(); }
    },
  };
}
export const installation = typeof window !== 'undefined' ? createInstallController(window, () => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)) : null;
