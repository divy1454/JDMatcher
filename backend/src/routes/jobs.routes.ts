import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../middleware/authGuard.js';
import { deviceGuard } from '../middleware/deviceGuard.js';
import { depositGuard } from '../middleware/depositGuard.js';
import {
  scrapeJobsWithJobSpy,
  SUPPORTED_JOB_BOARDS,
  mixAndFilterJobs,
  enrichJobsWithCandidateMatch,
  type JobSearchParams,
} from '../services/jobSpyService.js';
import { db } from '../db/index.js';
import { matchedJds, candidates, resumeAnalyses } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { env } from '../env.js';
import {
  searchJobsForCandidate,
  toSearchCandidate,
  defaultWatchlist,
  companiesFromLinks,
  mergeWatchlists,
  careersPage,
  INDUSTRY_NAMES,
} from '../services/jobFinder/index.js';

// Job finder (career sites + optional portal APIs): one search for one bench candidate
const findJobsSchema = z.object({
  candidateId: z.string().uuid('Valid candidateId is required'),
  postedWithinDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)]).optional().default(1),
  excludeCitizenship: z.boolean().optional().default(true),
  excludeClearance: z.boolean().optional().default(true),
  industryFirst: z.boolean().optional().default(true),
  contractOnly: z.boolean().optional().default(false),
  remoteOnly: z.boolean().optional().default(false),
  hideBlocked: z.boolean().optional().default(false),
  c2cOnly: z.boolean().optional().default(true),
  sortBy: z.enum(['newest', 'best']).optional().default('newest'),
  titles: z.array(z.string().trim().min(2).max(80)).max(4).optional(),
  industry: z.string().trim().max(60).optional(),
  careerSites: z.array(z.string().trim().max(300)).max(60).optional(),
  includeDefaultSites: z.boolean().optional().default(true),
});

const jobFinderConfig = () => ({
  JSEARCH_API_KEY: env.JSEARCH_API_KEY || undefined,
  JSEARCH_PROVIDER: env.JSEARCH_PROVIDER || undefined,
  ADZUNA_APP_ID: env.ADZUNA_APP_ID || undefined,
  ADZUNA_APP_KEY: env.ADZUNA_APP_KEY || undefined,
});

const searchJobsSchema = z.object({
  searchTerm: z.string().min(1, 'Search term is required').max(150),
  location: z.string().max(100).optional().default(''),
  siteNames: z.array(z.string()).optional(),
  stickToSite: z.string().nullable().optional(), // 'all' or specific board e.g. 'linkedin'
  isRemote: z.boolean().optional().default(false),
  jobType: z.enum(['all', 'fulltime', 'parttime', 'contract', 'internship', 'temporary']).optional().default('all'),
  hoursOld: z.number().int().min(1).max(720).optional().default(24), // default strictly 24 hours
  resultsWanted: z.number().int().min(1).max(50).optional().default(20),
  country: z.string().max(50).optional().default('usa'), // default USA
  fetchDescription: z.boolean().optional().default(false),
  candidateId: z.string().uuid().optional(),
});

const searchByCandidateSchema = z.object({
  candidateId: z.string().uuid('Valid candidateId is required'),
  country: z.string().max(50).optional().default('usa'), // default USA
  location: z.string().max(100).optional(),
  stickToSite: z.string().nullable().optional(), // 'all' or specific board
  siteNames: z.array(z.string()).optional(),
  hoursOld: z.number().int().min(1).max(720).optional().default(24), // default strictly 24 hours
  resultsWanted: z.number().int().min(1).max(50).optional().default(25),
  jobType: z.enum(['all', 'fulltime', 'parttime', 'contract', 'internship', 'temporary']).optional().default('all'),
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
        defaultCountry: 'usa',
        defaultHoursOld: 24,
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
      const user = request.user!;
      const isMixed = !params.stickToSite || params.stickToSite.toLowerCase() === 'all';

      try {
        request.log.info({ params }, '[JobSpy] Initiating job search');
        let jobs = await scrapeJobsWithJobSpy(params);

        // If candidateId is provided, enrich jobs with candidate match score
        if (parseResult.data.candidateId) {
          const [candidate] = await db
            .select()
            .from(candidates)
            .where(
              and(
                eq(candidates.id, parseResult.data.candidateId),
                eq(candidates.organizationId, user.organizationId!)
              )
            )
            .limit(1);

          if (candidate) {
            const [analysis] = await db
              .select()
              .from(resumeAnalyses)
              .where(
                and(
                  eq(resumeAnalyses.candidateId, candidate.id),
                  eq(resumeAnalyses.organizationId, user.organizationId!)
                )
              )
              .orderBy(desc(resumeAnalyses.createdAt))
              .limit(1);

            jobs = enrichJobsWithCandidateMatch(jobs, candidate, analysis);
          }
        }

        return reply.send({
          success: true,
          query: {
            searchTerm: params.searchTerm,
            location: params.location,
            country: params.country || 'usa',
            hoursOld: params.hoursOld || 24,
            stickToSite: params.stickToSite || 'all',
            isMixed,
            resultsWanted: params.resultsWanted,
            candidateId: parseResult.data.candidateId || null,
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

  // POST /api/jobs/search-by-candidate - Automatic tailored job search based on candidate resume analysis
  fastify.post(
    '/search-by-candidate',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      preHandler: [authGuard, deviceGuard, depositGuard],
    },
    async (request, reply) => {
      const parseResult = searchByCandidateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          details: parseResult.error.issues,
        });
      }

      const { candidateId, country, location, stickToSite, siteNames, hoursOld, resultsWanted, jobType } = parseResult.data;
      const user = request.user!;

      // 1. Fetch Candidate
      const [candidate] = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, candidateId),
            eq(candidates.organizationId, user.organizationId!)
          )
        )
        .limit(1);

      if (!candidate || !candidate.isActive) {
        return reply.status(404).send({
          error: 'CANDIDATE_NOT_FOUND',
          message: 'Active bench candidate not found',
        });
      }

      // 2. Fetch Latest Resume Analysis (if analyzed previously)
      const [latestAnalysis] = await db
        .select()
        .from(resumeAnalyses)
        .where(
          and(
            eq(resumeAnalyses.candidateId, candidate.id),
            eq(resumeAnalyses.organizationId, user.organizationId!)
          )
        )
        .orderBy(desc(resumeAnalyses.createdAt))
        .limit(1);

      // 3. Derive optimal search terms based on Candidate's Resume Analysis
      let derivedRole = candidate.primaryTitle;
      if (latestAnalysis?.targetSeniority && !derivedRole.toLowerCase().includes(latestAnalysis.targetSeniority.toLowerCase())) {
        derivedRole = `${latestAnalysis.targetSeniority} ${derivedRole}`;
      }

      // Candidate's top skills
      const topSkills = (candidate.keySkills || []).slice(0, 3).join(' ');
      const searchRoleQuery = derivedRole || topSkills || 'Software Engineer';

      // Candidate work preference location
      const isRemoteCandidate = (candidate.workPreference || '').toLowerCase() === 'remote';
      const targetLocation = location || (isRemoteCandidate ? 'Remote' : 'United States');
      const targetCountry = country || 'usa';

      request.log.info({
        candidateId,
        candidateName: candidate.fullName,
        searchRoleQuery,
        targetLocation,
        targetCountry,
      }, '[JobSpy] Running candidate-tailored search');

      const searchParams: JobSearchParams = {
        searchTerm: searchRoleQuery,
        location: targetLocation,
        country: targetCountry,
        hoursOld: hoursOld || 24, // strictly 24 hours fresh
        stickToSite: stickToSite || 'all',
        siteNames: siteNames && siteNames.length > 0 ? siteNames : undefined,
        isRemote: isRemoteCandidate,
        jobType: jobType === 'all' ? undefined : jobType,
        resultsWanted: resultsWanted || 25,
      };

      const rawJobs = await scrapeJobsWithJobSpy(searchParams);

      // 4. Compute Match Score and Verdict for every job against candidate's profile
      const scoredJobs = enrichJobsWithCandidateMatch(rawJobs, candidate, latestAnalysis);

      // Sort by match score descending so top matches appear first
      scoredJobs.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      return reply.send({
        success: true,
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          primaryTitle: candidate.primaryTitle,
          keySkills: candidate.keySkills || [],
          yearsOfExperience: candidate.yearsOfExperience,
          workPreference: candidate.workPreference,
          coreSpecialization: latestAnalysis?.coreSpecialization || null,
          targetSeniority: latestAnalysis?.targetSeniority || null,
        },
        query: {
          searchTerm: searchRoleQuery,
          location: targetLocation,
          country: targetCountry,
          hoursOld: searchParams.hoursOld,
          stickToSite: stickToSite || 'all',
          isFresh24hOnly: true,
          noReposts: true,
        },
        total: scoredJobs.length,
        jobs: scoredJobs,
      });
    }
  );

  // GET /api/jobs/finder-config - What the job finder searches (default career sites, portal keys on/off)
  fastify.get(
    '/finder-config',
    {
      preHandler: [authGuard],
    },
    async (request, reply) => {
      const config = jobFinderConfig();
      return reply.send({
        portals: { jsearch: Boolean(config.JSEARCH_API_KEY), adzuna: Boolean(config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY) },
        defaultSites: defaultWatchlist(env.JOB_FINDER_WATCHLIST).map((c) => ({ name: c.name, ats: c.ats, url: careersPage(c), industry: c.industry || null })),
        industries: INDUSTRY_NAMES,
        postedWithinOptions: [1, 3, 7, 30],
      });
    }
  );

  // POST /api/jobs/find - Newest matching jobs for one bench candidate (career sites + portals with keys)
  fastify.post(
    '/find',
    {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
        },
      },
      preHandler: [authGuard, deviceGuard, depositGuard],
    },
    async (request, reply) => {
      const parseResult = findJobsSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          details: parseResult.error.issues,
        });
      }
      const body = parseResult.data;
      const user = request.user!;

      const [candidate] = await db
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, body.candidateId), eq(candidates.organizationId, user.organizationId!)))
        .limit(1);
      if (!candidate || !candidate.isActive) {
        return reply.status(404).send({
          error: 'CANDIDATE_NOT_FOUND',
          message: 'Active bench candidate not found',
        });
      }

      const [latestAnalysis] = await db
        .select({ industriesAndDomains: resumeAnalyses.industriesAndDomains, roleTiers: resumeAnalyses.roleTiers })
        .from(resumeAnalyses)
        .where(and(eq(resumeAnalyses.candidateId, candidate.id), eq(resumeAnalyses.organizationId, user.organizationId!)))
        .orderBy(desc(resumeAnalyses.createdAt))
        .limit(1);

      const { candidate: searchCandidate, industrySource } = toSearchCandidate(candidate, latestAnalysis || null, {
        titles: body.titles,
        industry: body.industry,
        c2cOnly: body.c2cOnly,
      });
      if (!searchCandidate.titles.length) {
        return reply.status(400).send({ error: 'NO_TITLE', message: 'Candidate has no title to search for' });
      }

      const own = companiesFromLinks(body.careerSites || []);
      const watchlist = mergeWatchlists(body.includeDefaultSites ? defaultWatchlist(env.JOB_FINDER_WATCHLIST) : [], own.companies);

      try {
        const result = await searchJobsForCandidate(
          searchCandidate,
          watchlist,
          {
            postedWithinDays: body.postedWithinDays,
            excludeCitizenship: body.excludeCitizenship,
            excludeClearance: body.excludeClearance,
            industryFirst: body.industryFirst,
            contractOnly: body.contractOnly,
            remoteOnly: body.remoteOnly,
            hideBlocked: body.hideBlocked,
            sortBy: body.sortBy,
          },
          jobFinderConfig()
        );
        request.log.info(
          { candidateId: candidate.id, total: result.total, tookMs: result.tookMs, sources: result.sources.map((s) => `${s.source}:${s.found}${s.error ? '!' : ''}`) },
          '[JobFinder] search done'
        );
        return reply.send({
          success: true,
          candidateId: candidate.id,
          industrySource,
          rejectedCareerSites: own.rejected,
          ...result,
        });
      } catch (err: any) {
        request.log.error(err, '[JobFinder] search failed');
        return reply.status(500).send({
          error: 'JOB_FINDER_ERROR',
          message: err?.message || 'Job search failed',
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
