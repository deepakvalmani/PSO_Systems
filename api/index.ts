import { createApp } from '../server';

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
