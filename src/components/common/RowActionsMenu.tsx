import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export type RowMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  isDanger?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
};

export function useRowActionsMenu() {
  const [openId, setOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpenId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openId]);

  const close = () => setOpenId(null);

  const run = (event: React.SyntheticEvent, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    close();
    action();
  };

  return { openId, setOpenId, menuRef, dropdownRef, run, close };
}

export type RowActionsMenuState = ReturnType<typeof useRowActionsMenu>;

export type RowActionsMenuProps = {
  id: string;
  ariaLabel?: string;
  title?: string;
  items: RowMenuItem[];
  menuState?: RowActionsMenuState;
  openId?: string | null;
  setOpenId?: React.Dispatch<React.SetStateAction<string | null>>;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  dropdownRef?: React.RefObject<HTMLDivElement | null>;
  run?: (event: React.SyntheticEvent, action: () => void) => void;
  iconSize?: number;
  className?: string;
};

export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({
  id,
  ariaLabel = 'Ações',
  title = 'Ações',
  items,
  menuState,
  openId: propOpenId,
  setOpenId: propSetOpenId,
  menuRef: propMenuRef,
  dropdownRef: propDropdownRef,
  run: propRun,
  iconSize = 15,
  className = '',
}) => {
  const openId = menuState ? menuState.openId : (propOpenId ?? null);
  const setOpenId = menuState ? menuState.setOpenId : propSetOpenId;
  const menuRef = menuState ? menuState.menuRef : propMenuRef;
  const dropdownRef = menuState ? menuState.dropdownRef : propDropdownRef;
  const run = menuState ? menuState.run : propRun;

  const isOpen = openId === id;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      setCoords(null);
      return;
    }

    const place = () => {
      const button = buttonRef.current;
      if (!button || button.offsetParent === null) {
        setCoords(null);
        return;
      }

      const rect = button.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setCoords(null);
        return;
      }

      const menuHeight = dropdownRef?.current?.offsetHeight ?? 0;
      const menuWidth = dropdownRef?.current?.offsetWidth ?? 196;
      const gap = 4;

      let top = rect.bottom + gap;
      if (menuHeight && top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - menuHeight);
      }

      let right = window.innerWidth - rect.right;
      right = Math.max(8, right);
      if (window.innerWidth - right < menuWidth + 8) {
        right = Math.max(8, window.innerWidth - menuWidth - 8);
      }

      setCoords({ top, right });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [dropdownRef, isOpen, items]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (setOpenId) {
      setOpenId((prev) => (prev === id ? null : id));
    }
  };

  const handleItemClick = (e: React.MouseEvent, onSelect: () => void) => {
    if (run) {
      run(e, onSelect);
    } else {
      e.preventDefault();
      e.stopPropagation();
      if (setOpenId) setOpenId(null);
      onSelect();
    }
  };

  return (
    <div
      className={`table-actions-menu ${className}`.trim()}
      ref={isOpen ? menuRef : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        ref={buttonRef}
        className="btn-table-icon"
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <MoreVertical size={iconSize} />
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={dropdownRef}
              className="table-actions-dropdown is-portal"
              role="menu"
              style={{
                top: coords?.top ?? 0,
                right: coords?.right ?? 8,
                visibility: coords ? 'visible' : 'hidden',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item) => (
                <React.Fragment key={item.id}>
                  {item.dividerBefore ? <div className="table-actions-menu-divider" /> : null}
                  <button
                    type="button"
                    className={`table-actions-menu-item${item.isDanger ? ' is-danger' : ''}`}
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={(e) => handleItemClick(e, item.onSelect)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
