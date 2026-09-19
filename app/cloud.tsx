'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery, useConvexConnectionState } from 'convex/react';
import { ConvexError } from 'convex/values';
import type { FunctionArgs } from 'convex/server';
import { api } from '../convex/_generated/api';
import { DEFAULT_NAME, DEFAULT_INTRO } from '@/lib/preferences';
import { OfflineError, Vault, indexedVaultStore, applyOperation, drain, type Snapshot, type Inventory, type Operation } from '@/lib/offline';
import type { Id } from '../convex/_generated/dataModel';

const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url, { logger: false }) : null;
const namespace = `${url}:${import.meta.env.BASE_URL}`;
const store = indexedVaultStore(namespace);
function bounded<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OfflineError('تأخر الاتصال. بيانات الجهاز محفوظة؛ أعد المحاولة عند استقرار الإنترنت.')), 12000);
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
export function friendlyError(error: unknown) {
  return error instanceof OfflineError ? error.message : error instanceof ConvexError && typeof error.data === 'string'
    ? error.data : 'تعذّر إكمال العملية. تحقق من اتصال الإنترنت وحاول مجددًا.';
}
function useCloudState() {
  const [serverToken, setServerToken] = useState(''), [serverInventoryToken, setServerInventoryToken] = useState('');
  const [opened, setOpened] = useState(false), [, redraw] = useState(0);
  const refreshUI = () => redraw(value => value + 1);
  const main = useRef<Vault<Snapshot> | null>(null), stock = useRef<Vault<Inventory> | null>(null);
  const release = useRef<(() => void) | null>(null), syncing = useRef(false);
  const [syncBusy, setSyncBusy] = useState(false), [syncError, setSyncError] = useState('');
  const [stockPending, setStockPending] = useState(0);
  const [inventoryUnchecked, setInventoryUnchecked] = useState(false), [syncConflict, setSyncConflict] = useState(false);
  const unsettled = useRef(0);
  const [online, setOnline] = useState(navigator.onLine);
  const connection = useConvexConnectionState();
  const network = online && connection.isWebSocketConnected;
  const remote = useQuery(api.shop.snapshot, serverToken ? { token: serverToken } : 'skip');
  const remoteInventory = useQuery(api.shop.inventory, serverToken && serverInventoryToken ? { token: serverToken, inventoryToken: serverInventoryToken } : 'skip');
  const branding = useQuery(api.shop.branding, {});
  const loginAction = useAction(api.auth.login), changeAction = useAction(api.auth.changePin);
  const unlockAction = useAction(api.auth.unlockInventory), changeInventoryAction = useAction(api.auth.changeInventoryPassword);
  const logoutMutation = useMutation(api.shop.logout), saveSettingsMutation = useMutation(api.shop.saveSettings), uploadUrl = useMutation(api.shop.uploadUrl);
  const connected = network && !!serverToken && remote !== null;
  const needsLogin = opened && network && (!serverToken || remote === null);
  const inventoryNeedsLogin = !!stock.current && connected && (!serverInventoryToken || remoteInventory === null);
  const data = opened ? main.current?.state.snapshot : undefined;
  const inventory = opened && stock.current ? stock.current.state.snapshot : undefined;
  const token = opened ? (serverToken || 'offline') : '';
  const inventoryToken = stock.current ? (serverInventoryToken || 'offline') : '';
  const pending = (main.current?.state.pending.length ?? 0) + stockPending;
  const name = data?.settings.name || branding?.name || DEFAULT_NAME;
  const logo = data?.settings.logo || branding?.logo || `${import.meta.env.BASE_URL}brand.png`;
  const intro = data?.settings.intro ?? DEFAULT_INTRO;
  const [downloadedLogo, setDownloadedLogo] = useState<{url: string; file: File} | null>(null);
  const logoFile = downloadedLogo?.url === logo ? downloadedLogo.file : null;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); release.current?.(); };
  }, []);
  useEffect(() => { document.title = `${name} | دفتر الديون`; }, [name]);
  useEffect(() => {
    if (!serverToken || !data?.sessionExpires) return;
    const timer = setTimeout(() => setServerToken(''), Math.max(0, data.sessionExpires - Date.now()));
    return () => clearTimeout(timer);
  }, [serverToken, data?.sessionExpires]);
  useEffect(() => {
    if (!serverInventoryToken || !inventory?.sessionExpires) return;
    const timer = setTimeout(() => setServerInventoryToken(''), Math.max(0, inventory.sessionExpires - Date.now()));
    return () => clearTimeout(timer);
  }, [serverInventoryToken, inventory?.sessionExpires]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(logo, { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const blob = await response.blob();
      if (!controller.signal.aborted) setDownloadedLogo({url: logo, file: new File([blob], 'شعار-المجمع.png', { type: blob.type })});
    }).catch(() => {});
    return () => controller.abort();
  }, [logo]);
  async function acquire() {
    if (release.current) return;
    if (!navigator.locks) throw new OfflineError('افتح التطبيق في إصدار حديث من Edge أو Chrome لدعم الحفظ الآمن.');
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request(`hafhaf:${namespace}`, { ifAvailable: true }, async lock => {
        if (!lock) { reject(new OfflineError('التطبيق مفتوح في نافذة أخرى. اقفل التطبيق هناك ثم افتحه هنا.')); return; }
        await new Promise<void>(done => { release.current = done; resolve(); });
      }).catch(reject);
    });
  }
  async function login(pin: string, localOnly = false) {
    await acquire();
    try {
      // Never replace an existing encrypted vault when its password cannot unlock it.
      let vault = await Vault.open<Snapshot>(store, 'accounts', pin);
      let nextToken = '';
      if (network && !localOnly) {
        nextToken = (await bounded(loginAction({ pin }))).token;
        const snapshot = await bounded(client!.query(api.shop.snapshot, { token: nextToken }));
        if (!snapshot) throw new OfflineError('انتهت الجلسة. أعد تسجيل الدخول.');
        if (!vault) vault = await Vault.create<Snapshot>(store, 'accounts', pin, snapshot, nextToken);
        else await vault.update(state => ({ ...state, token: nextToken, snapshot: state.pending.length ? { ...state.snapshot, sessionExpires: snapshot.sessionExpires } : snapshot }));
      } else {
        if (!vault) throw new OfflineError('يلزم أول دخول بالإنترنت لحفظ بيانات هذا الجهاز، ثم يمكنك فتحه بدون إنترنت.');
        nextToken = localOnly ? '' : vault.state.token;
      }
      main.current = vault;
      setInventoryUnchecked(!!await store.get('inventory'));
      setSyncError(vault.state.error || ''); setServerToken(nextToken); setOpened(true); refreshUI();
      void navigator.storage?.persist?.().catch(() => {});
    } catch (error) { release.current?.(); release.current = null; throw error; }
  }
  const loginLocal = (pin: string) => login(pin, true);
  async function lock() {
    if (syncing.current) throw new OfflineError('انتظر اكتمال المزامنة قبل قفل التطبيق.');
    const oldToken = serverToken;
    if (main.current) await main.current.update(state => ({ ...state, token: '' }));
    main.current = null; stock.current = null;
    setOpened(false); setServerToken(''); setServerInventoryToken(''); setStockPending(0); setSyncError('');
    release.current?.(); release.current = null;
    if (network && oldToken) void logoutMutation({ token: oldToken }).catch(() => {});
  }
  async function changePin(currentPin: string, newPin: string) {
    if (!connected || pending || syncBusy) throw new OfflineError('اتصل بالإنترنت وأكمل المزامنة قبل تغيير الرمز.');
    const result = await changeAction({ token: serverToken, currentPin, newPin });
    setServerToken(result.token);
    await main.current!.rekey(newPin);
    await main.current!.update(state => ({ ...state, token: result.token }));
    lockInventory();
  }
  async function unlockInventory(password: string, localOnly = false) {
    if (syncing.current) throw new OfflineError('انتظر اكتمال المزامنة.');
    let vault = await Vault.open<Inventory>(store, 'inventory', password);
    let nextToken = '';
    if (connected && !localOnly) {
      nextToken = (await bounded(unlockAction({ token: serverToken, password }))).inventoryToken;
      const snapshot = await bounded(client!.query(api.shop.inventory, { token: serverToken, inventoryToken: nextToken }));
      if (!snapshot) throw new OfflineError('أعد فتح المخزون.');
      if (!vault) vault = await Vault.create<Inventory>(store, 'inventory', password, snapshot, nextToken);
      else await vault.update(state => ({ ...state, token: nextToken, snapshot: state.pending.length ? { ...state.snapshot, sessionExpires: snapshot.sessionExpires } : snapshot }));
    } else {
      if (!vault) throw new OfflineError('افتح المخزون مرة بالإنترنت أولًا لتجهيزه للأوفلاين.');
      nextToken = localOnly ? '' : vault.state.token;
    }
    stock.current = vault; setInventoryUnchecked(false); setStockPending(vault.state.pending.length); setServerInventoryToken(nextToken);
    if (vault.state.error) setSyncError(vault.state.error);
    refreshUI();
  }
  const unlockInventoryLocal = (password: string) => unlockInventory(password, true);
  function lockInventory() {
    if (syncing.current) return false;
    if (stock.current) setStockPending(stock.current.state.pending.length);
    stock.current = null; setServerInventoryToken(''); refreshUI(); return true;
  }
  async function changeInventoryPassword(currentPassword: string, newPassword: string, confirmation: string) {
    if (!connected || pending || syncBusy) throw new OfflineError('اتصل بالإنترنت وأكمل المزامنة قبل تغيير كلمة السر.');
    const vault = await Vault.open<Inventory>(store, 'inventory', currentPassword);
    if (vault?.state.pending.length) throw new OfflineError('افتح المخزون وأكمل مزامنة تعديلاته أولًا.');
    await changeInventoryAction({ token: serverToken, currentPassword, newPassword, confirmation });
    if (vault) await vault.rekey(newPassword);
    lockInventory();
  }
  async function enqueue(method: Operation['method'], args: Record<string, unknown>) {
    if (!main.current || syncing.current || syncConflict) throw new OfflineError('انتظر المزامنة أو راجع التنبيه الظاهر قبل الحفظ.');
    const { token: _token, inventoryToken: _inventoryToken, ...payload } = args;
    const operation: Operation = { method, args: payload, operationId: crypto.randomUUID() };
    const isStock = method === 'saveProduct' || (method === 'remove' && args.kind === 'product');
    const vault = isStock ? stock.current : main.current;
    if (!vault) throw new OfflineError('افتح المخزون أولًا.');
    await vault.update(state => ({ ...state, snapshot: applyOperation(state.snapshot, operation), pending: [...state.pending, operation], savedAt: Date.now() }));
    setStockPending(stock.current?.state.pending.length ?? stockPending); refreshUI();
  }
  const saveCustomer = (args: FunctionArgs<typeof api.shop.saveCustomer>) => enqueue('saveCustomer', args);
  const saveProduct = (args: FunctionArgs<typeof api.shop.saveProduct>) => enqueue('saveProduct', args);
  const saveTransaction = (args: FunctionArgs<typeof api.shop.saveTransaction>) => enqueue('saveTransaction', args);
  const remove = (args: FunctionArgs<typeof api.shop.remove>) => enqueue('remove', args);
  // Queries update the durable snapshot only when there is no optimistic work to overwrite.
  useEffect(() => {
    const vault = main.current;
    if (connected && remote && vault && !vault.state.pending.length && !syncing.current) {
      void vault.update(state => state.pending.length ? state : { ...state, snapshot: remote, savedAt: Date.now() }).then(refreshUI).catch(error => setSyncError(friendlyError(error)));
    }
  }, [remote, syncBusy, connected]);
  useEffect(() => {
    const vault = stock.current;
    if (connected && remoteInventory && vault && !vault.state.pending.length && !syncing.current) {
      void vault.update(state => state.pending.length ? state : { ...state, snapshot: remoteInventory, savedAt: Date.now() }).then(refreshUI).catch(error => setSyncError(friendlyError(error)));
    }
  }, [remoteInventory, syncBusy, connected]);
  useEffect(() => {
    // A restored connection automatically retries transient failures; conflicts remain explicit.
    let cancelled = false;
    if (network && !syncConflict) {
      const clear = <T,>(vault: Vault<T> | null) => vault?.update(state => ({ ...state, error: undefined }));
      void Promise.all([clear(main.current), clear(stock.current)]).then(() => { if (!cancelled) setSyncError(''); }).catch(error => { if (!cancelled) setSyncError(friendlyError(error)); });
    }
    return () => { cancelled = true; };
  }, [network, syncConflict]);
  useEffect(() => {
    if (!connected || !opened || syncing.current || syncError || !pending) return;
    const accountVault = main.current, stockVault = stock.current;
    if (!accountVault) return;
    if (!accountVault.state.pending.length && (!stockVault?.state.pending.length || !serverInventoryToken || remoteInventory === null)) return;
    syncing.current = true; setSyncBusy(true);
    const sendRequest = async (operation: Operation) => {
      if (!navigator.onLine) throw new OfflineError('انقطع الإنترنت. التعديلات محفوظة على الجهاز.');
      const args = { ...operation.args, operationId: operation.operationId, token: serverToken };
      switch (operation.method) {
        case 'saveCustomer': return client!.mutation(api.shop.saveCustomer, args as FunctionArgs<typeof api.shop.saveCustomer>);
        case 'saveTransaction': return client!.mutation(api.shop.saveTransaction, args as FunctionArgs<typeof api.shop.saveTransaction>);
        case 'saveProduct': return client!.mutation(api.shop.saveProduct, { ...args, inventoryToken: serverInventoryToken } as FunctionArgs<typeof api.shop.saveProduct>);
        case 'remove': return client!.mutation(api.shop.remove, { ...args, ...(operation.args.kind === 'product' ? { inventoryToken: serverInventoryToken } : {}) } as FunctionArgs<typeof api.shop.remove>);
      }
    };
    const send = (operation: Operation) => {
      unsettled.current++;
      return bounded(sendRequest(operation).finally(() => { unsettled.current--; refreshUI(); }));
    };
    void (async () => {
      let target: Vault<Snapshot | Inventory> = accountVault;
      try {
        if (accountVault.state.pending.length) await drain(accountVault, send, async () => {
          const result = await bounded(client!.query(api.shop.snapshot, { token: serverToken }));
          if (!result) throw new OfflineError('أعد تسجيل الدخول لإكمال المزامنة.');
          return result;
        }, refreshUI);
        if (stockVault?.state.pending.length && serverInventoryToken && remoteInventory !== null) {
          target = stockVault;
          await drain(stockVault, send, async () => {
            const result = await bounded(client!.query(api.shop.inventory, { token: serverToken, inventoryToken: serverInventoryToken }));
            if (!result) throw new OfflineError('أعد فتح المخزون لإكمال المزامنة.');
            return result;
          }, () => { setStockPending(stockVault.state.pending.length); refreshUI(); });
        }
      } catch (error) {
        if (navigator.onLine) {
          const message = friendlyError(error);
          await target.update(state => ({ ...state, error: message })).catch(() => {});
          setSyncError(message);
          setSyncConflict(error instanceof ConvexError);
        }
      } finally { syncing.current = false; setSyncBusy(false); refreshUI(); }
    })();
  }, [connected, opened, pending, syncError, serverToken, serverInventoryToken, remoteInventory, syncBusy]);
  async function retrySync() {
    if (main.current) await main.current.update(state => ({ ...state, error: undefined }));
    if (stock.current) await stock.current.update(state => ({ ...state, error: undefined }));
    setSyncError(''); setSyncConflict(false); refreshUI();
  }
  async function reconnect(pin: string) {
    if (!network || !main.current || syncing.current) throw new OfflineError('انتظر اتصال الإنترنت ثم أعد المحاولة.');
    const result = await bounded(loginAction({ pin }));
    const fresh = await bounded(client!.query(api.shop.snapshot, { token: result.token }));
    if (!fresh) throw new OfflineError('أعد تسجيل الدخول.');
    await main.current.rekey(pin);
    await main.current.update(state => ({ ...state, token: result.token, snapshot: { ...state.snapshot, sessionExpires: fresh.sessionExpires }, error: undefined }));
    setServerToken(result.token); setSyncError(''); lockInventory();
  }
  async function reconnectInventory(password: string) {
    if (!connected || !stock.current || syncing.current) throw new OfflineError('انتظر اتصال الحساب بالإنترنت.');
    const result = await bounded(unlockAction({ token: serverToken, password }));
    const fresh = await bounded(client!.query(api.shop.inventory, { token: serverToken, inventoryToken: result.inventoryToken }));
    if (!fresh) throw new OfflineError('أعد فتح المخزون.');
    await stock.current.rekey(password);
    await stock.current.update(state => ({ ...state, token: result.inventoryToken, snapshot: { ...state.snapshot, sessionExpires: fresh.sessionExpires }, error: undefined }));
    setServerInventoryToken(result.inventoryToken); setSyncError('');
  }
  function exportPending() {
    const safe = (vault: Vault<Snapshot> | Vault<Inventory> | null) => vault ? { snapshot: vault.state.snapshot, pending: vault.state.pending, savedAt: vault.state.savedAt } : undefined;
    const blob = new Blob([JSON.stringify({ savedAt: new Date().toISOString(), accounts: safe(main.current), inventory: safe(stock.current) }, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = href; link.download = `hafhaf-pending-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function discardPending() {
    if (!syncConflict || unsettled.current || !connected || syncing.current || !main.current) throw new OfflineError('أعد المحاولة أولًا حتى يصل رد الخادم النهائي قبل إلغاء التعديلات.');
    if (stockPending && !stock.current) throw new OfflineError('افتح المخزون أولًا لحفظ نسخة من تعديلاته.');
    const snapshot = await bounded(client!.query(api.shop.snapshot, { token: serverToken }));
    if (!snapshot) throw new OfflineError('أعد تسجيل الدخول أولًا.');
    const inventorySnapshot = stock.current ? await bounded(client!.query(api.shop.inventory, { token: serverToken, inventoryToken: serverInventoryToken })) : null;
    if (stock.current && !inventorySnapshot) throw new OfflineError('أعد فتح المخزون أولًا.');
    exportPending();
    await main.current.update(state => ({ ...state, snapshot, pending: [], error: undefined, savedAt: Date.now() }));
    if (stock.current && inventorySnapshot) await stock.current.update(state => ({ ...state, snapshot: inventorySnapshot, pending: [], error: undefined, savedAt: Date.now() }));
    setStockPending(0); setSyncError(''); refreshUI();
  }
  async function saveSettings(nextName: string, nextIntro: string, file: File | null) {
    if (!connected || pending || syncBusy) throw new OfflineError('اتصل بالإنترنت وأكمل المزامنة قبل تعديل الإعدادات.');
    let logoId: Id<'_storage'> | undefined;
    if (file) {
      const target = await uploadUrl({ token: serverToken });
      const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw Error('Upload failed');
      const uploaded = await response.json() as { storageId?: string };
      if (typeof uploaded.storageId !== 'string') throw Error('Invalid upload response');
      logoId = uploaded.storageId as Id<'_storage'>;
    }
    await saveSettingsMutation({ token: serverToken, name: nextName, intro: nextIntro, ...(logoId ? { logoId } : {}) });
  }
  return { token, data, name, intro, logo, logoFile, login, loginLocal, lock, changePin, saveSettings,
    inventory, inventoryToken, unlockInventory, unlockInventoryLocal, lockInventory, changeInventoryPassword, inventoryUnchecked, inventoryNeedsLogin, reconnectInventory,
    connected, canWrite: opened && !syncBusy && !syncConflict, pending, syncBusy, syncError, needsLogin, retrySync, exportPending, discardPending, reconnect,
    canDiscard: syncConflict && unsettled.current === 0 && !syncBusy,
    lastSaved: Math.max(main.current?.state.savedAt ?? 0, stock.current?.state.savedAt ?? 0), saveCustomer, saveProduct, saveTransaction, remove };
}

type Cloud = ReturnType<typeof useCloudState>;
const Context = createContext<Cloud | null>(null);
function StateProvider({ children }: { children: ReactNode }) {
  const state = useCloudState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function CloudProvider({ children }: { children: ReactNode }) {
  if (!client) return <main className="welcome"><section className="settings-card"><h1>تعذّر الاتصال بقاعدة البيانات</h1><p>إعداد اتصال التطبيق غير مكتمل. يرجى التواصل مع مسؤول التطبيق.</p></section></main>;
  return <ConvexProvider client={client}><StateProvider>{children}</StateProvider></ConvexProvider>;
}
export function useCloud() {
  const state = useContext(Context);
  if (!state) throw Error('Missing database provider');
  return state;
}
