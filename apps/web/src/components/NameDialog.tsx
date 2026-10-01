import { useState } from 'react';
import { useT } from '../i18n/hooks.ts';
import { Button, Field, Modal } from './ui.tsx';

/** Kleiner Dialog zum Benennen/Umbenennen (Kategorie, Gruppe, Tag …). */
export function NameDialog({
  title,
  label,
  initial = '',
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  onSave: (name: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0 && name.trim().length <= 120;
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok || busy) return;
          setBusy(true);
          try {
            await onSave(name.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={label} htmlFor="name-dialog">
          <input
            id="name-dialog"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            data-testid="name-dialog-input"
          />
        </Field>
        <div className="flex justify-end gap-3">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!ok || busy} data-testid="name-dialog-save">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Bestätigungsdialog für Löschungen. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-4">{text}</p>
      <div className="flex justify-end gap-3">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={() => void onConfirm()} data-testid="confirm-yes">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
