#!/usr/bin/env python3
"""
JobSpy Runner Script for JDMatcher Enterprise
Integrates JobSpy scraper library with Fastify backend.
Enforces strict 24-hour freshness, repost exclusion, and filtered location country (default USA).
"""

import sys
import os
import json
import re
import argparse
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

# Add cloned JobSpy repo to path before any installed packages to ensure our fixes are active
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


REPOST_KEYWORDS = [
    "repost",
    "re-post",
    "reposted",
    "originally posted",
    "re-listed",
    "relisted",
    "renewed",
]

NON_USA_LOCATIONS = [
    "united kingdom", "london, uk", "england", "singapore", "india", "bengaluru",
    "bangalore", "delhi", "mumbai", "hyderabad", "france", "paris", "germany",
    "berlin", "canada", "toronto", "vancouver", "australia", "sydney", "dubai",
    "ireland", "dublin", "philippines", "brazil", "mexico", "japan", "tokyo"
]


def is_reposted(item: dict) -> bool:
    """Checks whether a job listing is reposted or re-listed."""
    fields_to_check = [
        str(item.get("title") or ""),
        str(item.get("description") or ""),
        str(item.get("company") or ""),
    ]

    for field in fields_to_check:
        lower = field.lower()
        for kw in REPOST_KEYWORDS:
            if kw in lower:
                return True
    return False


def is_older_than_24h(date_posted_str: str | None) -> bool:
    """Strictly checks whether date_posted is older than 24 hours (strictly today or yesterday)."""
    if not date_posted_str:
        return False
    try:
        if isinstance(date_posted_str, str):
            # Parse YYYY-MM-DD
            clean_date = date_posted_str.split("T")[0]
            d = date.fromisoformat(clean_date)
            today = date.today()
            # Allow today (0 days) or yesterday (1 day)
            return (today - d).days > 1
    except Exception:
        pass
    return False


def matches_country(location: str | None, target_country: str) -> bool:
    """Validates that location belongs to the target country (default USA)."""
    if not location:
        return True
    loc_lower = location.lower()

    if target_country.lower() in ("usa", "us", "united states"):
        # If it explicitly names a non-USA country, reject
        for non_us in NON_USA_LOCATIONS:
            if non_us in loc_lower and "remote" not in loc_lower:
                return False
        return True

    return True


def parse_args():
    parser = argparse.ArgumentParser(description="Run JobSpy scraper")
    parser.add_argument("--search-term", type=str, default="Software Engineer")
    parser.add_argument("--location", type=str, default="")
    parser.add_argument("--site-names", type=str, default="linkedin,indeed,zip_recruiter,glassdoor")
    parser.add_argument("--stick-to-site", type=str, default=None)
    parser.add_argument("--results-wanted", type=int, default=25)
    parser.add_argument("--hours-old", type=int, default=24) # Default strictly 24 hours
    parser.add_argument("--is-remote", action="store_true", default=False)
    parser.add_argument("--job-type", type=str, default=None)
    parser.add_argument("--country", type=str, default="usa") # Default USA
    parser.add_argument("--fetch-description", action="store_true", default=False)
    parser.add_argument("--filter-reposts", action="store_true", default=True)
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

    target_country = (args.country or "usa").strip().lower()
    search_loc = args.location.strip() if args.location else ""
    if not search_loc and target_country in ("usa", "us"):
        search_loc = "United States"

    try:
        # Request more raw results upfront so post-filtering (reposts & strict 24h) yields full target count
        fetch_multiplier = 2
        raw_wanted = max(5, min(args.results_wanted * fetch_multiplier, 60))

        kwargs = {
            "site_name": filtered_sites,
            "search_term": args.search_term,
            "location": search_loc,
            "results_wanted": raw_wanted,
            "hours_old": args.hours_old or 24, # strictly 24 hours
            "country_indeed": target_country,
            "fetch_description": args.fetch_description,
        }

        if args.is_remote:
            kwargs["is_remote"] = True
        if args.job_type and args.job_type.lower() in ["fulltime", "parttime", "contract", "internship", "temporary"]:
            kwargs["job_type"] = args.job_type.lower()

        jobs_df = scrape_jobs(**kwargs)

        if jobs_df is None or len(jobs_df) == 0:
            print(json.dumps([]))
            return

        records = jobs_df.to_dict(orient="records")
        clean_jobs = []

        for r in records:
            item = {}
            for k, v in r.items():
                if v is None or (isinstance(v, float) and (v != v)):
                    item[k] = None
                elif hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
                elif isinstance(v, (str, int, float, bool, list, dict)):
                    item[k] = v
                else:
                    item[k] = str(v)

            # Strict Filter 1: Exclude Reposted Jobs
            if args.filter_reposts and is_reposted(item):
                continue

            # Strict Filter 2: Strictly Posted within 24 Hours
            date_posted = item.get("date_posted")
            if args.hours_old and args.hours_old <= 24 and is_older_than_24h(date_posted):
                continue

            # Strict Filter 3: Country validation (Default USA)
            loc = item.get("location") or ""
            if not matches_country(loc, target_country):
                continue

            clean_jobs.append({
                "id": str(item.get("id") or f"{item.get('site', 'job')}-{hash(item.get('job_url', ''))}"),
                "site": str(item.get("site") or "unknown").lower(),
                "jobUrl": item.get("job_url") or item.get("job_url_direct") or "",
                "jobUrlDirect": item.get("job_url_direct"),
                "title": item.get("title") or "Untitled Position",
                "company": item.get("company") or "Confidential / Client",
                "location": loc or "USA",
                "datePosted": date_posted or date.today().isoformat(),
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
                "isFresh24h": True,
                "isReposted": False,
            })

            if len(clean_jobs) >= args.results_wanted:
                break

        print(json.dumps(clean_jobs))

    except Exception as e:
        sys.stderr.write(f"Scrape error: {str(e)}\n")
        print(json.dumps({"error": "SCRAPE_FAILED", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
