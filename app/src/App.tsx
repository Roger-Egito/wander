import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LanguageProvider, ThemeProvider } from '@wander/ui';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { EditorPage } from './editor/EditorPage.tsx';
import { TopBar } from './TopBar.tsx';

// Development-only pages: the component gallery (with the local content it shows) and
// the Sheets live check. import.meta.env.DEV is the constant false in a production
// build, so these imports are never reached there and the bundler leaves them out.
const GalleryPage = import.meta.env.DEV ? lazy(() => import('./dev/GalleryPage.tsx')) : null;
const DevSheets = import.meta.env.DEV ? lazy(() => import('./routes/DevSheets.tsx').then((m) => ({ default: m.DevSheets }))) : null;

/** Routes live under the deploy path (/wander/ on GitHub Pages, / on the dev server). */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter basename={basename}>
            <TopBar />
            <Suspense fallback={null}>
              <Routes>
                {/* Only the Editor is linked for now. */}
                <Route path="/" element={<Navigate to={GalleryPage ? '/gallery' : '/editor'} replace />} />
                <Route path="/editor" element={<EditorPage />} />
                {GalleryPage && <Route path="/gallery" element={<GalleryPage />} />}
                {DevSheets && <Route path="/dev/sheets" element={<DevSheets />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
