import { createApp } from "./app.ts";

const app = createApp();

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8787);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`cite-audit listening on ${port}`);
}

export default app;
