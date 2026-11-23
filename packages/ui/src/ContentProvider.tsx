/**
 * The loaded Wander Data, for every component below. Where it comes from is the app's
 * business (the Sheets adapter in the Editor, a published snapshot on public pages).
 */
import { useContext, type ReactNode } from 'react';
import { ContentContext } from './contexts.ts';
import type { Content } from '@wander/rules';

export function ContentProvider({ content, children }: { content: Content; children: ReactNode }) {
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const content = useContext(ContentContext);
  if (!content) throw new Error('useContent needs a <ContentProvider> above it');
  return content;
}
