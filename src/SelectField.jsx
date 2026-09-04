import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SelectField({ value, onChange, options, disabled, className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const [menuBox, setMenuBox] = useState(null);

  const selected = options.find((option) => String(option.value) === String(value)) || options[0];

  const placeMenu = () => {
    const trigger = wrapRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const maxHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const height = Math.max(96, Math.min(maxHeight, openUp ? spaceAbove : spaceBelow));
    const width = Math.min(window.innerWidth - 16, Math.max(rect.width, 280));
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 8 - width);
    setMenuBox({
      left,
      width,
      maxHeight: height,
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
  }, [open, options]);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event) => {
      if (wrapRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onDismiss = () => setOpen(false);

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onDismiss, true);

    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [open]);

  return (
    <div className={`select-field ${className} ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`.trim()} ref={wrapRef}>
      <button
        type="button"
        className="select-trigger interactive"
        disabled={disabled}
        title={selected?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((current) => !current); }}
      >
        <span className="select-value">{selected?.label}</span>
      </button>
      {open && menuBox && createPortal(
        <ul
          ref={menuRef}
          className="select-menu"
          role="listbox"
          style={{
            left: menuBox.left,
            width: menuBox.width,
            maxHeight: menuBox.maxHeight,
            top: menuBox.top,
            bottom: menuBox.bottom
          }}
        >
          {options.map((option) => (
            <li key={String(option.value)}>
              <button
                type="button"
                role="option"
                aria-selected={String(option.value) === String(value)}
                className={`select-option ${String(option.value) === String(value) ? 'active' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
