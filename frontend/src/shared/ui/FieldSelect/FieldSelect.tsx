import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiChevronDown } from 'react-icons/fi';

import styles from './FieldSelect.module.scss';

export interface FieldSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface PopupPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

interface FieldSelectProps {
  label: string;
  options: readonly FieldSelectOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  error?: string;
  hint?: string;
  name?: string;
  placeholder?: string;
}

const POPUP_GAP = 7;
const POPUP_MAX_HEIGHT = 240;
const VIEWPORT_GAP = 12;

export const FieldSelect = forwardRef<HTMLButtonElement, FieldSelectProps>(function FieldSelect(
  {
    label,
    options,
    value,
    onChange,
    onBlur,
    className = '',
    disabled = false,
    error,
    hint,
    name,
    placeholder = 'Выберите значение',
  },
  forwardedRef,
) {
  const generatedId = useId();
  const controlId = `${generatedId}-control`;
  const labelId = `${generatedId}-label`;
  const listboxId = `${generatedId}-listbox`;
  const messageId = `${generatedId}-message`;
  const fieldRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];

  useImperativeHandle(forwardedRef, () => controlRef.current as HTMLButtonElement);

  const optionId = useCallback((index: number) => `${generatedId}-option-${index}`, [generatedId]);
  const enabledIndexes = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const updatePopupPosition = useCallback(() => {
    const control = controlRef.current;
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const estimatedHeight = Math.min(POPUP_MAX_HEIGHT, options.length * 44 + 12);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
    const spaceAbove = rect.top - VIEWPORT_GAP;
    const placeAbove = spaceBelow < Math.min(estimatedHeight, 150) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(80, Math.min(POPUP_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));
    const top = placeAbove
      ? Math.max(VIEWPORT_GAP, rect.top - POPUP_GAP - Math.min(estimatedHeight, maxHeight))
      : rect.bottom + POPUP_GAP;
    const width = rect.width || 240;
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.left),
      Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
    );
    setPopupPosition({ top, left, width, maxHeight, placement: placeAbove ? 'top' : 'bottom' });
  }, [options.length]);

  const close = useCallback((touch = false) => {
    setOpen(false);
    if (touch) onBlur?.();
  }, [onBlur]);

  const show = useCallback(() => {
    if (disabled || enabledIndexes.length === 0) return;
    setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : enabledIndexes[0] ?? -1);
    updatePopupPosition();
    setOpen(true);
  }, [disabled, enabledIndexes, options, selectedIndex, updatePopupPosition]);

  const choose = useCallback((index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
    controlRef.current?.focus();
  }, [close, onChange, options]);

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => updatePopupPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!fieldRef.current?.contains(target) && !popupRef.current?.contains(target)) close(true);
    };
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [close, open, updatePopupPosition]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open, optionId]);

  const move = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? (direction === 1 ? 0 : enabledIndexes.length - 1)
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition] ?? -1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(enabledIndexes[0] ?? -1);
      return;
    }
    if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(enabledIndexes.at(-1) ?? -1);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(activeIndex);
      else show();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const query = event.key.toLocaleLowerCase('ru-RU');
      const start = Math.max(0, enabledIndexes.indexOf(activeIndex) + 1);
      const ordered = [...enabledIndexes.slice(start), ...enabledIndexes.slice(0, start)];
      const match = ordered.find((index) => options[index]?.label.toLocaleLowerCase('ru-RU').startsWith(query));
      if (match !== undefined) {
        event.preventDefault();
        if (!open) show();
        setActiveIndex(match);
      }
    }
  };

  const popupStyle = popupPosition ? ({
    top: popupPosition.top,
    left: popupPosition.left,
    width: popupPosition.width,
    maxHeight: popupPosition.maxHeight,
  } satisfies CSSProperties) : undefined;

  return (
    <div ref={fieldRef} className={`${styles.field} ${className}`}>
      <span id={labelId} className={styles.label}>{label}</span>
      <button
        ref={controlRef}
        id={controlId}
        type="button"
        role="combobox"
        name={name}
        className={`${styles.control} ${open ? styles.open : ''} ${error ? styles.invalid : ''}`}
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (!popupRef.current?.contains(event.relatedTarget as Node)) {
            if (open && event.relatedTarget) close();
            onBlur?.();
          }
        }}
      >
        <span className={selectedOption ? styles.value : styles.placeholder}>
          {selectedOption?.label ?? placeholder}
        </span>
        <FiChevronDown className={styles.chevron} aria-hidden="true" />
      </button>

      {(error || hint) && (
        <span id={messageId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </span>
      )}

      {open && popupPosition && createPortal(
        <ul
          ref={popupRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className={`${styles.popup} ${styles[popupPosition.placement]}`}
          style={popupStyle}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              className={`${styles.option} ${index === activeIndex ? styles.activeOption : ''} ${option.value === value ? styles.selectedOption : ''} ${option.disabled ? styles.disabledOption : ''}`}
              onPointerDown={(event: ReactPointerEvent) => event.preventDefault()}
              onPointerMove={() => !option.disabled && setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <FiCheck aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
});
