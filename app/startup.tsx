import { Component, useEffect, type ReactNode } from 'react';

export class StartupBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if (this.state.failed) return <main dir="rtl" style={{minHeight:'100vh',display:'grid',placeContent:'center',gap:16,padding:24,textAlign:'center',background:'#101723',color:'#f8fafc',fontFamily:'system-ui'}}>
      <h1>مجمع الهفهاف</h1>
      <p role="alert">تعذّر عرض التطبيق. أعد المحاولة لفتح دفتر الديون.</p>
      <button onClick={() => location.reload()} style={{padding:14,borderRadius:14,background:'#1e3a5f',color:'white',border:'1px solid #93c5fd'}}>إعادة المحاولة</button>
    </main>;
    return this.props.children;
  }
}

export function StartupReady() {
  useEffect(() => { window.dispatchEvent(new Event('hafhaf:ready')); }, []);
  return null;
}

export function registerOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope:import.meta.env.BASE_URL,updateViaCache:'none'}).then(registration => {
    const check = () => { if (navigator.onLine) void registration.update().catch(() => {}); };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    check();
  }).catch(() => {
    window.dispatchEvent(new Event('hafhaf:offline-unavailable'));
  });
}
