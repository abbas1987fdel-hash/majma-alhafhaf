import {createRoot} from 'react-dom/client';
import Home from './page';
import Monitoring from './monitoring';
import './globals.css';
import { registerOfflineShell, StartupBoundary, StartupReady } from './startup';
registerOfflineShell();
createRoot(document.getElementById('root')!).render(<StartupBoundary><Monitoring/><Home/><StartupReady/></StartupBoundary>);
