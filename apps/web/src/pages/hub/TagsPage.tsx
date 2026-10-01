import type { TagDTO, TagTypeDTO } from '@buildr/shared';
import { useState } from 'react';
import { ConfirmDialog, NameDialog } from '../../components/NameDialog.tsx';
import { Banner, Button, Card, Chip } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { refMessage } from '../../hub/notify.ts';
import { refAdmin, type RefResult } from '../../hub/services.ts';
import { useT } from '../../i18n/hooks.ts';
import { uid } from '../../lib/uid.ts';
import { useRole } from '../../state/auth.ts';

type Dialog =
  | { kind: 'newType' }
  | { kind: 'renameType'; type: TagTypeDTO }
  | { kind: 'newTag'; type: TagTypeDTO }
  | { kind: 'renameTag'; tag: TagDTO }
  | { kind: 'deleteType'; type: TagTypeDTO }
  | { kind: 'deleteTag'; tag: TagDTO };

/** Tag-Typen (z. B. „Phase“) mit Tags (z. B. „Vorsaison“). Anlegen/Umbenennen: Admin + Tester; Löschen: Admin. */
export function TagsPage() {
  const { t } = useT();
  const role = useRole();
  const canEdit = role !== 'viewer';
  const canDelete = role === 'admin';
  const data = useRefData();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finish = (r: RefResult) => {
    const m = refMessage(r);
    setError(m ? t(m) : null);
    if (!m) setDialog(null);
  };

  return (
    <div className="grid gap-4">
      <Card
        title={t('tags.title')}
        actions={
          canEdit && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setDialog({ kind: 'newType' })}
              data-testid="tagtype-new"
            >
              + {t('tags.type.new')}
            </Button>
          )
        }
      >
        {error && <Banner tone="danger">{error}</Banner>}
        {data.loaded && data.tagTypes.length === 0 && <p className="text-muted">{t('tags.empty')}</p>}
        <div className="grid gap-4">
          {data.tagTypes.map((tt) => (
            <section
              key={tt.id}
              className="rounded-xl border border-line p-3"
              data-testid={`tagtype-${tt.name}`}
            >
              <header className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-lg font-semibold">{tt.name}</h3>
                {canEdit && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setDialog({ kind: 'newTag', type: tt })}
                      data-testid={`tag-new-${tt.name}`}
                    >
                      + {t('tags.tag.new')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: 'renameType', type: tt })}
                    >
                      {t('groups.rename')}
                    </Button>
                  </>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialog({ kind: 'deleteType', type: tt })}
                  >
                    {t('common.delete')}
                  </Button>
                )}
              </header>
              <div className="flex flex-wrap gap-2">
                {data.tags
                  .filter((g) => g.tagTypeId === tt.id)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1" data-testid={`tag-${g.name}`}>
                      <Chip tone="primary">{g.name}</Chip>
                      {canEdit && (
                        <button
                          type="button"
                          className="rounded px-1 text-muted hover:text-text"
                          aria-label={`${t('groups.rename')}: ${g.name}`}
                          onClick={() => setDialog({ kind: 'renameTag', tag: g })}
                        >
                          ✎
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="rounded px-1 text-muted hover:text-danger"
                          aria-label={`${t('common.delete')}: ${g.name}`}
                          onClick={() => setDialog({ kind: 'deleteTag', tag: g })}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      {dialog?.kind === 'newType' && (
        <NameDialog
          title={t('tags.type.new')}
          label={t('groups.name')}
          onClose={() => setDialog(null)}
          onSave={async (name) => finish(await refAdmin.saveTagType({ id: uid(), name }))}
        />
      )}
      {dialog?.kind === 'renameType' && (
        <NameDialog
          title={t('groups.rename')}
          label={t('groups.name')}
          initial={dialog.type.name}
          onClose={() => setDialog(null)}
          onSave={async (name) => finish(await refAdmin.saveTagType({ ...dialog.type, name }))}
        />
      )}
      {dialog?.kind === 'newTag' && (
        <NameDialog
          title={t('tags.tag.new')}
          label={t('groups.name')}
          onClose={() => setDialog(null)}
          onSave={async (name) =>
            finish(await refAdmin.saveTag({ id: uid(), tagTypeId: dialog.type.id, name }))
          }
        />
      )}
      {dialog?.kind === 'renameTag' && (
        <NameDialog
          title={t('groups.rename')}
          label={t('groups.name')}
          initial={dialog.tag.name}
          onClose={() => setDialog(null)}
          onSave={async (name) => finish(await refAdmin.saveTag({ ...dialog.tag, name }))}
        />
      )}
      {dialog?.kind === 'deleteType' && (
        <ConfirmDialog
          title={t('common.delete')}
          text={t('tags.delete.type', { name: dialog.type.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => finish(await refAdmin.deleteTagType(dialog.type.id))}
        />
      )}
      {dialog?.kind === 'deleteTag' && (
        <ConfirmDialog
          title={t('common.delete')}
          text={t('tags.delete.tag', { name: dialog.tag.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => finish(await refAdmin.deleteTag(dialog.tag.id))}
        />
      )}
    </div>
  );
}
