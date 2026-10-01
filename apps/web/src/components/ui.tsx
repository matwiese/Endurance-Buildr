import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: BtnProps) {
  const v =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'danger'
        ? 'btn-danger'
        : variant === 'ghost'
          ? 'btn-ghost'
          : '';
  const s = size === 'lg' ? 'btn-lg' : size === 'sm' ? 'btn-sm' : '';
  return <button type={type} className={`btn ${v} ${s} ${className}`} {...rest} />;
}

export function Card({
  title,
  children,
  className = '',
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="mb-3">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        className="h-6 w-6 accent-[var(--primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Chip({
  children,
  tone = 'default',
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'primary';
  title?: string;
}) {
  const c =
    tone === 'ok'
      ? 'border-ok text-ok'
      : tone === 'warn'
        ? 'border-warn text-warn'
        : tone === 'danger'
          ? 'border-danger text-danger'
          : tone === 'primary'
            ? 'border-primary text-primary'
            : '';
  return (
    <span className={`chip ${c}`} title={title}>
      {children}
    </span>
  );
}

export function Banner({
  tone = 'info',
  children,
  role,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  children: ReactNode;
  role?: string;
}) {
  const c =
    tone === 'warn'
      ? 'border-warn bg-warn/10'
      : tone === 'danger'
        ? 'border-danger bg-danger/10'
        : tone === 'ok'
          ? 'border-ok bg-ok/10'
          : 'border-line bg-surface2';
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={`mb-3 rounded-xl border px-4 py-3 text-sm ${c}`}
    >
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`card max-h-[90vh] overflow-auto ${wide ? 'w-full max-w-4xl' : 'w-full max-w-xl'}`}
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="×">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
      {label}
    </span>
  );
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'off' }) {
  const c =
    tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'danger' ? 'bg-danger' : 'bg-muted';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c}`} aria-hidden />;
}
