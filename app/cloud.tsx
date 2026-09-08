'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery, useConvexConnectionState } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../convex/_generated/api';
import { DEFAULT_NAME, DEFAULT_INTRO } from '@/lib/preferences';
import type { Id } from '../convex/_generated/dataModel';

const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url, { logger: false }) : null;
export function friendlyError(error: unknown) {
  return error instanceof ConvexError && typeof error.data === 'string'
    ? error.data : 'تعذّر إكمال العملية. تحقق من اتصال الإنترنت وحاول مجددًا.';
}
function useCloudState() {
  const [token, setToken] = useState('');
  const branding = useQuery(api.shop.branding, {});
  const data = useQuery(api.shop.snapshot, token ? { token } : 'skip');
  const connection = useConvexConnectionState();
  const loginAction = useAction(api.auth.login);
  const changeAction = useAction(api.auth.changePin);
  const logoutMutation = useMutation(api.shop.logout);
  const saveSettingsMutation = useMutation(api.shop.saveSettings);
  const uploadUrl = useMutation(api.shop.uploadUrl);
  const saveCustomer = useMutation(api.shop.saveCustomer);
  const saveProduct = useMutation(api.shop.saveProduct);
  const saveTransaction = useMutation(api.shop.saveTransaction);
  const remove = useMutation(api.shop.remove);
  const name = data?.settings.name || branding?.name || DEFAULT_NAME;
  const logo = data?.settings.logo || branding?.logo || `${import.meta.env.BASE_URL}brand.png`;
  const intro = data?.settings.intro ?? DEFAULT_INTRO;
  const [downloadedLogo, setDownloadedLogo] = useState<{url: string; file: File} | null>(null);
  const logoFile = downloadedLogo?.url === logo ? downloadedLogo.file : null;
  useEffect(() => { document.title = `${name} | دفتر الديون`; }, [name]);
  const expires = data?.sessionExpires;
  useEffect(() => {
    if (!expires) return;
    const timer = setTimeout(() => setToken(''), Math.max(0, expires - Date.now()));
    return () => clearTimeout(timer);
  }, [expires]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(logo, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('Logo unavailable');
      const blob = await response.blob();
      if (!controller.signal.aborted) setDownloadedLogo({url: logo, file: new File([blob], 'شعار-المجمع.' + (blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'), { type: blob.type })});
    }).catch(() => {});
    return () => controller.abort();
  }, [logo]);
  async function login(pin: string) { setToken((await loginAction({ pin })).token); }
  async function lock() {
    const oldToken = token;
    setToken('');
    try { await logoutMutation({ token: oldToken }); } catch { /* Session remains unusable in this browser and expires on the server. */ }
  }
  async function changePin(currentPin: string, newPin: string) {
    const result = await changeAction({ token, currentPin, newPin });
    setToken(result.token);
  }
  async function saveSettings(nextName: string, nextIntro: string, file: File | null) {
    let logoId: Id<'_storage'> | undefined;
    if (file) {
      const target = await uploadUrl({ token });
      const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw Error('Upload failed');
      const uploaded = await response.json() as { storageId?: string };
      if (typeof uploaded.storageId !== 'string') throw Error('Invalid upload response');
      logoId = uploaded.storageId as Id<'_storage'>;
    }
    await saveSettingsMutation({ token, name: nextName, intro: nextIntro, ...(logoId ? { logoId } : {}) });
  }
  return { token, data, name, intro, logo, logoFile, login, lock, changePin, saveSettings,
    connected: connection.isWebSocketConnected, saveCustomer, saveProduct, saveTransaction, remove };
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
