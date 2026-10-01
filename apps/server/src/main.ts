import { createServer } from './server.ts';

const server = await createServer();
const { app, config, handle } = server;

const shutdown = async (sig: string) => {
  app.log.info({ sig }, 'shutting down');
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info(`Buildr Force API (${handle.kind}) auf http://${config.HOST}:${config.PORT}`);
