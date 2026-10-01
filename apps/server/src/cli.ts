import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, passwordIssue } from './auth/password.ts';
import { destroyUserSessions } from './auth/sessions.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/client.ts';
import { seedMetricDefinitions } from './db/seed.ts';
import { organizations, users } from './db/schema.ts';
import { createOrganizationWithAdmin } from './routes/auth.ts';
import { FileBlobStore } from './storage/blobStore.ts';

const USAGE = `Buildr Force – Server-CLI
  pnpm --filter @buildr/server cli create-org   --name "Verein" --email admin@x.at --password '…' [--admin-name "Name"]
  pnpm --filter @buildr/server cli create-user  --org-id <uuid> --email a@x.at --password '…' --role admin|tester|viewer [--name "Name"]
  pnpm --filter @buildr/server cli reset-password --email a@x.at --password '…'
  pnpm --filter @buildr/server cli list-orgs`;

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    name: { type: 'string' },
    'admin-name': { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
    role: { type: 'string' },
    'org-id': { type: 'string' },
  },
});

const config = loadConfig();
const handle = await openDb(config);
const { db } = handle;
await seedMetricDefinitions(db);
let code = 0;
try {
  if (command === 'create-org') {
    if (!values.name || !values.email || !values.password)
      throw new Error('--name, --email, --password erforderlich');
    const ctx = { config, db, blobs: new FileBlobStore(config.BLOB_DIR), dbKind: handle.kind };
    const r = await createOrganizationWithAdmin(ctx, {
      organization: values.name,
      name: values['admin-name'] ?? 'Administrator',
      email: values.email,
      password: values.password,
    });
    console.log(`Organisation ${r.orgId} mit Admin ${values.email} angelegt.`);
  } else if (command === 'create-user') {
    const role = values.role;
    if (
      !values['org-id'] ||
      !values.email ||
      !values.password ||
      (role !== 'admin' && role !== 'tester' && role !== 'viewer')
    ) {
      throw new Error('--org-id, --email, --password, --role (admin|tester|viewer) erforderlich');
    }
    const issue = passwordIssue(values.password);
    if (issue) throw new Error(`Passwort ungeeignet: ${issue}`);
    await db.insert(users).values({
      id: randomUUID(),
      orgId: values['org-id'],
      email: values.email.toLowerCase(),
      name: values.name ?? values.email,
      passwordHash: await hashPassword(values.password, config.SCRYPT_LOG_N),
      role,
    });
    console.log(`Nutzer ${values.email} (${role}) angelegt.`);
  } else if (command === 'reset-password') {
    if (!values.email || !values.password) throw new Error('--email und --password erforderlich');
    const issue = passwordIssue(values.password);
    if (issue) throw new Error(`Passwort ungeeignet: ${issue}`);
    const [u] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${values.email.toLowerCase()}`);
    if (!u) throw new Error('Nutzer nicht gefunden');
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(values.password, config.SCRYPT_LOG_N) })
      .where(eq(users.id, u.id));
    await destroyUserSessions(db, u.id);
    console.log('Passwort gesetzt, Sitzungen beendet.');
  } else if (command === 'list-orgs') {
    for (const o of await db.select().from(organizations)) console.log(`${o.id}  ${o.name}`);
  } else {
    console.log(USAGE);
    code = command ? 1 : 0;
  }
} catch (e) {
  console.error((e as Error).message);
  code = 1;
} finally {
  await handle.close();
}
process.exit(code);
