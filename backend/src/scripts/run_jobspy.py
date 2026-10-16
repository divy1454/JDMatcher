#!/usr/bin/env python3
"""
JobSpy Runner Script for JDMatcher Enterprise
Integrates JobSpy scraper library with Fastify backend.
Can import from installed `python-jobspy` or cloned `JobSpy` repo.
"""

import sys
import os
import json
import argparse
from pathlib import Path

# Add cloned JobSpy repo to path if present
current_dir = Path(__file__).resolve().parent
repo_jobspy = current_dir.parent.parent.parent / "JobSpy"
if repo_jobspy.exists() and str(repo_jobspy) not in sys.path:
    sys.path.insert(0, str(repo_jobspy))

try:
    from jobspy import scrape_jobs
except ImportError:
    try:
        from jobspy.jobspy import scrape_jobs
    except ImportError as e:
        print(json.dumps({"error": "JOBSPY_NOT_INSTALLED", "message": str(e)}))
        sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Run JobSpy scraper")
    parser.add_argument("--search-term", type=str, default="Software Engineer")
    parser.add_argument("--location", type=str, default="")
    parser.add_argument("--site-names", type=str, default="linkedin,indeed,zip_recruiter,glassdoor")
    parser.add_argument("--stick-to-site", type=str, default=None)
    parser.add_argument("--results-wanted", type=int, default=20)
    parser.add_argument("--hours-old", type=int, default=None)
    parser.add_argument("--is-remote", action="store_true", default=False)
    parser.add_argument("--job-type", type=str, default=None)
    parser.add_argument("--country", type=str, default="usa")
    parser.add_argument("--fetch-description", action="store_true", default=False)
    return parser.parse_args()


def main():
    args = parse_args()

    # Determine site list based on stick_to_site or site_names
    if args.stick_to_site and args.stick_to_site.lower() != "all":
        site_name = [args.stick_to_site.lower().strip()]
    else:
        site_name = [s.strip().lower() for s in args.site_names.split(",") if s.strip()]

    # Normalize supported site names in JobSpy
    valid_sites = {"linkedin", "indeed", "zip_recruiter", "glassdoor", "google", "bayt", "bdjobs", "naukri", "hellowork"}
    filtered_sites = [s for s in site_name if s in valid_sites]
    if not filtered_sites:
        filtered_sites = ["linkedin", "indeed", "zip_recruiter", "glassdoor"]

    try:
        kwargs = {
            "site_name": filtered_sites,
            "search_term": args.search_term,
            "location": args.location if args.location else None,
            "results_wanted": max(1, min(args.results_wanted, 50)),
            "country_indeed": args.country,
            "fetch_description": args.fetch_description,
        }

        if args.hours_old:
            kwargs["hours_old"] = args.hours_old
        if args.is_remote:
            kwargs["is_remote"] = True
        if args.job_type and args.job_type.lower() in ["fulltime", "parttime", "contract", "internship", "temporary"]:
            kwargs["job_type"] = args.job_type.lower()

        jobs_df = scrape_jobs(**kwargs)

        if jobs_df is None or len(jobs_df) == 0:
            print(json.dumps([]))
            return

        # Convert DataFrame to records
        records = jobs_df.to_dict(orient="records")
        clean_jobs = []

        for r in records:
            # Clean NaN and NaT values for valid JSON serialization
            item = {}
            for k, v in r.items():
                if v is None or (isinstance(v, float) and (v != v)):  # check NaN
                    item[k] = None
                elif hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
                elif isinstance(v, (str, int, float, bool, list, dict)):
                    item[k] = v
                else:
                    item[k] = str(v)

            # Standardize output keys
            clean_jobs.append({
                "id": str(item.get("id") or f"{item.get('site', 'job')}-{hash(item.get('job_url', ''))}"),
                "site": str(item.get("site") or "unknown").lower(),
                "jobUrl": item.get("job_url") or item.get("job_url_direct") or "",
                "jobUrlDirect": item.get("job_url_direct"),
                "title": item.get("title") or "Untitled Position",
                "company": item.get("company") or "Confidential / Client",
                "location": item.get("location") or "Remote / Not Specified",
                "datePosted": item.get("date_posted"),
                "jobType": item.get("job_type"),
                "interval": item.get("interval"),
                "minAmount": item.get("min_amount"),
                "maxAmount": item.get("max_amount"),
                "currency": item.get("currency") or "USD",
                "isRemote": bool(item.get("is_remote")),
                "description": item.get("description") or "",
                "companyIndustry": item.get("company_industry"),
                "companyUrl": item.get("company_url"),
                "companyLogo": item.get("company_logo"),
                "skills": item.get("skills") if isinstance(item.get("skills"), list) else None,
            })

        print(json.dumps(clean_jobs))

    except Exception as e:
        sys.stderr.write(f"Scrape error: {str(e)}\n")
        print(json.dumps({"error": "SCRAPE_FAILED", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
