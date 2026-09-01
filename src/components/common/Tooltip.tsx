import React, { type ReactElement } from 'react';

type TooltipAlign = 'start' | 'center' | 'end';

type TooltipProps = {
  label: string;
  description?: string;
  align?: TooltipAlign;
  children: ReactElement<{ 'aria-label'?: string }>;
};

export function Tooltip({ label, description, align = 'center', children }: TooltipProps) {
  const ariaLabel = children.props['aria-label'] ?? (description ? `${label}. ${description}` : label);

  return (
    <span className={`ui-tooltip ui-tooltip-align-${align}`}>
      {React.cloneElement(children, { 'aria-label': ariaLabel })}
      <span className="ui-tooltip-bubble" role="tooltip">
        <span className="ui-tooltip-label">{label}</span>
        {description ? <span className="ui-tooltip-desc">{description}</span> : null}
      </span>
    </span>
  );
}
