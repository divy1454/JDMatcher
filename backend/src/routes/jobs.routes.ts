import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../middleware/authGuard.js';
import { deviceGuard } from '../middleware/deviceGuard.js';
import { depositGuard } from '../middleware/depositGuard.js';
import {
  scrapeJobsWithJobSpy,
  SUPPORTED_JOB_BOARDS,
  mixAndFilterJobs,
  type JobSearchParams,
} from '../services/jobSpyService.js';
import { db } from '../db/index.js';
import { matchedJds, candidates } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const searchJobsSchema = z.object({
  searchTerm: z.string().min(1, 'Search term is required').max(150),
  location: z.string().max(100).optional().default(''),
  siteNames: z.array(z.string()).optional(),
  stickToSite: z.string().nullable().optional(), // 'all' or specific board e.g. 'linkedin'
  isRemote: z.boolean().optional().default(false),
  jobType: z.enum(['all', 'fulltime', 'parttime', 'contract', 'internship', 'temporary']).optional().default('all'),
  hoursOld: z.number().int().min(1).max(720).optional(),
  resultsWanted: z.number().int().min(1).max(50).optional().default(20),
  country: z.string().max(50).optional().default('usa'),
  fetchDescription: z.boolean().optional().default(false),
});

const saveMatchedJobSchema = z.object({
  candidateId: z.string().uuid(),
  jobTitle: z.string().min(1).max(255),
  companyOrClient: z.string().max(255).optional().default('Direct Client'),
  jobUrl: z.string().max(2000).optional(),
  rawJdText: z.string().max(30000).optional().default(''),
  verdict: z.enum(['APPLY', 'SKIP', 'PENDING']).default('APPLY'),
  matchScore: z.number().int().min(0).max(100).default(85),
  matchReasoning: z.string().max(5000).optional().default('Saved from JobSpy multi-board search'),
});

export const jobsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/jobs/boards - Return supported job boards
  fastify.get(
    '/boards',
    {
      preHandler: [authGuard],
    },
    async (request, reply) => {
      return reply.send({
        boards: SUPPORTED_JOB_BOARDS,
        total: SUPPORTED_JOB_BOARDS.length,
        defaultMixing: 'mixed_round_robin',
      });
    }
  );

  // POST /api/jobs/search - Search across job boards with mixed or stick-to-board mode
  fastify.post(
    '/search',
    {
      config: {
        rateLimit: {
          max: 40,
          timeWindow: '1 minute',
        },
      },
      preHandler: [authGuard, deviceGuard, depositGuard],
    },
    async (request, reply) => {
      const parseResult = searchJobsSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          details: parseResult.error.issues,
        });
      }

      const params: JobSearchParams = parseResult.data;
      const isMixed = !params.stickToSite || params.stickToSite.toLowerCase() === 'all';

      try {
        request.log.info({ params }, '[JobSpy] Initiating job search');
        const jobs = await scrapeJobsWithJobSpy(params);

        return reply.send({
          success: true,
          query: {
            searchTerm: params.searchTerm,
            location: params.location,
            stickToSite: params.stickToSite || 'all',
            isMixed,
            resultsWanted: params.resultsWanted,
          },
          total: jobs.length,
          jobs,
        });
      } catch (err: any) {
        request.log.error(err, '[JobSpy] Job search failed');
        return reply.status(500).send({
          error: 'SCRAPE_ERROR',
          message: err.message || 'Failed to aggregate jobs from job boards',
        });
      }
    }
  );

  // POST /api/jobs/save-matched - Save scraped job directly to matched JDs
  fastify.post(
    '/save-matched',
    {
      preHandler: [authGuard, deviceGuard, depositGuard],
    },
    async (request, reply) => {
      const parseResult = saveMatchedJobSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          details: parseResult.error.issues,
        });
      }

      const data = parseResult.data;
      const user = request.user!;

      // Validate candidate belongs to organization
      const [candidate] = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, data.candidateId),
            eq(candidates.organizationId, user.organizationId!)
          )
        )
        .limit(1);

      if (!candidate) {
        return reply.status(404).send({
          error: 'CANDIDATE_NOT_FOUND',
          message: 'Selected candidate does not exist in your organization',
        });
      }

      const [newMatchedJd] = await db
        .insert(matchedJds)
        .values({
          organizationId: user.organizationId!,
          recruiterId: user.id,
          candidateId: candidate.id,
          jobTitle: data.jobTitle,
          companyOrClient: data.companyOrClient,
          jobUrl: data.jobUrl || null,
          rawJdText: data.rawJdText,
          verdict: data.verdict,
          matchScore: data.matchScore,
          matchReasoning: data.matchReasoning,
        })
        .returning();

      return reply.send({
        success: true,
        message: 'Job successfully saved to Matched JDs',
        matchedJd: newMatchedJd,
      });
    }
  );
};
