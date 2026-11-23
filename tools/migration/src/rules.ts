/**
 * Reads input/Wander Rules.json, the Google Docs API export of the rules doc
 * (documents.get with every tab), into its headed sections, so seeds can quote a
 * section's text and link to its heading.
 */
import { readFileSync } from 'node:fs';

export const RULES_DOC_ID = '1AYLpiHBynb-bDScUgkRtuCHx5Ci8NEKdMXyYxITrARE';

export interface RulesSection {
  tabId: string;
  tabTitle: string;
  /** Empty for text before a tab's first heading. */
  headingId: string;
  title: string;
  /** The paragraphs under the heading, up to the next heading of any level. */
  text: string;
}

/** A link that opens the doc at that tab and heading. */
export const sectionUrl = (s: Pick<RulesSection, 'tabId' | 'headingId'>) =>
  `https://docs.google.com/document/d/${RULES_DOC_ID}/edit?tab=${s.tabId}${s.headingId ? `#heading=${s.headingId}` : ''}`;

interface DocTab {
  tabProperties: { tabId: string; title: string };
  documentTab?: { body?: { content?: DocElement[] } };
  childTabs?: DocTab[];
}
interface DocElement {
  paragraph?: {
    elements?: { textRun?: { content?: string } }[];
    paragraphStyle?: { namedStyleType?: string; headingId?: string };
  };
}

export function readRules(path: string): RulesSection[] {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { tabs: DocTab[] };
  const sections: RulesSection[] = [];
  const walk = (tabs: DocTab[]) => {
    for (const tab of tabs) {
      const { tabId, title: tabTitle } = tab.tabProperties;
      let current: RulesSection = { tabId, tabTitle, headingId: '', title: tabTitle, text: '' };
      sections.push(current);
      for (const element of tab.documentTab?.body?.content ?? []) {
        const p = element.paragraph;
        if (!p) continue;
        const text = (p.elements ?? []).map((e) => e.textRun?.content ?? '').join('').trim();
        const style = p.paragraphStyle?.namedStyleType ?? '';
        if (style.startsWith('HEADING') || style === 'TITLE') {
          current = { tabId, tabTitle, headingId: p.paragraphStyle?.headingId ?? '', title: text, text: '' };
          sections.push(current);
        } else if (text) current.text += (current.text ? '\n' : '') + text;
      }
      walk(tab.childTabs ?? []);
    }
  };
  walk(doc.tabs);
  return sections;
}
