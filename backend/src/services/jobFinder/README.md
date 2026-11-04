# Job Hunter: live job search for a bench candidate

The Job Hunter page (`/recruiter-portal/job-hunter`) finds the newest jobs for one bench candidate. It reads each
posting and checks it against the candidate: the title, the skills the job description asks for, the industry and
the company. It replaces the JobSpy scraper: no Python, no scraping, and no made-up "fallback" jobs. If a site
doesn't answer, the page says so.

## How a search works

1. **What to look for** (`candidate.ts`, `profile.ts`)
   - Titles: the candidate's primary title, plus up to 2 "Primary" roles from their latest resume analysis.
     The recruiter can type other titles for one search.
   - Must-have skills: the technology named in the titles (e.g. Java for "Java Developer"), then the top key skills.
     Generic skills like Agile, Git and SQL are left out.
   - Industry: the domains in the resume analysis, or else worked out from the resume (employers like UnitedHealth
     or Wells Fargo, and words like HIPAA or EHR). The recruiter can pick one, or none.
   - Past clients: the companies in the candidate's work history.
2. **Where to look** (`engine.ts`, `sources/`)
   - **Career sites** (no keys needed): Greenhouse, Lever, Ashby, SmartRecruiters and Workday public job APIs. There
     is a default list of 28 companies (`watchlist.ts`). Recruiters add their end clients' career pages on the page,
     and `JOB_FINDER_WATCHLIST` replaces the default list for the whole deployment.
   - **Job portals** (optional keys): JSearch covers LinkedIn, Indeed, Dice, ZipRecruiter and Glassdoor through
     Google for Jobs. Adzuna is also optional. With a candidate industry, the first query includes it
     ("Java Developer healthcare").
3. **Read and check every posting** (`signals.ts`, `match.ts`)
   - **Relevance:** the title must be the candidate's kind of role. Leadership, sales, support and specialty roles
     are left out. The posting must ask for the must-have skills: at least 1 for a matching title, at least 2 for a
     plain "Software Engineer".
   - **Citizenship:** strict, negation-aware checks for "US citizens only", "USC/GC only", "U.S. person" (ITAR),
     "Citizenship: US Citizen" and visa lists. "Without regard to citizenship status" is not counted.
   - **Clearance:** checks for Secret, Top Secret, TS/SCI, polygraph, Public Trust and "able to obtain a clearance".
     The candidate's clearance level is compared with the level the job asks for.
   - **Bench-sales terms:** C2C vs W2-only, "no sponsorship", visa lists ("USC/GC/H4EAD only", "No H1B, OPT"),
     locals only, on-site, years of experience, rate and duration.
4. **Filter and order**
   - The time window is the last 24 hours by default; 3 days, 1 week and 1 month are options. Workday only gives a
     date, so a Workday job counts for its whole day (US time) and shows as "posted today" or "posted yesterday".
   - Jobs asking for citizenship or a clearance are hidden unless the candidate qualifies. Each filter can be
     switched off, and those jobs then show as "can't submit".
   - Results are newest first, with jobs in the candidate's industry first. Jobs the candidate can't be submitted to
     come last.
   - Hidden jobs are listed with the reason and a link, citizenship and clearance first.

Each job comes back with:

- a status: ready / check first / can't submit
- a 0-100 score
- blockers and warnings, with quotes from the posting
- the must-haves it asks for
- the industry and whether it matches the candidate
- a past-client flag
- the employment type
- apply links

## API

- `GET /api/jobs/finder-config`: the default career sites, which portal keys are set, and the industry list.
- `POST /api/jobs/find`: one search.

  Body:

  ```json
  {
    "candidateId": "uuid",
    "postedWithinDays": 1,
    "excludeCitizenship": true,
    "excludeClearance": true,
    "industryFirst": true,
    "contractOnly": false,
    "remoteOnly": false,
    "hideBlocked": false,
    "c2cOnly": true,
    "sortBy": "newest",
    "titles": ["Java Developer"],
    "industry": "auto",
    "careerSites": ["https://jobs.lever.co/company"],
    "includeDefaultSites": true
  }
  ```

  Only `candidateId` is required. `postedWithinDays` is 1, 3, 7 or 30. `sortBy` is `newest` or `best`. `industry` is
  `auto`, `none`, or an industry name.

## Settings (backend env, all optional)

| Variable | What it does |
|---|---|
| `JSEARCH_API_KEY` | Adds job portal results. The free plan is 200 requests a month, and a search uses 1–2. |
| `JSEARCH_PROVIDER` | `rapidapi` (default) or `openwebninja` (a key from openwebninja.com). |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adds Adzuna results. |
| `JOB_FINDER_WATCHLIST` | A JSON array of career page links that replaces the default list. |

`JOB_FINDER_WATCHLIST` example:

```
JOB_FINDER_WATCHLIST='["https://jobs.lever.co/acme", "https://acme.wd5.myworkdayjobs.com/External"]'
```

Career site downloads are cached for 10 minutes, so changing a filter or searching again is quick. Each request
times out after 15 seconds. Only known ATS hosts are read, and Workday must be on `*.myworkdayjobs.com`.

## Tests

```bash
cd backend && npm run test:job-finder
```

The suite runs 211 offline checks:

- posting reader, citizenship and clearance, visa lists
- skills, titles, relevance, industry, matching
- every source parser
- the full engine
- the DB candidate mapping
- career link checks
- posting dates
- the request cache

## Limits

- Company career sites mostly post full-time jobs; those are marked "check first" for vendors. Most C2C contract
  roles are on job portals, so set `JSEARCH_API_KEY` for those.
- A 24-hour window over career sites alone gives a few jobs per candidate per day. Use the longer windows or add
  your end clients' career pages.
- LinkedIn, Indeed and Dice are only searched through JSearch. Their sites forbid scraping, so this engine never
  scrapes them.
