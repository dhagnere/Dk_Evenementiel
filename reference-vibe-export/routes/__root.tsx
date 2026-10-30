import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
// Importing start installs the global server-fn fetch (cross-origin + bearer auth) and the
// postMessage auth bridge as a side effect.
import '@/start';
import '@/index.css';
import '@generated/theme-tokens.css';
import { QueryClientProvider, vibeQueryClient } from '@vibe/db/client';
import { MondayContextProvider } from '@/context/MondayContextProvider';
import { MondayThemeProvider } from '@/context/MondayThemeProvider';
import { init } from '@/services/error-reporting';
import { initBigBrain } from '@/services/bigbrain-init';
import { PublicViewTracker } from '@/components/public-view-tracker/PublicViewTracker';
import { VibeWatermark } from '@components/vibe-watermark/VibeWatermark';

const SHOW_WATERMARK =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('hideWatermark') !== 'true';

if (typeof window !== 'undefined') {
  init();
  initBigBrain();

  // Vibe Element Selection — lets the host editor drive react-grab in this preview.
  // react-grab is dynamically imported only when the host turns on pick mode, so idle
  // apps never download or run it; this just wires up the (cheap) postMessage listener.
  import('@/services/element-selection')
    .then((m) => m.initElementSelection())
    .catch(() => {});
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      // Replaced with the real app name at deploy time (fullstack-client-code-handler).
      { title: '__VIBE_APP_NAME__' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <link rel="icon" type="image/png" href="/favicon.png" />
      </head>
      <body>
        <QueryClientProvider client={vibeQueryClient}>
          <MondayContextProvider>
            <PublicViewTracker />
            <MondayThemeProvider>
              <Outlet />
            </MondayThemeProvider>
            {SHOW_WATERMARK && <VibeWatermark />}
          </MondayContextProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
