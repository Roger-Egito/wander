/**
 * The content types the Editor manages (the plan's initial registry). Equipment,
 * consumables and creatures come later the same way: a tab in schema.ts and an entry
 * here.
 */
import { defineContentType, label, type Field } from './define.ts';
import { COST_UNITS, SOURCES, STATUS } from './schema.ts';

// Shared fields keep their literal types (`as const`), so entity.ts can read each one's
// key and options. `satisfies Field` still checks them against the field shapes.
const status = { key: 'status', type: 'enum', options: STATUS, required: true, label: label('Status', 'Status') } as const satisfies Field;
const source = { key: 'source', type: 'enum', options: SOURCES, required: true, label: label('Fonte', 'Source') } as const satisfies Field;
const name = { key: 'name', type: 'text', required: true, unique: true, translatable: true, label: label('Nome', 'Name') } as const satisfies Field;
const inspiredBy = { key: 'inspired_by', type: 'text', label: label('Inspirado em', 'Inspired by') } as const satisfies Field;
const stolenFrom = { key: 'stolen_from', type: 'text', label: label('Roubado de', 'Stolen from') } as const satisfies Field;
const description = (recommended = true) =>
  ({ key: 'description', type: 'richtext', minLength: 4, recommended, translatable: true, label: label('Descrição', 'Description') }) as const satisfies Field;
const modifiers = { key: 'modifiers', type: 'modifiers', label: label('Modificadores', 'Modifiers') } as const satisfies Field;

export const discipline = defineContentType({
  id: 'discipline',
  tab: 'Disciplines',
  label: { singular: label('Disciplina', 'Discipline'), plural: label('Disciplinas', 'Disciplines') },
  ids: { kind: 'manual', pattern: /^[A-Z]{3}$/ },
  nameKey: 'name',
  listColumns: ['source', 'status'],
  fields: [
    name,
    { key: 'color_dark', type: 'color', label: label('Cor (tema escuro)', 'Color (dark theme)') },
    { key: 'color_light', type: 'color', label: label('Cor (tema claro)', 'Color (light theme)') },
    { key: 'icon', type: 'text', label: label('Ícone', 'Icon') },
    description(false),
    source,
    status,
  ],
});

export const skill = defineContentType({
  id: 'skill',
  tab: 'Skills',
  label: { singular: label('Habilidade', 'Skill'), plural: label('Habilidades', 'Skills') },
  // A skill's ID starts with its discipline's code: FOG-03.
  ids: { kind: 'counter', prefix: (row) => String(row.discipline_id ?? '') },
  nameKey: 'name',
  listColumns: ['discipline_id', 'level', 'status'],
  keywordSource: true,
  fields: [
    name,
    { key: 'discipline_id', type: 'reference', to: 'discipline', required: true, label: label('Disciplina', 'Discipline') },
    { key: 'level', type: 'number', integer: true, min: 1, required: true, label: label('Nível', 'Level') },
    {
      key: 'stat_requirements', type: 'subtable', tab: 'StatRequirements', parentKey: 'skill_id',
      label: label('Requisitos de atributo', 'Stat requirements'),
      fields: [
        { key: 'group', type: 'number', integer: true, min: 1, required: true, label: label('Grupo', 'Group') },
        { key: 'stat', type: 'enum', options: { tab: 'Stats', column: 'code' }, required: true, label: label('Atributo', 'Stat') },
        { key: 'value', type: 'number', integer: true, required: true, label: label('Valor', 'Value') },
      ],
    },
    {
      key: 'skill_requirements', type: 'subtable', tab: 'SkillRequirements', parentKey: 'skill_id',
      label: label('Requisitos de habilidade', 'Skill requirements'),
      oneOf: ['required_skill_id', 'required_categories'],
      fields: [
        { key: 'group', type: 'number', integer: true, min: 1, required: true, label: label('Grupo', 'Group') },
        { key: 'required_skill_id', type: 'reference', to: 'skill', label: label('Habilidade', 'Skill') },
        { key: 'required_categories', type: 'tags', options: { tab: 'Categories', column: 'name' }, label: label('Qualquer uma com as categorias', 'Any with the categories') },
      ],
    },
    { key: 'categories', type: 'tags', options: { tab: 'Categories', column: 'name' }, label: label('Categorias', 'Categories') },
    { key: 'cast_time', type: 'enum', options: { tab: 'CastTimes', column: 'name' }, label: label('Tempo de conjuração', 'Cast time') },
    { key: 'cost_value', type: 'number', min: 0, label: label('Custo', 'Cost') },
    { key: 'cost_unit', type: 'enum', options: COST_UNITS, label: label('Unidade do custo', 'Cost unit') },
    { key: 'cost_scale', type: 'enum', options: { tab: 'CostScales', column: 'name' }, label: label('Custo por', 'Cost per') },
    { key: 'cost2_value', type: 'number', min: 0, label: label('Segundo custo', 'Second cost') },
    { key: 'cost2_unit', type: 'enum', options: COST_UNITS, label: label('Unidade do segundo custo', 'Second cost unit') },
    description(),
    { key: 'notes', type: 'richtext', label: label('Notas', 'Notes') },
    inspiredBy,
    stolenFrom,
    source,
    status,
    { key: 'edited_at', type: 'text', system: true, label: label('Editado em', 'Edited at') },
    { key: 'pos_x', type: 'number', system: true, label: label('Posição X', 'Position X') },
    { key: 'pos_y', type: 'number', system: true, label: label('Posição Y', 'Position Y') },
  ],
});

export const condition = defineContentType({
  id: 'condition',
  tab: 'Conditions',
  label: { singular: label('Condição', 'Condition'), plural: label('Condições', 'Conditions') },
  ids: { kind: 'counter', prefix: 'CON' },
  nameKey: 'name',
  listColumns: ['status'],
  keywordSource: true,
  fields: [
    name,
    description(),
    { key: 'rule_url', type: 'url', label: label('Link nas regras', 'Rules link') },
    status,
    modifiers,
  ],
});

export const trait = defineContentType({
  id: 'trait',
  tab: 'Traits',
  label: { singular: label('Facilidade ou Complicação', 'Trait'), plural: label('Facilidades e Complicações', 'Traits') },
  ids: { kind: 'counter', prefix: 'FAC' },
  nameKey: 'name',
  listColumns: ['source', 'status'],
  fields: [
    name,
    { key: 'notes', type: 'richtext', translatable: true, label: label('Notas', 'Notes') },
    inspiredBy,
    stolenFrom,
    source,
    status,
    {
      key: 'levels', type: 'subtable', tab: 'TraitLevels', parentKey: 'trait_id', childIds: true,
      label: label('Níveis', 'Levels'),
      fields: [
        { key: 'tier', type: 'enum', options: { tab: 'TraitTiers', column: 'name' }, required: true, label: label('Nível', 'Tier') },
        {
          // Equipping a level equips what it requires too, so these may form cycles
          // (Mau-Cheiro Ruim and Bom require each other). Rows sharing a group are
          // alternatives.
          key: 'requirements', type: 'subtable', tab: 'TraitLevelRequirements', parentKey: 'level_id',
          label: label('Requisitos', 'Requirements'),
          fields: [
            { key: 'group', type: 'number', integer: true, min: 1, required: true, label: label('Grupo', 'Group') },
            { key: 'required_level_id', type: 'reference', to: { tab: 'TraitLevels', label: label('nível', 'trait level') }, required: true, label: label('Nível', 'Level') },
          ],
        },
        description(),
        modifiers,
      ],
    },
  ],
});

export const keyword = defineContentType({
  id: 'keyword',
  tab: 'Keywords',
  label: { singular: label('Palavra-chave', 'Keyword'), plural: label('Palavras-chave', 'Keywords') },
  ids: { kind: 'counter', prefix: 'PCH' },
  nameKey: 'name_pt',
  listColumns: ['category', 'status'],
  fields: [
    { key: 'name_pt', type: 'text', required: true, unique: true, translatable: { en: 'name_en' }, label: label('Nome', 'Name') },
    { key: 'variants_pt', type: 'tags', label: label('Variantes (separadas por vírgula)', 'Variants (comma-separated)') },
    { key: 'variants_en', type: 'tags', label: label('Variantes em inglês', 'English variants') },
    { key: 'description_pt', type: 'richtext', minLength: 4, recommended: true, translatable: { en: 'description_en' }, label: label('Descrição', 'Description') },
    { key: 'url_pt', type: 'url', recommended: true, label: label('Link nas regras', 'Rules link') },
    { key: 'url_en', type: 'url', label: label('Link nas regras em inglês', 'English rules link') },
    { key: 'category', type: 'text', label: label('Categoria', 'Category') },
    status,
  ],
});

export const CONTENT_TYPES = [discipline, skill, condition, trait, keyword] as const;

export const contentType = (id: string) => {
  const type = CONTENT_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`unknown content type ${id}`);
  return type;
};
