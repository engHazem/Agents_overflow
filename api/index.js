import { buildServer } from '../apps/api/dist/server.js';

let app;

export default async function (req, res) {
  if (!app) {
    const { app: fastifyApp } = await buildServer();
    app = fastifyApp;
    await app.ready();
  }
  app.server.emit('request', req, res);
}
