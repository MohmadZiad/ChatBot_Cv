import type { FastifyInstance } from 'fastify';
import { healthRoute } from './misc.health.js';
import { jobsRoute } from './jobs.route.js';
import { analysesRoute } from './analyses.route.js';
import { cvRoute } from './cv.route.js';

export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoute, { prefix: '/api' });
  app.register(jobsRoute, { prefix: '/api/jobs' });
  app.register(analysesRoute, { prefix: '/api/analyses' });
  app.register(cvRoute, { prefix: '/api/cv' });
}
