/**
 * One card per content type: how a skill, condition, trait or keyword looks in the
 * compendium, the Editor's preview and the skill tree. Every text goes through the
 * chosen language (hand-written English, then the automatic translation, then
 * Portuguese), and every cost and requirement through @wander/rules' formatters.
 *
 * Skills and traits also say what inspired them (and, as a joke, what they were "stolen"
 * from: game mechanics can't be stolen). Their designer notes show behind a button, but
 * only where the caller opts in with `notes`, so a page decides whether players see them.
 */
import type { ReactNode } from 'react';
import {
  costsOf, formatCost, formatSkillRequirements, formatStatRequirements, inLanguage, levelGroups, pdCost, skillGroups, statGroups, traitKind,
  translateName, type Condition, type Discipline, type Keyword, type Modifier, type Skill, type Status, type Trait,
} from '@wander/rules';
import { useContent } from '../ContentProvider.tsx';
import { useLanguage } from '../i18n/LanguageProvider.tsx';
import type { MessageKey } from '../i18n/messages.ts';
import { RichText } from '../RichText.tsx';
import styles from './cards.module.css';

function Card({ title, subtitle, status, children }: { title: string; subtitle?: ReactNode; status?: Status; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {status && status !== 'official' && <span className={styles.badge} data-status={status}>{t(`status.${status}` as MessageKey)}</span>}
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </header>
      {children}
    </article>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, value]) => value !== '' && value !== null);
  if (!shown.length) return null;
  return (
    <dl className={styles.facts}>
      {shown.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Modifiers({ modifiers }: { modifiers: Modifier[] }) {
  const content = useContent();
  const { language, t } = useLanguage();
  if (!modifiers.length) return null;
  return (
    <ul className={styles.modifiers} aria-label={t('card.modifiers')}>
      {modifiers.map((m, i) => {
        const stat = content.stats.find((s) => s.code === m.stat);
        const name = stat ? (language === 'en' ? stat.abbr_en || stat.abbr_pt : stat.abbr_pt) : m.stat;
        return (
          <li key={i} data-sign={m.value >= 0 ? 'up' : 'down'}>
            {stat?.emoji} {name} {m.value >= 0 ? `+${m.value}` : `−${Math.abs(m.value)}`}
            {m.temporary && <span className={styles.note}> ({t('card.temporary')})</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Opt-in designer notes: whether they're open, and what the card's button does. */
export interface NotesControl {
  open: boolean;
  onToggle: () => void;
}

function Origins({ inspiredBy, stolenFrom }: { inspiredBy: string; stolenFrom: string }) {
  const { t } = useLanguage();
  if (!inspiredBy && !stolenFrom) return null;
  return (
    <dl className={styles.origins}>
      {inspiredBy && <div><dt>{t('card.inspiredBy')}</dt><dd>{inspiredBy}</dd></div>}
      {stolenFrom && <div><dt>{t('card.stolenFrom')}</dt><dd>{stolenFrom}</dd></div>}
    </dl>
  );
}

function Notes({ text, control }: { text: string; control?: NotesControl }) {
  const { t } = useLanguage();
  if (!control || !text.trim()) return null;
  return (
    <div className={styles.notes}>
      <button type="button" className={styles.notesButton} aria-expanded={control.open} onClick={control.onToggle}>
        {t('card.notes')}
      </button>
      {control.open && <div className={styles.notesText}><RichText text={text} /></div>}
    </div>
  );
}

/* --- skill ----------------------------------------------------------------------- */

export function SkillCard({ skill, notes }: { skill: Skill; notes?: NotesControl }) {
  const content = useContent();
  const { language, t } = useLanguage();
  const at = (field: string) => ({ tab: 'Skills' as const, id: skill.id, field });
  const discipline = content.discipline.find((d) => d.id === skill.discipline_id);
  const disciplineName = discipline ? inLanguage(content, language, { tab: 'Disciplines', id: discipline.id, field: 'name' }, discipline.name, discipline.name_en) : skill.discipline_id;
  const cost = formatCost(costsOf(skill), content, language);
  return (
    <Card
      title={inLanguage(content, language, at('name'), skill.name, skill.name_en)}
      status={skill.status}
      subtitle={<>{disciplineName} · {t('card.level', { level: skill.level ?? '?' })} · <span className={styles.id}>{skill.id}</span></>}
    >
      <Facts
        items={[
          [t('card.castTime'), skill.cast_time && translateName(content, 'CastTimes', skill.cast_time, language)],
          [t('card.cost'), cost || t('card.noCost')],
          [t('card.stats'), formatStatRequirements(statGroups(skill), content, { language })],
          [t('card.skills'), formatSkillRequirements(skillGroups(skill), content, language)],
        ]}
      />
      {skill.categories.length > 0 && (
        <ul className={styles.tags} aria-label={t('card.categories')}>
          {skill.categories.map((c) => <li key={c}>{translateName(content, 'Categories', c, language)}</li>)}
        </ul>
      )}
      <p className={styles.description}>
        <RichText text={inLanguage(content, language, at('description'), skill.description, skill.description_en)} exclude={skill.id} />
      </p>
      <Origins inspiredBy={skill.inspired_by} stolenFrom={skill.stolen_from} />
      <Notes text={skill.notes} control={notes} />
    </Card>
  );
}

/* --- condition ------------------------------------------------------------------- */

export function ConditionCard({ condition }: { condition: Condition }) {
  const content = useContent();
  const { language, t } = useLanguage();
  const at = (field: string) => ({ tab: 'Conditions' as const, id: condition.id, field });
  return (
    <Card title={inLanguage(content, language, at('name'), condition.name, condition.name_en)} status={condition.status} subtitle={<span className={styles.id}>{condition.id}</span>}>
      {condition.description && (
        <p className={styles.description}>
          <RichText text={inLanguage(content, language, at('description'), condition.description, condition.description_en)} exclude={condition.id} />
        </p>
      )}
      <Modifiers modifiers={condition.modifiers} />
      {condition.rule_url && <a className={styles.link} href={condition.rule_url} target="_blank" rel="noreferrer">{t('card.rules')}</a>}
    </Card>
  );
}

/* --- trait ----------------------------------------------------------------------- */

export function TraitCard({ trait, notes }: { trait: Trait; notes?: NotesControl }) {
  const content = useContent();
  const { language, t } = useLanguage();
  const name = inLanguage(content, language, { tab: 'Traits', id: trait.id, field: 'name' }, trait.name, trait.name_en);
  const tierName = (tier: string) => translateName(content, 'TraitTiers', tier, language);
  /** "Mau-Cheiro Bom", or just "Bom" when the required level is of this same trait. */
  const levelName = (id: string) => {
    const level = content.traitLevelsById.get(id);
    if (!level) return id;
    if (level.trait_id === trait.id) return tierName(level.tier);
    const other = content.trait.find((x) => x.id === level.trait_id);
    return `${other ? inLanguage(content, language, { tab: 'Traits', id: other.id, field: 'name' }, other.name, other.name_en) : level.trait_id} ${tierName(level.tier)}`;
  };
  return (
    <Card title={name} status={trait.status} subtitle={<span className={styles.id}>{trait.id}</span>}>
      <ol className={styles.levels}>
        {trait.levels.map((level) => {
          const cost = pdCost(content, level);
          const kind = traitKind(cost);
          const requires = levelGroups(level).map((group) => group.map(levelName).join(` ${t('card.or')} `));
          return (
            <li key={level.id} className={styles.level} data-kind={kind}>
              <div className={styles.levelHead}>
                <strong>{tierName(level.tier)}</strong>
                <span className={styles.note}>
                  {t(`trait.${kind}`)}{cost !== null && cost !== 0 && ` · ${t('trait.pd', { cost: cost > 0 ? `+${cost}` : `−${Math.abs(cost)}` })}`}
                </span>
              </div>
              {requires.length > 0 && <div className={styles.requires}>{t('card.requires', { levels: requires.join(', ') })}</div>}
              <p className={styles.description}>
                <RichText text={inLanguage(content, language, { tab: 'TraitLevels', id: level.id, field: 'description' }, level.description, level.description_en)} />
              </p>
              <Modifiers modifiers={level.modifiers} />
            </li>
          );
        })}
      </ol>
      <Origins inspiredBy={trait.inspired_by} stolenFrom={trait.stolen_from} />
      <Notes text={inLanguage(content, language, { tab: 'Traits', id: trait.id, field: 'notes' }, trait.notes, trait.notes_en)} control={notes} />
    </Card>
  );
}

/* --- keyword --------------------------------------------------------------------- */

export function KeywordCard({ keyword }: { keyword: Keyword }) {
  const { language, t } = useLanguage();
  const en = language === 'en';
  const variants = en && keyword.name_en ? keyword.variants_en : keyword.variants_pt;
  const url = (en && keyword.url_en) || keyword.url_pt;
  return (
    <Card title={(en && keyword.name_en) || keyword.name_pt} status={keyword.status} subtitle={<span className={styles.id}>{keyword.id}</span>}>
      {variants.length > 0 && <div className={styles.note}>{t('card.variants', { variants: variants.join(', ') })}</div>}
      <p className={styles.description}>
        <RichText text={(en && keyword.description_en) || keyword.description_pt} exclude={keyword.id} />
      </p>
      {url && <a className={styles.link} href={url} target="_blank" rel="noreferrer">{t('card.rules')}</a>}
    </Card>
  );
}

/* --- discipline ------------------------------------------------------------------ */

export function DisciplineCard({ discipline }: { discipline: Discipline }) {
  const content = useContent();
  const { language } = useLanguage();
  const at = (field: string) => ({ tab: 'Disciplines' as const, id: discipline.id, field });
  return (
    <Card title={inLanguage(content, language, at('name'), discipline.name, discipline.name_en)} status={discipline.status} subtitle={<><span className={styles.id}>{discipline.id}</span> · {discipline.source}</>}>
      {discipline.description && (
        <p className={styles.description}>
          <RichText text={inLanguage(content, language, at('description'), discipline.description, discipline.description_en)} />
        </p>
      )}
    </Card>
  );
}
