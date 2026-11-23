/**
 * The component gallery with the local development content (app/dev-data, or the
 * migration output). Development only: App loads this file only on the dev server, so
 * neither the gallery nor the local content ends up in a production build.
 */
import { useMemo } from 'react';
import { loadContent } from '@wander/rules';
import { ContentProvider } from '@wander/ui';
import { Gallery, GalleryNoData } from '../routes/Gallery.tsx';
import { devTables } from './devContent.ts';

export default function GalleryPage() {
  const content = useMemo(() => (devTables ? loadContent(devTables) : null), []);
  if (!content) return <GalleryNoData />;
  return (
    <ContentProvider content={content}>
      <Gallery />
    </ContentProvider>
  );
}
