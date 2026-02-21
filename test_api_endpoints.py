#!/usr/bin/env python3
"""
TradeYodha — Quick test for remaining unknown endpoints.
Tests multiple URL pattern guesses for short interest, short volume, flat files, etc.

Usage: export POLYGON_API_KEY='your_key' && python3 test_api_v3_unknowns.py
"""

import os, json, time, sys
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from datetime import datetime

API_KEY = os.environ.get("POLYGON_API_KEY", "YOUR_API_KEY_HERE")
if API_KEY == "YOUR_API_KEY_HERE":
    print("Set POLYGON_API_KEY first"); sys.exit(1)

B = "https://api.polygon.io"
M = "https://api.massive.com"

def try_url(label, url):
    """Try a URL and report result."""
    full = f"{url}{'&' if '?' in url else '?'}apiKey={API_KEY}"
    time.sleep(0.3)
    try:
        req = Request(full, headers={"User-Agent": "TradeYodha/3.0"})
        resp = urlopen(req, timeout=15)
        data = json.loads(resp.read().decode())
        count = 0
        keys = []
        if isinstance(data, dict):
            if "results" in data and isinstance(data["results"], list):
                count = len(data["results"])
                if count > 0 and isinstance(data["results"][0], dict):
                    keys = list(data["results"][0].keys())[:5]
            elif "status" in data:
                count = 1
        print(f"  ✅ {label}: {count} results {keys}")
        return True
    except HTTPError as e:
        code = e.code
        body = ""
        try: body = e.read().decode()[:150]
        except: pass
        print(f"  ❌ {label}: HTTP {code} {'(ACCESS DENIED)' if code==403 else '(NOT FOUND)' if code==404 else ''}")
        if body and code != 404:
            print(f"       {body[:120]}")
        return False
    except Exception as e:
        print(f"  ❌ {label}: {str(e)[:80]}")
        return False

print("=" * 70)
print("TradeYodha — Focused Test for Unknown Endpoints")
print(f"Time: {datetime.now().isoformat()}")
print("=" * 70)

# ═══════════════════════════════════════════════════════════
# SHORT INTEREST — Try every plausible URL pattern
# ═══════════════════════════════════════════════════════════
print("\n🔍 SHORT INTEREST — Testing URL patterns")
print("-" * 50)
try_url("Pattern: /stocks/v1/short-interest (polygon)",
        f"{B}/stocks/v1/short-interest?ticker=SPY&limit=3")
try_url("Pattern: /stocks/v1/short-interest (massive)",
        f"{M}/stocks/v1/short-interest?ticker=SPY&limit=3")
try_url("Pattern: /v3/reference/short_interest",
        f"{B}/v3/reference/short_interest?ticker=SPY&limit=3")
try_url("Pattern: /stocks/v1/short-interest/SPY",
        f"{B}/stocks/v1/short-interest/SPY?limit=3")
try_url("Pattern: /v2/reference/short-interest/SPY",
        f"{B}/v2/reference/short-interest/SPY?limit=3")

# ═══════════════════════════════════════════════════════════
# SHORT VOLUME — Same pattern hunt
# ═══════════════════════════════════════════════════════════
print("\n🔍 SHORT VOLUME — Testing URL patterns")
print("-" * 50)
try_url("Pattern: /stocks/v1/short-volume (polygon)",
        f"{B}/stocks/v1/short-volume?ticker=SPY&limit=3")
try_url("Pattern: /stocks/v1/short-volume (massive)",
        f"{M}/stocks/v1/short-volume?ticker=SPY&limit=3")
try_url("Pattern: /stocks/v1/short-volume/SPY",
        f"{B}/stocks/v1/short-volume/SPY?limit=3")

# ═══════════════════════════════════════════════════════════
# OPTIONS — Contracts list (timed out before, try with tighter filters)
# ═══════════════════════════════════════════════════════════
print("\n🔍 OPTIONS CONTRACTS — Tighter query to avoid timeout")
print("-" * 50)
try_url("Contracts (tight filter, 1 week, calls only)",
        f"{B}/v3/reference/options/contracts?underlying_ticker=SPY&contract_type=call&expiration_date.gte=2025-02-21&expiration_date.lte=2025-02-28&limit=5")
try_url("Contracts (single expiry)",
        f"{B}/v3/reference/options/contracts?underlying_ticker=AAPL&contract_type=call&expiration_date=2025-02-21&limit=5")

# ═══════════════════════════════════════════════════════════
# SINGLE OPTION CONTRACT SNAPSHOT — Try correct path
# ═══════════════════════════════════════════════════════════
print("\n🔍 SINGLE OPTION CONTRACT SNAPSHOT")
print("-" * 50)
# From docs: GET /v3/snapshot/options/{underlyingAsset}/{optionContract}
try_url("Snapshot: /v3/snapshot/options/SPY/O:SPY250221C00600000",
        f"{B}/v3/snapshot/options/SPY/O:SPY250221C00600000")
try_url("Snapshot: /v3/snapshot/options/AAPL/O:AAPL250221C00230000",
        f"{B}/v3/snapshot/options/AAPL/O:AAPL250221C00230000")

# ═══════════════════════════════════════════════════════════
# FLAT FILES — Try different paths
# ═══════════════════════════════════════════════════════════
print("\n🔍 FLAT FILES — URL patterns")
print("-" * 50)
try_url("Pattern: /v1/reference/flat-files",
        f"{B}/v1/reference/flat-files?limit=3")
try_url("Pattern: /flat-files/stocks/trades/2024/06",
        f"{B}/flat-files/stocks/trades/2024/06?limit=3")
try_url("Pattern: massive /flat-files",
        f"{M}/flat-files?limit=3")
# Note: Flat files might use S3 access, not REST API

# ═══════════════════════════════════════════════════════════
# BENZINGA v1 vs v2 patterns
# ═══════════════════════════════════════════════════════════
print("\n🔍 BENZINGA — Testing v1 patterns from changelog")
print("-" * 50)
try_url("Bulls Bears Say (v1)",
        f"{M}/benzinga/v1/bulls-bears-say?tickers=SPY&limit=3")
try_url("Bulls Bears Say (v2)",
        f"{M}/benzinga/v2/bulls-bears-say?tickers=SPY&limit=3")
try_url("Analyst Ratings (v1)",
        f"{M}/benzinga/v1/analyst-ratings?tickers=SPY&limit=3")
try_url("Earnings Calendar (v1)",
        f"{M}/benzinga/v1/calendar/earnings?tickers=SPY&limit=3")

# ═══════════════════════════════════════════════════════════
# 10-K SECTIONS — Correct path from docs
# ═══════════════════════════════════════════════════════════
print("\n🔍 10-K SECTIONS — Correct path from docs")
print("-" * 50)
# From docs: GET /stocks/filings/10-K/vX/sections
try_url("10-K Sections (correct path)",
        f"{B}/stocks/filings/10-K/vX/sections?ticker=AAPL&limit=2")
try_url("10-K Sections (massive)",
        f"{M}/stocks/filings/10-K/vX/sections?ticker=AAPL&limit=2")

# ═══════════════════════════════════════════════════════════
# FINANCIALS v1 (new endpoint replacing vX)
# ═══════════════════════════════════════════════════════════
print("\n🔍 FINANCIALS — New v1 patterns")
print("-" * 50)
try_url("Income Statements (stocks/v1)",
        f"{B}/stocks/v1/financials/income-statements?ticker=AAPL&limit=2")
try_url("Balance Sheet (stocks/v1)",
        f"{B}/stocks/v1/financials/balance-sheets?ticker=AAPL&limit=2")

# ═══════════════════════════════════════════════════════════
# FLOAT DATA
# ═══════════════════════════════════════════════════════════
print("\n🔍 FLOAT DATA — Experimental")
print("-" * 50)
try_url("Float (stocks/v1)",
        f"{B}/stocks/v1/float?ticker=AAPL&limit=3")
try_url("Float (vX)",
        f"{B}/vX/reference/tickers/AAPL/float?limit=3")

print("\n" + "=" * 70)
print("Done! Share these results to finalize the data architecture.")
print("=" * 70)