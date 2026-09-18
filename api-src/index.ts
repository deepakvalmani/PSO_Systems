import { createApp } from '../app-server';
// Note: this file is compiled+bundled to ../api/index.js via `npm run build:api`.
// Vercel deploys the bundled CJS output directly — do not edit api/index.js by hand.

// Reused across warm invocations of the same serverless instance so we don't
// re-run initDb() (and reconnect to Mongo) on every single request.
let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = createApp();
  }
  const app = await appPromise;
  return (app as any)(req, res);
}
