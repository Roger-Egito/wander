/**
 * Starting rows for Conditions and Keywords, which Fichas v15 has no tab for.
 *
 * Conditions take their text from the rules doc's Condições tab, or from the Dicionário
 * tab of Fichas v15, word for word. A condition the skills use but neither source
 * defines gets an empty description and status draft, so the Validation tab lists it.
 *
 * Keyword descriptions are drafts written for the migration, each a summary of the
 * rules section it links to (or the Dicionário's own text), all with status draft for
 * me to review. A keyword no source explains gets an empty description instead of
 * a guess.
 */
import { sectionUrl, type RulesSection } from './rules.ts';
import type { Row } from '@wander/content';

/** A rules doc section, by tab title and heading text. An empty heading means the tab's own text. */
type Section = { tab: string; heading: string };

const CONDITIONS: { name: string; from: Section | 'dicionario' | null }[] = [
  { name: 'Sangrando', from: { tab: 'Condições', heading: 'Sangrando' } },
  { name: 'Envenenado', from: { tab: 'Condições', heading: 'Envenenado' } },
  { name: 'Queimando', from: { tab: 'Condições', heading: 'Queimando' } },
  { name: 'Paralisado', from: { tab: 'Condições', heading: 'Paralisado' } },
  { name: 'Próximo da Morte', from: 'dicionario' },
  // Used by skills, not defined anywhere yet.
  { name: 'Agarrado', from: null },
  { name: 'Cego', from: null },
  { name: 'Confuso', from: null },
  { name: 'Derrubado', from: null },
  { name: 'Dor', from: null },
  { name: 'Escondido', from: null },
  { name: 'Inconsciente', from: null },
];

interface KeywordSeed {
  name: string;
  variants?: string[];
  category: string;
  /** The rules section the description summarizes and the link opens. */
  section?: Section;
  /** Drafted from the section. Omitted when the Dicionário has the text, or no source explains the term. */
  description?: string;
}

const KEYWORDS: KeywordSeed[] = [
  // Regras Gerais
  { name: 'Teste', variants: ['Testes'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Testes' },
    description: 'Rolagem de 2d10 somada ao Valor de um Atributo e comparada à Classe de Dificuldade. Passa quem tirar igual ou acima dela.' },
  { name: 'Classe de Dificuldade', variants: ['CD', 'Classes de Dificuldade'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Classe de Dificuldade' },
    description: 'Número que o total de um Teste precisa igualar ou superar. O Mestre define, de 5 (um ser humano normal conseguiria) a 30 (quase impossível).' },
  { name: 'Vantagem', variants: ['Vantagens'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Vantagens e Desvantagens' },
    description: 'Para cada Vantagem, role +1d10 no Teste e descarte o dado de menor valor. Vantagens e Desvantagens se anulam.' },
  { name: 'Desvantagem', variants: ['Desvantagens'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Vantagens e Desvantagens' },
    description: 'Para cada Desvantagem, role +1d10 no Teste e descarte o dado de maior valor. Vantagens e Desvantagens se anulam.' },
  { name: 'Explosão', variants: ['Explosões', 'Explodir', 'Explode'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Explosões e Implosões' },
    description: 'Quando um dado cai 10, ele Explode: some +1d10 ao Teste, Explodindo de novo a cada 10.' },
  { name: 'Implosão', variants: ['Implosões', 'Implodir', 'Implode'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Explosões e Implosões' },
    description: 'Quando um dado cai 1, ele Implode: subtraia 1d10 do Teste. Esse dado pode Explodir, mas não Implodir de novo.' },
  { name: 'Sucesso Crítico', variants: ['Sucessos Críticos'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Explosões e Implosões' },
    description: 'Dois 10 nos 2d10 iniciais: você passa automaticamente no Teste e recupera toda a sua Motivação.' },
  { name: 'Falha Crítica', variants: ['Falhas Críticas'], category: 'Testes', section: { tab: 'Regras Gerais', heading: 'Explosões e Implosões' },
    description: 'Dois 1 nos 2d10 iniciais: você falha automaticamente no Teste, e o Mestre pode acrescentar uma consequência narrativa.' },
  { name: 'Ponto de Plot', variants: ['Pontos de Plot'], category: 'Regras Opcionais', section: { tab: 'Regras Gerais', heading: 'Pontos de Plot' },
    description: 'Regra opcional. Gaste 1 para fazer uma pergunta sobre o mundo que o Mestre responde com sinceridade, ou uma afirmação que passa a ser verdade. Podem ser acumulados e passados a outros jogadores.' },

  // Criação de Personagem
  { name: 'Atributo', variants: ['Atributos', 'Valor de Atributo'], category: 'Personagem', section: { tab: 'Criação de Personagem', heading: '2. Defina seus Atributos' },
    description: 'Os sete valores do Personagem: Físico, Técnica, Sentidos, Conhecimento, Influência, Instinto e Espírito. Todo Teste soma o Valor de um Atributo.' },
  { name: 'Pontos de Experiência', variants: ['XP', 'Ponto de Experiência'], category: 'Personagem', section: { tab: 'Criação de Personagem', heading: 'Distribuição de Pontos' },
    description: 'Pontos gastos para aumentar Atributos. Subir um Atributo em 1 custa o valor que ele vai alcançar. Na Criação Completa, cada Personagem recebe 50.' },

  // Exploração
  { name: 'Jornada', variants: ['Jornadas'], category: 'Exploração', section: { tab: 'Exploração', heading: 'Jornada' },
    description: 'Deslocamento longo, de um ponto a outro, abstraído em tempo. Por padrão, um Personagem anda seu Deslocamento × 10 km por dia, com 10 horas de caminhada.' },
  { name: 'Rolagem de Evento', variants: ['Rolagens de Evento', 'Evento', 'Eventos'], category: 'Exploração', section: { tab: 'Exploração', heading: 'Segurança' },
    description: '1d10 rolado a cada dia de viagem ou Jornada. Igual ou abaixo do Nível de Ameaça, acontece um Evento negativo. Igual ou acima do Limite de Oportunidade, um positivo.' },
  { name: 'Nível de Ameaça', category: 'Exploração', section: { tab: 'Exploração', heading: 'Segurança' },
    description: 'Valor de uma Região, 2 por padrão. Uma Rolagem de Evento igual ou abaixo dele gera um Evento negativo.' },
  { name: 'Limite de Oportunidade', category: 'Exploração', section: { tab: 'Exploração', heading: 'Segurança' },
    description: 'Valor de uma Região, 9 por padrão. Uma Rolagem de Evento igual ou acima dele gera um Evento positivo.' },
  { name: 'Nível de Segurança', category: 'Exploração', section: { tab: 'Exploração', heading: 'Segurança' },
    description: 'Valor do dia de Jornada, 0 por padrão. Cada nível acima de 0 dá 1 Vantagem na Rolagem de Evento, e cada nível abaixo, 1 Desvantagem.' },
  { name: 'Região', variants: ['Regiões'], category: 'Exploração', section: { tab: 'Exploração', heading: 'Segurança' },
    description: 'Área de tamanho abstrato em um mapa, definida pelo Mestre, que pode ter um Nível de Ameaça e um Limite de Oportunidade.' },
  { name: 'Ritmo de Jornada', category: 'Exploração', section: { tab: 'Exploração', heading: 'Ritmo de Jornada' },
    description: 'Normal, com Cuidado (Deslocamento pela metade e +1 Nível de Segurança) ou com Pressa (Deslocamento dobrado, -1 Nível de Segurança e 2 Rolagens de Evento).' },
  { name: 'Terreno Difícil', category: 'Exploração', section: { tab: 'Terreno Difícil', heading: '' },
    description: 'Todo passo que começa ou termina nele gasta 1m a mais de movimento. Em uma Jornada, a distância percorrida cai pela metade.' },
  { name: 'Nível de Exaustão', variants: ['Níveis de Exaustão', 'Exaustão'], category: 'Exploração', section: { tab: 'Exploração', heading: 'Ritmo de Jornada' },
    description: 'Ganha-se 1 a cada hora de deslocamento além de 10 horas em um dia, e 1 a cada 24 horas sem dormir.' },

  // Combate
  { name: 'Deslocamento', variants: ['Deslocar', 'Deslocar-se'], category: 'Combate', section: { tab: 'Combate', heading: 'Movimento' },
    description: 'Quantos metros você pode se mover no seu Turno, 3m por padrão. Também define a distância de uma Jornada.' },
  { name: 'Combate', category: 'Combate', section: { tab: 'Combate', heading: 'Combate' },
    description: 'Começa quando um lado desfere o primeiro Ataque e termina quando um lado desiste, foge ou é derrotado. É dividido em Rodadas.' },
  { name: 'Rodada', variants: ['Rodadas'], category: 'Combate', section: { tab: 'Combate', heading: 'Rodada' },
    description: 'Parte do Combate em que cada Criatura relevante recebe 1 Turno. Chefes podem ter vários.' },
  { name: 'Turno', variants: ['Turnos'], category: 'Combate', section: { tab: 'Combate', heading: 'Turno' },
    description: 'A vez de uma Criatura no Combate. Por padrão, você pode se mover até seu Deslocamento, usar 1 Ação e quantas Ações Especiais quiser.' },
  { name: 'Ação', variants: ['Ações'], category: 'Combate', section: { tab: 'Combate', heading: 'Ações' },
    description: 'O que você faz no seu Turno, 1 por padrão: Atacar, Defender, Disparada ou um Teste. Usar 1 Ação Especial e queimar 2 de Motivação dá +1 Ação.' },
  { name: 'Ação Especial', variants: ['Ações Especiais'], category: 'Combate', section: { tab: 'Combate', heading: 'Ações Especiais' },
    description: 'Ação ilimitada, inclusive fora do seu Turno, desde que você cumpra seus Requerimentos. Por padrão: conversar, trocar de Arma e usar os efeitos de Motivação.' },
  { name: 'Defender', category: 'Combate', section: { tab: 'Combate', heading: 'Ações' },
    description: 'Ação. Ataques e Testes contra você têm 1 Desvantagem até o início do seu próximo Turno, e você ganha +1 Ação no Turno seguinte.' },
  { name: 'Disparada', category: 'Combate', section: { tab: 'Combate', heading: 'Ações' },
    description: 'Ação. Você se move o dobro do seu Deslocamento + 1d4 metros neste Turno.' },
  { name: 'Analisar', category: 'Combate', section: { tab: 'Combate', heading: 'Ações' },
    description: 'Teste de Sentidos, Conhecimento ou Instinto VS o Instinto do oponente para descobrir 1 informação da ficha dele.' },
  { name: 'Impor Condição', category: 'Combate', section: { tab: 'Combate', heading: 'Ações' },
    description: 'Teste Contestado, definido pelo Mestre, para impor uma Condição (cegar, agarrar...) a um oponente, quando for narrativamente possível.' },
  { name: 'Chefe', variants: ['Chefes'], category: 'Combate', section: { tab: 'Combate', heading: 'Chefes' },
    description: 'Inimigo especial com 1 Turno e 1 de Vida para cada Personagem de Jogador no Combate.' },

  // Descanso
  { name: 'Descanso', variants: ['Descansos', 'Descansar'], category: 'Descanso', section: { tab: 'Descanso', heading: 'Descanso' },
    description: '1 minuto ou mais sem ações e com pouco movimento. Remove 1 de Fadiga a cada 10 minutos e cura 1 Ferida se você dormir por 8 horas.' },
  { name: 'Atividade', variants: ['Atividades'], category: 'Descanso', section: { tab: 'Descanso', heading: 'Descanso' },
    description: 'Algo feito durante um Descanso, de 1 minuto por padrão, que dá um bônus. Por exemplo, beber 500mL de Água restaura toda a Fadiga, e 1 Bandagem cura 1 Ferida.' },

  // Perícias
  { name: 'Perícia Simples', variants: ['Perícias Simples'], category: 'Perícias', section: { tab: 'Perícias', heading: 'Perícias Simples' },
    description: 'Frase que descreve um aspecto do Personagem e dá 1 Vantagem nos Testes em que se aplica. Não vale em Combate nem em Testes de Habilidades.' },
  { name: 'Perícia Complexa', variants: ['Perícias Complexas'], category: 'Perícias', section: { tab: 'Perícias', heading: 'Perícias Complexas (opcional)' },
    description: 'Regra opcional. Cada PD investido em uma Perícia dá +1 nos Testes que a usam, e Testes sem uma Perícia apropriada têm 1 Desvantagem.' },

  // Dicionário of Fichas v15: the description is its own text.
  { name: 'Dano Direto', category: 'Dano' },
  { name: 'Dano Verdadeiro', category: 'Dano' },
  { name: 'Alcance Corpo-a-corpo', category: 'Alcance' },
  { name: 'Alcance à Distância', category: 'Alcance' },

  // The skills use these all the time, but no source explains them yet.
  { name: 'Alvo', variants: ['Alvos'], category: 'Combate' },
  { name: 'Fadiga', category: 'Recursos' },
  { name: 'Ferida', variants: ['Feridas'], category: 'Recursos' },
  { name: 'Motivação', category: 'Recursos' },
  { name: 'Vida', category: 'Recursos' },
  { name: 'Foco', variants: ['Focar', 'Focando'], category: 'Habilidades' },
  { name: 'Descanso Longo', variants: ['Descansos Longos'], category: 'Descanso' },
];

export interface SeedProblem {
  kind: string;
  detail: string;
  id: string;
}

/** The Dicionário tab of Fichas v15: name → description (empty when it has none). */
export type Dictionary = Map<string, string>;

export function seedConditions(rules: RulesSection[], dictionary: Dictionary, nextId: (prefix: string) => string) {
  const rows: Row[] = [];
  const problems: SeedProblem[] = [];
  for (const seed of CONDITIONS) {
    const id = nextId('CON');
    let description = '';
    let ruleUrl = '';
    if (seed.from === 'dicionario') description = dictionary.get(seed.name) ?? '';
    else if (seed.from) {
      const section = find(rules, seed.from);
      if (section) {
        description = section.text;
        ruleUrl = sectionUrl(section);
      } else problems.push({ kind: 'rules section not found', detail: `"${seed.from.heading}" in tab "${seed.from.tab}"`, id });
    }
    if (!description) problems.push({ kind: 'condition without a description', detail: `"${seed.name}" is used by skills, but neither the rules doc nor the Dicionário defines it: status draft`, id });
    rows.push({ id, name: seed.name, name_en: '', description, description_en: '', rule_url: ruleUrl, status: description ? 'playtest' : 'draft' });
  }
  return { rows, problems };
}

export function seedKeywords(rules: RulesSection[], dictionary: Dictionary, nextId: (prefix: string) => string) {
  const rows: Row[] = [];
  const problems: SeedProblem[] = [];
  for (const seed of KEYWORDS) {
    const id = nextId('PCH');
    const section = seed.section && find(rules, seed.section);
    if (seed.section && !section) problems.push({ kind: 'rules section not found', detail: `"${seed.section.heading}" in tab "${seed.section.tab}"`, id });
    const description = seed.description ?? dictionary.get(seed.name) ?? '';
    if (!description) problems.push({ kind: 'keyword without a description', detail: `"${seed.name}": no source explains it yet`, id });
    rows.push({
      id, name_pt: seed.name, variants_pt: (seed.variants ?? []).join(', '), name_en: '', variants_en: '',
      description_pt: description, description_en: '', url_pt: section ? sectionUrl(section) : '', url_en: '',
      category: seed.category, status: 'draft',
    });
  }
  return { rows, problems };
}

const clean = (text: string) => text.trim().replace(/[:\s]+$/, '');

function find(rules: RulesSection[], { tab, heading }: Section) {
  return rules.find((s) => s.tabTitle === tab && (heading ? clean(s.title) === clean(heading) && s.headingId : !s.headingId));
}
