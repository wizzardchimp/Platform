import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';
import type { StationSearchResult, WidgetData } from '@platform/shared';
import { getWidget } from './query/widget';
import { getApproaching, getDepartures, getService, NotFoundError, type Ctx } from './query/board';

const crsSchema = z.string().length(3).transform((s) => s.toUpperCase());

export function buildServer(ctx: Ctx, opts: { source: string; clock?: () => number }) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const now = opts.clock ?? Date.now;
  // Public read-only data; lets the web build and dev tools call the API.
  void app.register(cors, { origin: true, methods: ['GET'] });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Bad request', issues: err.issues });
    app.log.error(err);
    return reply.code(err.statusCode ?? 500).send({ error: 'Internal error' });
  });

  app.get('/health', async () => ({
    ok: true,
    source: opts.source,
    services: ctx.store.size,
    messages: ctx.store.stats.messages,
    orphanForecasts: ctx.store.stats.orphanForecasts,
    lastMessageAgeSec: ctx.store.stats.lastMessageAt
      ? Math.round((now() - ctx.store.stats.lastMessageAt) / 1000)
      : null,
  }));

  app.get('/v1/stations', async (req): Promise<StationSearchResult[]> => {
    const { q } = z.object({ q: z.string().min(1) }).parse(req.query);
    return ctx.ref.search(q).map((s) => ({ crs: s.crs, name: s.name }));
  });

  app.get('/v1/stations/:crs/departures', async (req) => {
    const { crs } = z.object({ crs: crsSchema }).parse(req.params);
    const q = z
      .object({
        to: crsSchema.optional(),
        limit: z.coerce.number().int().min(1).max(30).default(8),
        window: z.coerce.number().int().min(5).max(480).default(120),
      })
      .parse(req.query);
    return getDepartures(ctx, crs, { to: q.to, limit: q.limit, windowMin: q.window, now: now() });
  });

  app.get('/v1/stations/:crs/approaching', async (req) => {
    const { crs } = z.object({ crs: crsSchema }).parse(req.params);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }).parse(req.query);
    return getApproaching(ctx, crs, { limit, now: now() });
  });

  app.get('/v1/widget/:from/:to', async (req): Promise<WidgetData> => {
    const { from, to } = z.object({ from: crsSchema, to: crsSchema }).parse(req.params);
    return getWidget(ctx, from, to, now());
  });

  app.get('/v1/services/:rid', async (req) => {
    const { rid } = z.object({ rid: z.string().min(5).max(40) }).parse(req.params);
    return getService(ctx, rid, now());
  });

  return app;
}
