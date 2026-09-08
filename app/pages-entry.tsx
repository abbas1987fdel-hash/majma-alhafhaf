import {createRoot} from 'react-dom/client';
import Home from './page';
import Monitoring from './monitoring';
import './globals.css';
createRoot(document.getElementById('root')!).render(<><Monitoring/><Home/></>);
