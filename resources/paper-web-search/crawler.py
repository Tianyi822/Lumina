#!/usr/bin/env python3
"""
PaperWebSearch Crawler

Reads a JSON search request from stdin, performs web search using DuckDuckGo,
crawls result pages, cleans HTML, deduplicates, and outputs structured JSON to stdout.

Usage:
    echo '{"query":"transformer attention","paperTitle":"Attention Is All You Need","maxResults":5}' \\
        | python3 crawler.py

Dependencies: duckduckgo_search, requests, beautifulsoup4 (see requirements.txt)
Fallback mode: works with stdlib only if dependencies are missing.
"""

from __future__ import annotations

import json
import re
import sys
import time
import traceback
from typing import Any

# ---------------------------------------------------------------------------
# Dependency detection & fallback
# ---------------------------------------------------------------------------

_HAS_DDG = False
_HAS_REQUESTS = False
_HAS_BS4 = False

try:
    from duckduckgo_search import DDGS

    _HAS_DDG = True
except ImportError:
    DDGS = None  # type: ignore[assignment]

try:
    import requests as _requests

    _HAS_REQUESTS = True
except ImportError:
    _requests = None  # type: ignore[assignment]

try:
    from bs4 import BeautifulSoup

    _HAS_BS4 = True
except ImportError:
    BeautifulSoup = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEARCH_TIMEOUT: int = 30
MAX_RESULTS: int = 5
MAX_SNIPPET_CHARS: int = 1000
MAX_TOTAL_CHARS: int = 5000

# Preferred academic domains ranked by relevance
PREFERRED_DOMAINS: list[str] = [
    "arxiv.org",
    "semanticscholar.org",
    "aclanthology.org",
    "openreview.net",
    "github.com",
    "ieee.org",
    "acm.org",
    "paperswithcode.com",
    "huggingface.co",
]

DEFAULT_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _log_error(msg: str) -> None:
    """Write an error message to stderr (never pollutes stdout)."""
    print(f"[crawler] ERROR: {msg}", file=sys.stderr, flush=True)


def _log_info(msg: str) -> None:
    """Write an info message to stderr (never pollutes stdout)."""
    print(f"[crawler] INFO: {msg}", file=sys.stderr, flush=True)


def _build_search_query(input_data: dict[str, Any]) -> str:
    """Build an enriched search query using paper context when available."""
    query = (input_data.get("query") or "").strip()
    paper_title = (input_data.get("paperTitle") or input_data.get("paper_context", {}).get("paperTitle") or "").strip()

    if query and paper_title:
        # Remove quotes from paper title for cleaner concatenation
        clean_title = paper_title.strip("\"'")
        return f"{query} related to paper: \"{clean_title}\""

    return query or paper_title or ""


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def search_web(query: str, max_results: int = 10) -> list[dict[str, str]]:
    """Search the web using DuckDuckGo. Falls back to a best-effort stub."""
    if not _HAS_DDG:
        _log_info("duckduckgo_search not available -- search disabled")
        return []

    results: list[dict[str, str]] = []
    try:
        with DDGS(timeout=SEARCH_TIMEOUT) as ddgs:
            for i, r in enumerate(ddgs.text(query, max_results=max_results)):
                results.append(
                    {
                        "title": (r.get("title") or "").strip(),
                        "href": (r.get("href") or r.get("link") or "").strip(),
                        "body": (r.get("body") or "").strip(),
                    }
                )
    except Exception as exc:
        _log_error(f"DuckDuckGo search failed: {exc}")

    return results


def _score_domain(url: str) -> int:
    """Return a relevance score for a URL based on preferred domains."""
    from urllib.parse import urlparse

    hostname = urlparse(url).hostname or ""
    for i, domain in enumerate(PREFERRED_DOMAINS):
        if domain in hostname:
            # Earlier domains in the list score higher
            return len(PREFERRED_DOMAINS) - i
    return 0


def _sort_by_domain(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort results so preferred/academic domains come first."""
    return sorted(results, key=lambda r: _score_domain(r.get("url", "")), reverse=True)


# ---------------------------------------------------------------------------
# HTML cleaning
# ---------------------------------------------------------------------------


def clean_html(html: str, url: str = "") -> str:
    """
    Remove scripts, styles, nav, footer, and other non-content HTML elements.
    Returns plain text.
    """
    if not html:
        return ""

    if _HAS_BS4:
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Remove unwanted elements
            for selector in [
                "script",
                "style",
                "nav",
                "footer",
                "header",
                "aside",
                "noscript",
                "iframe",
                "form",
                "button",
                "svg",
                '[role="navigation"]',
                '[role="banner"]',
                '[role="contentinfo"]',
                ".footer",
                ".nav",
                ".sidebar",
                ".menu",
                ".advertisement",
            ]:
                for tag in soup.select(selector):
                    tag.decompose()

            text = soup.get_text(separator=" ", strip=True)
            return _normalise_whitespace(text)
        except Exception as exc:
            _log_error(f"BeautifulSoup cleaning failed for {url}: {exc}")
            # Fall through to regex cleaning below
    else:
        _log_info(f"beautifulsoup4 not available -- using regex cleaning for {url}")

    # Regex fallback: strip script/style blocks and tags
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return _normalise_whitespace(text)


def _normalise_whitespace(text: str) -> str:
    """Collapse multiple whitespace characters into a single space."""
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# URL fetching
# ---------------------------------------------------------------------------


def fetch_page(url: str) -> str:
    """Fetch a page and return its cleaned text content."""
    if not _HAS_REQUESTS:
        _log_info("requests not available -- skipping page fetch")
        return ""

    try:
        resp = _requests.get(url, headers=DEFAULT_HEADERS, timeout=SEARCH_TIMEOUT)
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            return ""

        html = resp.text
        # Limit input to prevent huge pages from consuming too much memory
        html = html[:200_000]
        return clean_html(html, url=url)
    except _requests.exceptions.Timeout:
        _log_error(f"Timeout fetching {url}")
    except _requests.exceptions.RequestException as exc:
        _log_error(f"Failed to fetch {url}: {exc}")
    except Exception as exc:
        _log_error(f"Unexpected error fetching {url}: {exc}")

    return ""


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


def _url_fingerprint(url: str) -> str:
    """Normalise a URL for deduplication."""
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(url.lower().strip())
    # Remove trailing slash, fragment, and query for comparison
    cleaned = parsed._replace(fragment="", query="", path=parsed.path.rstrip("/"))
    return urlunparse(cleaned)


def _title_fingerprint(title: str) -> str:
    """Normalise a title for similarity comparison."""
    t = title.lower().strip()
    t = re.sub(r"[^a-z0-9一-鿿]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _titles_are_similar(t1: str, t2: str, threshold: float = 0.55) -> bool:
    """
    Check whether two titles are similar using word overlap (Jaccard-like).
    Also handles the case where one title is a substring of the other.
    """
    a = set(_title_fingerprint(t1).split())
    b = set(_title_fingerprint(t2).split())

    if not a or not b:
        return False

    # Substring check
    fp1 = _title_fingerprint(t1)
    fp2 = _title_fingerprint(t2)
    if fp1 in fp2 or fp2 in fp1:
        return True

    intersection = a & b
    union = a | b
    return len(intersection) / len(union) >= threshold


def deduplicate_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove duplicate results based on normalised URL and title similarity."""
    seen_urls: set[str] = set()
    seen_titles: list[str] = []
    deduped: list[dict[str, Any]] = []

    for r in results:
        url = r.get("url") or r.get("href") or ""
        title = r.get("title") or ""

        if not url and not title:
            continue

        url_key = _url_fingerprint(url)
        if url_key in seen_urls:
            continue

        if any(_titles_are_similar(title, st) for st in seen_titles):
            continue

        seen_urls.add(url_key)
        seen_titles.append(title)
        deduped.append(r)

    return deduped


# ---------------------------------------------------------------------------
# Quality assessment
# ---------------------------------------------------------------------------


def assess_quality(
    query: str,
    results: list[dict[str, Any]],
    total_discovered: int,
) -> str:
    """
    Assess result quality: 'high' | 'medium' | 'low' | 'empty'.

    Criteria:
    - 'high': 3+ results and at least one from a preferred/academic domain
    - 'medium': 1+ results (any domain)
    - 'low': 0 results but some were discovered and discarded (duplicates etc.)
    - 'empty': nothing found at all
    """
    if not results:
        if total_discovered == 0:
            return "empty"
        return "low"

    if len(results) >= 3:
        for r in results:
            if _score_domain(r.get("url", "")) > 0:
                return "high"
        return "medium"

    return "medium"


# ---------------------------------------------------------------------------
# Truncation
# ---------------------------------------------------------------------------


def truncate(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Truncate:
    - Max 5 results total
    - Max 1000 characters per snippet
    - Max 5000 characters total across all snippets
    """
    truncated: list[dict[str, Any]] = []
    total_chars = 0

    for r in results[:MAX_RESULTS]:
        snippet = (r.get("snippet") or r.get("body") or "")[:MAX_SNIPPET_CHARS]
        remaining = MAX_TOTAL_CHARS - total_chars

        if remaining <= 0:
            break

        if len(snippet) > remaining:
            snippet = snippet[:remaining]

        total_chars += len(snippet)
        truncated.append(
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": snippet,
            }
        )

    return truncated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    """Read JSON from stdin, run search pipeline, output JSON to stdout."""
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        result = {
            "success": False,
            "error": "No input provided",
            "query": "",
            "quality": "empty",
            "results": [],
            "totalDiscovered": 0,
            "totalCrawled": 0,
            "totalRetained": 0,
            "elapsedMs": 0,
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    try:
        input_data = json.loads(raw_input)
    except json.JSONDecodeError as exc:
        result = {
            "success": False,
            "error": f"Invalid JSON input: {exc}",
            "query": "",
            "quality": "empty",
            "results": [],
            "totalDiscovered": 0,
            "totalCrawled": 0,
            "totalRetained": 0,
            "elapsedMs": 0,
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    start_time = time.monotonic()
    query = _build_search_query(input_data)

    if not query:
        result = {
            "success": False,
            "error": "Empty query after processing input",
            "query": "",
            "quality": "empty",
            "results": [],
            "totalDiscovered": 0,
            "totalCrawled": 0,
            "totalRetained": 0,
            "elapsedMs": int((time.monotonic() - start_time) * 1000),
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    _log_info(f'Searching for: "{query}"')

    # --- Step 1: Search ---
    raw_results = search_web(query, max_results=MAX_RESULTS * 2)
    total_discovered = len(raw_results)

    # Normalise field names (DDGS returns 'href' and 'body')
    normalised: list[dict[str, Any]] = []
    for r in raw_results:
        normalised.append(
            {
                "title": r.get("title", ""),
                "url": r.get("href", "") or r.get("link", ""),
                "body": r.get("body", ""),
            }
        )

    # Sort so academic domains come first (preferred domains bubble up)
    normalised = _sort_by_domain(normalised)

    # --- Step 2: Crawl & clean ---
    total_crawled = 0
    for r in normalised:
        url = r.get("url", "")
        if url:
            body = fetch_page(url)
            if body:
                r["crawled"] = body
            total_crawled += 1

    # Merge search snippet with crawled content (prefer crawled)
    for r in normalised:
        snippet = r.get("crawled") or r.get("body", "")
        r["snippet"] = snippet

    # --- Step 3: Deduplicate ---
    deduped = deduplicate_results(normalised)
    total_retained = len(deduped)

    # --- Step 4: Truncate ---
    final_results = truncate(deduped)

    # --- Step 5: Quality ---
    quality = assess_quality(query, final_results, total_discovered)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    output = {
        "success": True,
        "query": query,
        "quality": quality,
        "results": final_results,
        "totalDiscovered": total_discovered,
        "totalCrawled": total_crawled,
        "totalRetained": total_retained,
        "elapsedMs": elapsed_ms,
    }

    print(json.dumps(output, ensure_ascii=False))
    _log_info(f"Done: discovered={total_discovered}, crawled={total_crawled}, "
              f"retained={total_retained}, quality={quality}, elapsed={elapsed_ms}ms")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        error_result = {
            "success": False,
            "error": f"Unhandled exception: {exc}",
            "query": "",
            "quality": "empty",
            "results": [],
            "totalDiscovered": 0,
            "totalCrawled": 0,
            "totalRetained": 0,
            "elapsedMs": 0,
        }
        print(json.dumps(error_result, ensure_ascii=False), file=sys.stderr)
        _log_error(traceback.format_exc())
        sys.exit(1)
