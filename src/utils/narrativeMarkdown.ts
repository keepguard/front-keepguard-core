/**
 * Markdown mínimo da narrativa do analista (o LLM devolve `###`, `**negrito**`, `*itálico*`,
 * listas com `* ` ou `- ` e `---`). O parser só produz blocos de dados: quem renderiza (React ou
 * HTML exportado) escapa o texto, então nada vindo da análise vira HTML.
 */

export interface NarrativeInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type NarrativeBlock =
  | { type: 'heading'; level: 3 | 4; inlines: NarrativeInline[] }
  | { type: 'paragraph'; inlines: NarrativeInline[] }
  | { type: 'list'; items: NarrativeInline[][] }
  | { type: 'rule' };

const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const BULLET_RE = /^\s*[*\-•]\s+(.*)$/;
/** O disclaimer já aparece fixo na tela e no export; a cópia colada no fim da narrativa é ruído. */
const TRAILING_DISCLAIMER_RE = /^\s*análise,? não recomendação de investimento\.?\s*$/i;

export function parseInline(raw: string): NarrativeInline[] {
  const out: NarrativeInline[] = [];
  for (const part of raw.split(INLINE_RE)) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      out.push({ text: part.slice(1, -1), code: true });
    } else if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      out.push({ text: part.slice(2, -2), bold: true });
    } else if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      out.push({ text: part.slice(1, -1), italic: true });
    } else {
      out.push({ text: part });
    }
  }
  return out;
}

export function parseNarrative(text?: string): NarrativeBlock[] {
  const blocks: NarrativeBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list.map(parseInline) });
    list = [];
  };

  for (const rawLine of (text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      // # e ## viram o mesmo nível de seção; o título da página já é h2.
      blocks.push({ type: 'heading', level: heading[1].length <= 3 ? 3 : 4, inlines: parseInline(heading[2]) });
      continue;
    }
    if (RULE_RE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'rule' });
      continue;
    }
    const bullet = BULLET_RE.exec(rawLine);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1].trim());
      continue;
    }
    if (list.length) {
      // Linha solta logo após um item continua o mesmo item.
      list[list.length - 1] += ` ${line}`;
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  const last = blocks[blocks.length - 1];
  if (last?.type === 'paragraph' && TRAILING_DISCLAIMER_RE.test(last.inlines.map((part) => part.text).join(''))) {
    blocks.pop();
  }
  return blocks;
}
