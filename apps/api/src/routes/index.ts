import type { FastifyInstance } from "fastify";
import { healthRoute } from "./misc.health.js";
import { jobsRoute } from "./jobs.route.js";
import { analysesRoute } from "./analyses.route.js";
import { cvRoute } from "./cv.route.js";

export function registerRoutes(app: FastifyInstance) {
  // Health check route: GET /api
  app.register(healthRoute, { prefix: "/api" });

  // Jobs routes (create job, list, suggestFromJD, etc.)
  app.register(jobsRoute, { prefix: "/api/jobs" });

  // Analyses routes (run analysis, get results, etc.)
  app.register(analysesRoute, { prefix: "/api/analyses" });

  // CV routes (upload CVs, list, parse)
  app.register(cvRoute, { prefix: "/api/cv" });
}
