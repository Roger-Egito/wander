/**
 * Every shared component on one page, to check them in both themes and languages and at
 * phone width before a screen uses them. Real Wander Data, a few chosen rows per type.
 */
import { useState } from 'react';
import { inLanguage } from '@wander/rules';
import {
  ConditionCard, KeywordCard, RichText, SkillCard, SkillTree, StatValue, TraitCard, useContent, useLanguage,
} from '@wander/ui';
import { devSource } from '../dev/devContent.ts';
import styles from './Gallery.module.css';

/** IDs worth seeing: requirements with alternatives, a cost scale, two costs, trait requirements. */
const SKILLS = ['TRE-07', 'OUE-15', 'RAS-20', 'ARC-02'];
const TRAITS = ['FAC-14', 'FAC-06', 'FAC-01'];
const KEYWORDS = ['PCH-41', 'PCH-46'];

function Header() {
  const { t } = useLanguage();
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{t('gallery.title')}</h1>
    </header>
  );
}

export function Gallery() {
  const content = useContent();
  const { language, t } = useLanguage();
  const [discipline, setDiscipline] = useState('ARC');
  const [selected, setSelected] = useState<string>();
  const pick = <T extends { id: string }>(rows: T[], ids: string[]) => ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is T => !!r);
  const selectedSkill = selected ? content.skillsById.get(selected) : undefined;
  const sample = content.skillsById.get('ARC-02') ?? content.skill[0];

  return (
    <main className={styles.page}>
      <Header />
      <p className={styles.source}>Data: {devSource}</p>

      <section>
        <h2>{t('gallery.cards')}</h2>
        <div className={styles.grid}>
          {pick(content.skill, SKILLS).map((s) => <SkillCard key={s.id} skill={s} />)}
          {content.condition.filter((c) => c.description).slice(0, 2).map((c) => <ConditionCard key={c.id} condition={c} />)}
          {pick(content.trait, TRAITS).map((tr) => <TraitCard key={tr.id} trait={tr} />)}
          {pick(content.keyword, KEYWORDS).map((k) => <KeywordCard key={k.id} keyword={k} />)}
        </div>
      </section>

      <section>
        <h2>{t('gallery.richText')}</h2>
        <p className={styles.prose}>
          <RichText text={inLanguage(content, language, { tab: 'Skills', id: sample.id, field: 'description' }, sample.description, sample.description_en)} exclude={sample.id} />
        </p>
      </section>

      <section>
        <h2>{t('gallery.stats')}</h2>
        <div className={styles.stats}>
          <StatValue code="FIS" base={5} />
          <StatValue code="SEN" base={4} parts={[{ label: 'Senso de Direção Bom', value: 1 }]} />
          <StatValue code="ESP" base={6} parts={[{ label: 'Queimando', value: -2, temporary: true }, { label: 'Amuleto', value: 1 }]} />
          <StatValue code="DES" base={8} />
        </div>
      </section>

      <section>
        <h2>{t('gallery.tree')}</h2>
        <label className={styles.picker}>
          {t('gallery.discipline')}{' '}
          <select value={discipline} onChange={(e) => { setDiscipline(e.target.value); setSelected(undefined); }}>
            {content.discipline.map((d) => (
              <option key={d.id} value={d.id}>{inLanguage(content, language, { tab: 'Disciplines', id: d.id, field: 'name' }, d.name, d.name_en)}</option>
            ))}
          </select>
        </label>
        <SkillTree disciplineId={discipline} taken={['ARC-01']} selected={selected} onSelect={setSelected} />
        {selectedSkill && <div className={styles.selected}><SkillCard skill={selectedSkill} /></div>}
      </section>
    </main>
  );
}

export function GalleryNoData() {
  const { t } = useLanguage();
  return (
    <main className={styles.page}>
      <Header />
      <p>{t('gallery.noData')}</p>
    </main>
  );
}
