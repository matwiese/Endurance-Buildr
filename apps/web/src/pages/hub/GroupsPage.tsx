import type { CategoryDTO, GroupDTO } from '@buildr/shared';
import { useState } from 'react';
import { ConfirmDialog, NameDialog } from '../../components/NameDialog.tsx';
import { Banner, Button, Card } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { refMessage } from '../../hub/notify.ts';
import { refAdmin, type RefResult } from '../../hub/services.ts';
import { useT } from '../../i18n/hooks.ts';
import { uid } from '../../lib/uid.ts';
import { useRole } from '../../state/auth.ts';

type Dialog =
  | { kind: 'newCategory' }
  | { kind: 'renameCategory'; cat: CategoryDTO }
  | { kind: 'newGroup'; cat: CategoryDTO }
  | { kind: 'renameGroup'; group: GroupDTO }
  | { kind: 'deleteCategory'; cat: CategoryDTO }
  | { kind: 'deleteGroup'; group: GroupDTO };

export function GroupsPage() {
  const { t } = useT();
  const admin = useRole() === 'admin';
  const data = useRefData();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = (groupId: string) => data.profiles.filter((p) => p.groupIds.includes(groupId)).length;
  const finish = (r: RefResult) => {
    const m = refMessage(r);
    setError(m ? t(m) : null);
    if (!m) setDialog(null);
  };

  return (
    <div className="grid gap-4">
      <Card
        title={t('groups.title')}
        actions={
          admin && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setDialog({ kind: 'newCategory' })}
              data-testid="category-new"
            >
              + {t('groups.category.new')}
            </Button>
          )
        }
      >
        {!admin && <Banner>{t('groups.adminOnly')}</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}
        {data.loaded && data.categories.length === 0 && <p className="text-muted">{t('groups.empty')}</p>}
        <div className="grid gap-4">
          {data.categories.map((cat) => (
            <section
              key={cat.id}
              className="rounded-xl border border-line p-3"
              data-testid={`category-${cat.name}`}
            >
              <header className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-lg font-semibold">{cat.name}</h3>
                {admin && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setDialog({ kind: 'newGroup', cat })}
                      data-testid={`group-new-${cat.name}`}
                    >
                      + {t('groups.group.new')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: 'renameCategory', cat })}
                    >
                      {t('groups.rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: 'deleteCategory', cat })}
                    >
                      {t('common.delete')}
                    </Button>
                  </>
                )}
              </header>
              <ul className="grid gap-1">
                {data.groups
                  .filter((g) => g.categoryId === cat.id)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g) => (
                    <li
                      key={g.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface2"
                      data-testid={`group-${g.name}`}
                    >
                      <span className="mr-auto font-medium">{g.name}</span>
                      <span className="text-sm text-muted">{t('groups.members', { n: count(g.id) })}</span>
                      {admin && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'renameGroup', group: g })}
                          >
                            {t('groups.rename')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'deleteGroup', group: g })}
                          >
                            {t('common.delete')}
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      {dialog?.kind === 'newCategory' && (
        <NameDialog
          title={t('groups.category.new')}
          label={t('groups.name')}
          onClose={() => setDialog(null)}
          onSave={async (name) => finish(await refAdmin.saveCategory({ id: uid(), name }))}
        />
      )}
      {dialog?.kind === 'renameCategory' && (
        <NameDialog
          title={t('groups.rename')}
          label={t('groups.name')}
          initial={dialog.cat.name}
          onClose={() => setDialog(null)}
          onSave={async (name) => finish(await refAdmin.saveCategory({ ...dialog.cat, name }))}
        />
      )}
      {dialog?.kind === 'newGroup' && (
        <NameDialog
          title={t('groups.group.new')}
          label={t('groups.name')}
          onClose={() => setDialog(null)}
          onSave={async (name) =>
            finish(await refAdmin.saveGroup({ id: uid(), categoryId: dialog.cat.id, name }))
          }
        />
      )}
      {dialog?.kind === 'renameGroup' && (
        <NameDialog
          title={t('groups.rename')}
          label={t('groups.name')}
          initial={dialog.group.name}
          onClose={() => setDialog(null)}
          onSave={async (name) => finish(await refAdmin.saveGroup({ ...dialog.group, name }))}
        />
      )}
      {dialog?.kind === 'deleteCategory' && (
        <ConfirmDialog
          title={t('common.delete')}
          text={t('groups.delete.category', { name: dialog.cat.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => finish(await refAdmin.deleteCategory(dialog.cat.id))}
        />
      )}
      {dialog?.kind === 'deleteGroup' && (
        <ConfirmDialog
          title={t('common.delete')}
          text={t('groups.delete.group', { name: dialog.group.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => finish(await refAdmin.deleteGroup(dialog.group.id))}
        />
      )}
    </div>
  );
}
