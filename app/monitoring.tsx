'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
export default function Monitoring() {
  useEffect(() => {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (dsn && !Sentry.getClient())
      Sentry.init({
        dsn,
        environment: import.meta.env.PROD ? 'production' : 'development',
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: { request: false, response: false },
          httpBodies: [],
          urlQueryParams: false,
          graphQL: { document: false, variables: false },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          stackFrameVariables: false,
          frameContextLines: 0,
        },
        defaultIntegrations: false,
        integrations: [Sentry.globalHandlersIntegration()],
        tracesSampleRate: 0,
        beforeSend(event) {
          delete event.user;
          delete event.request;
          delete event.breadcrumbs;
          return event;
        },
      });
  }, []);
  return null;
}
