import { buildServer } from './server.js';
async function main() {
    const { app, ctx } = await buildServer();
    try {
        await app.listen({ port: ctx.config.port, host: '0.0.0.0' });
        app.log.info({ embeddings: ctx.embeddingsEnabled }, `agents-overflow api listening on :${ctx.config.port}`);
    }
    catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}
void main();
//# sourceMappingURL=index.js.map