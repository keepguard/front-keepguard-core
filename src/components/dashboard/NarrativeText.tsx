import React from 'react';
import { parseNarrative, type NarrativeInline } from '../../utils/narrativeMarkdown';

function Inlines({ items }: { items: NarrativeInline[] }) {
  return (
    <>
      {items.map((part, index) => {
        if (part.code) return <code key={index}>{part.text}</code>;
        if (part.bold) return <strong key={index}>{part.text}</strong>;
        if (part.italic) return <em key={index}>{part.text}</em>;
        return <React.Fragment key={index}>{part.text}</React.Fragment>;
      })}
    </>
  );
}

export interface NarrativeTextProps {
  text?: string;
}

/**
 * Narrativa do analista com o markdown mínimo que o modelo devolve (títulos, negrito, itálico,
 * listas e divisor). Só elementos React: o texto nunca vira HTML.
 */
export function NarrativeText({ text }: NarrativeTextProps) {
  const blocks = parseNarrative(text);
  return (
    <div className="market-narrative narrative-rich" aria-live="polite">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return block.level === 3 ? (
              <h4 key={index} className="narrative-heading">
                <Inlines items={block.inlines} />
              </h4>
            ) : (
              <h5 key={index} className="narrative-heading">
                <Inlines items={block.inlines} />
              </h5>
            );
          case 'list':
            return (
              <ul key={index} className="narrative-list">
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inlines items={item} />
                  </li>
                ))}
              </ul>
            );
          case 'rule':
            return <hr key={index} className="narrative-rule" />;
          default:
            return (
              <p key={index}>
                <Inlines items={block.inlines} />
              </p>
            );
        }
      })}
    </div>
  );
}
