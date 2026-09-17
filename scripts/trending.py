"""
Fetch trending pairs from DexScreener for a given chain/category and
last change, resolve each to its token contract address/symbol/name, and run
the community-token denylist (ported from the old Birdeye-based script)
over the results.

Usage:
    python trending.py --last h24 --limit 50
    python trending.py --chain robinhood --last h24 --limit 50

Requires:
    pip install playwright requests --break-system-packages
    playwright install chromium
"""

import argparse
import csv
import datetime
import os
import re
import sys
import time

import requests
from playwright.sync_api import sync_playwright

DEX_API_PAIR = "https://api.dexscreener.com/latest/dex/pairs/{chain}/{pair_address}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Default output directory for the CSV and any files generated at runtime
# (debug screenshots/HTML, the denied-token audit CSV).
DEFAULT_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "ds-output")
DEFAULT_OUTPUT_CSV = os.path.join(DEFAULT_OUTPUT_DIR, "trending-coins.csv")
TRENDING_FETCH_ATTEMPTS = 3

# Standard comma-delimited CSV. csv.writer/DictWriter auto-quote any field
# that contains a comma (e.g. a token name like "Foo, Inc"), so this is
# safe to open directly in Excel/Sheets or read with any CSV parser.
CSV_DELIMITER = ","

# =============================================================================
# Filters out stablecoins, wrapped/staked assets, major L1/L2s, DEX/CEX governance
# tokens, tokenized tocks/ETFs, and other "real product" tokens so only genuine
# community tokens remain. Deliberately over-inclusive: denies on any doubt, and
# the denied-token audit file (always in ds-output/) is how false positives get spotted and walked back.
# =============================================================================

EXCLUDE_SYMBOLS = {
    # stablecoins (incl. non-USD fiat-pegged)
    "USDT",
    "USDC",
    "DAI",
    "BUSD",
    "TUSD",
    "FDUSD",
    "USDE",
    "PYUSD",
    "USDP",
    "GUSD",
    "USDD",
    "FRAX",
    "LUSD",
    "CRVUSD",
    "USDS",
    "EURC",
    "EUROC",
    "EURE",
    "EURAU",
    "EURS",
    "EURT",
    "CEUR",
    "AEUR",
    "GYEN",
    "XSGD",
    "CNHT",
    # wrapped / liquid-staked native assets
    "WETH",
    "WBTC",
    "WBNB",
    "WMATIC",
    "WPOL",
    "WAVAX",
    "WFTM",
    "WSOL",
    "STETH",
    "WSTETH",
    "WEETH",
    "CBETH",
    "RETH",
    "ALETH",
    "BNSOL",
    "JITOSOL",
    "CBBTC",
    # major L1/L2 base assets
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
    "ADA",
    "TRX",
    "TON",
    "AVAX",
    "MATIC",
    "POL",
    "FTM",
    "ARB",
    "OP",
    "SUI",
    "ATOM",
    "DOT",
    "NEAR",
    "ICP",
    "FIL",
    "HBAR",
    "VET",
    "ALGO",
    "EGLD",
    "XLM",
    "LTC",
    "BCH",
    "ETC",
    "XMR",
    "ZEC",
    "APT",
    "SEI",
    "TIA",
    "INJ",
    "QNT",
    "FLOW",
    "KAVA",
    "THETA",
    "APE",  # ApeCoin — Yuga Labs ecosystem/governance token
    "STBL",
    "YAK",
    "OVER",
    "ETHFI",
    "RADIO",
    "DEEP",
    "NS",
    "CETUS",
    "NAVX",
    # additional stablecoins and fiat/commodity-backed assets
    "FUSD",
    "DOLA",
    "MIM",
    "JPYC",
    "BOLD",
    "AUSD",
    "USDG",
    "USDGLO",
    "MSUSD",
    "ZCHF",
    "UZDT",
    "MXNB",
    "BRLA",
    "THBILL",
    "USD₮0",
    # established application, protocol, and infrastructure tokens
    "MOTO",
    "SYN",
    "ENA",
    "TEL",
    "ATH",
    "RAIL",
    "ILV",
    "AAVE.E",
    "QI",
    "MYST",
    "QUICK",
    "XOR",
    "ORBS",
    "GST",
    "GMT",
    "GEOD",
    "SUPER",
    "GOHM",
    "LPT",
    "PNP",
    "OHM",
    "HEGIC",
    "AERO",
    "MORPHO",
    "WLD",
    "OLAS",
    "STG",
    "LQDR",
    "BEETS",
    "BOO",
    "DEUS",
    "PRIME",
    "BRUSH",
    "ANY",
    "SHRAP",
    "SAND",
    "GRAIL",
    "PNG",
    "TART",
    "LIF3",
    # DEX / lending protocol governance tokens
    "UNI",
    "SUSHI",
    "CAKE",
    "CRV",
    "BAL",
    "JOE",
    "RAY",
    "ORCA",
    "JUP",
    "1INCH",
    "DYDX",
    "GMX",
    "SNX",
    "AAVE",
    "COMP",
    "MKR",
    "LDO",
    "RUNE",
    "KNC",
    "ZRX",
    "BNT",
    "CVX",
    "LINK",  # Chainlink
    "PENDLE",  # Pendle Finance
    "STRATEGY",  # current corporate name of former MicroStrategy (MSTR)
    "CME",  # Chicago Mercantile Exchange
    # centralized-exchange / corporate chain-native tokens
    "OKB",
    "CRO",
    "FTT",
    "HT",
    "KCS",
    "LEO",
    "GT",
    "HOOD",  # Robinhood Markets' own Nasdaq ticker
    "𝕏",  # X (Twitter) platform branding
    # major public-company / ETF tickers — Robinhood Chain trades tokenized
    # equities, so these are far more likely real tokenized stock than a
    # coincidental meme-ticker collision
    "AAPL",
    "MSFT",
    "GOOGL",
    "GOOG",
    "AMZN",
    "META",
    "NVDA",
    "TSLA",
    "NFLX",
    "AMD",
    "DIS",
    "KO",
    "PEP",
    "WMT",
    "COST",
    "JPM",
    "PYPL",
    "COIN",
    "MSTR",
    "GME",
    "PLTR",
    "RIVN",
    "LCID",
    "SOFI",
    "ORCL",
    "CRM",
    "ADBE",
    "IBM",
    "CSCO",
    "SPY",
    "QQQ",
    "BRK",
    "IWM",
    "VOO",
    "VTI",
    "DIA",
    "ARKK",
    "GLD",
    "SLV",
    "TQQQ",
    "SQQQ",
    # found un-denied in prior audit runs — real product/protocol tickers or
    # established off-chain tickers that a permissionless token reuses
    "TSLR",  # also a live leveraged-TSLA ETF ticker
    "HBTC",  # Huobi BTC — wrapped-BTC product
    "LIT",  # Litentry / Lighter (zk perp DEX) shorthand
    "CLANKER",  # token-deployer service
    "V4",  # Uniswap v4 infra
    "PRISM",  # two separate real contracts use this ticker
    "STAX",
    "WOOD",
    "POOLS",
    "LISTED",
    "HOOKR",
    "LOCK",
    "ZFORGE",
    "LEV7",
    "DTF",  # Reserve's "decentralized token folio" product class
    "QUBIT",
    "INDEX",
    "DELTA",
    "NOTE",
    "OPEN",
    "MUSE",  # appears on two separate contracts
    "RSTR",
    "RKST",
    "UNIHOOD",
    "BAWSAQ",
    "ICOIN",
    "AMC",  # AMC Entertainment NYSE ticker
    "AI",  # C3.ai NYSE ticker
    "AU",  # gold — tokenized-gold products use it
    "MOO",  # Beefy Finance governance token
    "PUMP",  # pump.fun token
    "RSI",  # trading-indicator term, reused by structured products
    "BOW",  # Bowhead Specialty Holdings NYSE ticker
    # gold-backed commodity tokens — symbol-only, not name-substring, since
    # plenty of legit meme tokens have "Gold" in the name
    "XAUT",
    "XAUT0",
    "PAXG",
    # Standing policy: any ticker collision is denied, full stop, even if the
    # name reads as a harmless meme — that's exactly what a copycat would
    # pick. Do not remove entries here without confirming a false positive.
}


def is_excluded(symbol):
    if not symbol:
        return False
    return symbol.strip().upper() in EXCLUDE_SYMBOLS


# Same idea as EXCLUDE_SYMBOLS but matched case-insensitively against the
# token *name*, for corporate/branded tokens that don't have a recognizable
# ticker (e.g. "Robinhood Token").
EXCLUDE_NAME_SUBSTRINGS = {
    "robinhood token",
    "ondo tokenized",
    "xstock",
    "tokenized",
    "synthetic",
    "perpetual",
    "wrapped",
    "staked",
    "coinbase",
    "binance",
    "kraken",
    "nasdaq",
    "okx",
    "bybit",
    "htx",
    "bitget",
    "kucoin",
    "gate.io",
    "upbit",
    "bithumb",
    "crypto.com",
    "bitfinex",
}


def is_excluded_by_name(name):
    if not name:
        return False
    lowered = name.strip().lower()
    return any(substr in lowered for substr in EXCLUDE_NAME_SUBSTRINGS)


STABLECOIN_NAME_PATTERN = re.compile(
    r"\b(?:stablecoin|[a-z0-9-]+\s+usd|usd\s+coin)\b", re.IGNORECASE
)
GENERIC_TOKEN_NAME_PATTERN = re.compile(r"(?:^|[\s_-])token(?:$|[\s_-])", re.IGNORECASE)


def is_stablecoin_name(name):
    return bool(name) and bool(STABLECOIN_NAME_PATTERN.search(name.strip()))


def is_generic_token_name(name):
    return bool(name) and bool(GENERIC_TOKEN_NAME_PATTERN.search(name.strip()))


# ---------------------------------------------------------------------------
# HEURISTIC TIER (skipped with --lenient): word-level patterns indicating a
# protocol/venue/fund/structured-product name rather than a community token.
# Whole-word matching only, to avoid "note" eating "Notes on a Frog".
# This tier trades precision for recall — false positives are expected and
# get walked back via ALLOW_SYMBOLS once confirmed in the audit file.
# ---------------------------------------------------------------------------
PRODUCT_NAME_WORDS = {
    "protocol",
    "finance",
    "financial",
    "exchange",
    "markets",
    "capital",
    "holdings",
    "treasury",
    "strategy",
    "strategies",
    "fund",
    "etf",
    "index",
    "vault",
    "yield",
    "staking",
    "restaking",
    "liquidity",
    "oracle",
    "bridge",
    "router",
    "launchpad",
    "aggregator",
    "systems",
    "labs",
    "network",
    "infrastructure",
    "custody",
    "clearing",
    "brokerage",
    "securities",
    "equities",
    "derivatives",
    "options",
    "futures",
    "swap",
    "perps",
    "dex",
    "cex",
    "rwa",
    "dtf",  # Reserve Protocol's "decentralized token folio" product class
    "reserve",
    "governance",
    "utility",
    "dao",
    "game",
    "games",
}

# Bare major-company names — catches tokenized-stock deploys that don't use
# the standard ticker. Whole-word match, so "Big Apple Coin" is also caught;
# accepted per the "deny when unsure" policy.
BARE_COMPANY_NAME_WORDS = {
    "apple",
    "amazon",
    "microsoft",
    "alphabet",
    "google",
    "nvidia",
    "tesla",
    "netflix",
    "walmart",
    "costco",
    "disney",
    "paypal",
    "salesforce",
    "oracle",
    "ibm",
    "cisco",
    "adobe",
    "jpmorgan",
    "mastercard",
    "visa",
    "chevron",
    "pfizer",
    "starbucks",
    "nike",
    "boeing",
    "qualcomm",
    "broadcom",
    "intel",
    "spacex",
    "comcast",
    "mcdonalds",
    "berkshire",
    "openai",
    "anthropic",
}

# A name that's really a domain ("pools.trade", "ZECFORGE.tech") is a
# platform advertising itself, not a community token.
DOMAIN_NAME_PATTERN = re.compile(
    r"\b[\w-]+\.(fun|trade|tech|io|xyz|app|finance|exchange|money|network|"
    r"com|org|net|wtf|gg|ai|so|to|sh)\b",
    re.IGNORECASE,
)

# "REPONAME github.com/owner/REPONAME" is a tokenize-a-repo meme trend, not
# the token advertising its own domain — exempt these dev-platform refs.
DOMAIN_ALLOWLIST = {"github.com", "gitlab.com"}

# Versioned naming ("Programmable V4") is how protocols label releases;
# communities don't ship point releases.
VERSIONED_NAME_PATTERN = re.compile(r"\bv[2-9]\b", re.IGNORECASE)

# Structured/leveraged product tickers: OPENAIX1L, LEV7, BTC3S, ETH2XL.
LEVERAGED_SYMBOL_PATTERN = re.compile(
    r"(^LEV\d+$)|(\d+X[LS]$)|(X\d+[LS]$)|(\d+(LONG|SHORT)$)", re.IGNORECASE
)

# Cross-chain "canonical" bridged-asset naming: "Cardano (Universal)",
# "Bitcoin Avalanche Bridged (BTC.b)" — same category as wrapped/staked
# above but with different naming conventions.
BRIDGED_ASSET_NAME_PATTERN = re.compile(
    r"\(universal\)|\(ccip-bridged\)|\(wormhole\)|\bbridged\b", re.IGNORECASE
)

# Stock-ticker-shaped symbol (3-5 letters) paired with a corporate suffix
# in the name. Kept narrow — a blanket "any short symbol" rule would gut
# the whole chain.
CORPORATE_SUFFIX_PATTERN = re.compile(
    r"\b(inc|corp|corporation|ltd|llc|plc|nv|sa|ag|holdings|group)\b\.?$",
    re.IGNORECASE,
)

# Yield-bearing stablecoin wrappers (e.g. "syrupUSDC"): suffix match, not
# substring, so "DAIFUKU" (a dessert meme) isn't wrongly caught.
_STABLE_BASE_TICKERS = ("USDC", "USDT", "DAI", "USDE", "BUSD", "TUSD")
_DERIVATIVE_BASE_TICKERS = ("ETH", "BTC", "SOL", "BNB", "AVAX", "MATIC", "ARB", "OP")


def is_stablecoin_derivative(symbol):
    if not symbol:
        return False
    sym = symbol.strip().upper()
    return any(sym.endswith(base) and sym != base for base in _STABLE_BASE_TICKERS)


def is_base_asset_derivative(symbol):
    """Catches compact wrapped/staked tickers (ALETH, WBTC, BETH) that the
    name-substring rule above would miss."""
    if not symbol:
        return False
    sym = symbol.strip().upper()
    return any(sym.endswith(base) and sym != base for base in _DERIVATIVE_BASE_TICKERS)


# Escape hatch: symbols listed here pass even if the heuristic tier flags
# them. Use once a specific false positive is confirmed via the denied-token audit file.
ALLOW_SYMBOLS = set()

# ---------------------------------------------------------------------------
# LIVE TICKER CROSS-CHECK (4th tier, on by default; --no-live-check to skip)
#
# EXCLUDE_SYMBOLS is hand-maintained and will always lag reality. This tier
# checks trending symbols against a runtime-fetched S&P 500 ticker list so
# new real-world collisions get caught without a manual edit. Deliberately
# narrow in scope (S&P 500, not the full ticker universe) to avoid denying
# real community tokens over obscure micro-cap collisions.
# ---------------------------------------------------------------------------
_LIVE_TICKER_CACHE = None
LIVE_CHECK_ENABLED = True  # flipped by --no-live-check in main()


def _load_live_ticker_set():
    """Best-effort fetch, cached for the process. Failure just skips this
    tier for the run — it's a supplement to EXCLUDE_SYMBOLS, not a
    replacement, so it must never block the whole script."""
    global _LIVE_TICKER_CACHE
    if _LIVE_TICKER_CACHE is not None:
        return _LIVE_TICKER_CACHE
    tickers = set()
    try:
        resp = requests.get(
            "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
            timeout=10,
            headers={"User-Agent": "trending-tokens-script/1.0"},
        )
        resp.raise_for_status()
        tickers.update(re.findall(r"<td><a[^>]*>([A-Z.]{1,6})</a></td>", resp.text))
    except Exception:
        pass
    _LIVE_TICKER_CACHE = tickers
    return tickers


def live_ticker_collision(symbol):
    if not LIVE_CHECK_ENABLED or not symbol:
        return None
    sym = symbol.strip().upper()
    if len(sym) < 2 or len(sym) > 5 or not sym.isalpha():
        return None  # not ticker-shaped; longer/mixed strings produce too
        # many coincidental hits to be worth checking
    if sym in _load_live_ticker_set():
        return f"live-ticker-match:{sym}"
    return None


def _words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def heuristic_reason(name, symbol):
    """Short reason string if the heuristic tier rejects, else None."""
    name = (name or "").strip()
    symbol = (symbol or "").strip()

    if name:
        hits = _words(name) & PRODUCT_NAME_WORDS
        if hits:
            return f"product-word:{','.join(sorted(hits))}"
        company_hits = _words(name) & BARE_COMPANY_NAME_WORDS
        if company_hits:
            return f"bare-company-name:{','.join(sorted(company_hits))}"
        domain_hit = DOMAIN_NAME_PATTERN.search(name)
        if domain_hit and domain_hit.group(0).lower() not in DOMAIN_ALLOWLIST:
            return "domain-style-name"
        if BRIDGED_ASSET_NAME_PATTERN.search(name):
            return "bridged-asset-name"
        if VERSIONED_NAME_PATTERN.search(name):
            return "versioned-name"
        if CORPORATE_SUFFIX_PATTERN.search(name):
            return "corporate-suffix"
    if symbol and LEVERAGED_SYMBOL_PATTERN.search(symbol):
        return "leveraged-symbol"
    return None


# Leveraged structured products ("OPENAI 1x Long") track a real company or
# asset with a multiplier — a DeFi financial product, not a meme.
LEVERAGED_PRODUCT_PATTERN = re.compile(r"\d+\s*x\s*(long|short)\b", re.IGNORECASE)


def is_leveraged_product(name):
    return bool(name) and bool(LEVERAGED_PRODUCT_PATTERN.search(name))


# Names running to hundreds of characters are usually dozens of real token
# names stuffed together to game trending visibility, not a real project.
MAX_NAME_LENGTH = 80


def is_name_spam(name):
    return bool(name) and len(name.strip()) > MAX_NAME_LENGTH


# Placeholder/test deploys — exact match only, so real meme names like
# "Contest Coin" aren't caught by a "test" substring.
EXACT_JUNK_NAMES = {
    "test token",
    "test coin",
    "testing",
    "testing token",
    "sample token",
    "unnamed token",
    "new token",
    "hello world",
}


def is_junk_name(name):
    return bool(name) and name.strip().lower() in EXACT_JUNK_NAMES


# Emoji in name or symbol — a spam/attention-grab signal, so this runs
# unconditionally rather than only under the strict/heuristic tier. Ranges
# cover the actual emoji blocks and deliberately exclude general
# punctuation/geometric shapes to avoid false-positiving on dashes/quotes.
EMOJI_PATTERN = re.compile(
    "["
    "\U0001f000-\U0001faff"
    "\U00002600-\U000027bf"
    "\U00002b00-\U00002bff"
    "\U00002300-\U000023ff"
    "\U0000fe0f"
    "\U0000200d"
    "]",
    flags=re.UNICODE,
)


def has_emoji(name, symbol):
    return bool(
        (name and EMOJI_PATTERN.search(name))
        or (symbol and EMOJI_PATTERN.search(symbol))
    )


def denial_reason(name, symbol, strict=True):
    """Single entry point. Returns a reason string to deny, or None to keep.
    strict=False disables the heuristic + live-ticker tiers."""
    if symbol and symbol.strip().upper() in ALLOW_SYMBOLS:
        return None
    if is_excluded(symbol):
        return "symbol-denylist"
    if is_excluded_by_name(name):
        return "name-denylist"
    if is_stablecoin_name(name):
        return "stablecoin-name"
    if is_generic_token_name(name):
        return "generic-token-name"
    if is_leveraged_product(name):
        return "leveraged-product"
    if is_name_spam(name):
        return "name-spam"
    if is_junk_name(name):
        return "junk-name"
    if has_emoji(name, symbol):
        return "emoji-in-name-or-symbol"
    if is_stablecoin_derivative(symbol):
        return "stablecoin-derivative"
    if is_base_asset_derivative(symbol):
        return "base-asset-derivative"
    if strict:
        reason = heuristic_reason(name, symbol)
        if reason:
            return reason
        return live_ticker_collision(symbol)
    return None


DENIED_OUTPUT_HEADER = [
    "chain",
    "token_name",
    "token_symbol",
    "contract_address",
    "reason",
]


def write_denied(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=CSV_DELIMITER)
        writer.writerow(DENIED_OUTPUT_HEADER)
        for row in rows:
            writer.writerow(
                [
                    row.get("chain", ""),
                    row.get("name", ""),
                    row.get("symbol", ""),
                    row.get("contract_address", ""),
                    row.get("denied_by", ""),
                ]
            )


# =============================================================================
# DEXSCREENER SCRAPING — replaces the old Birdeye /defi/token_trending calls.
# =============================================================================


# Dexscreener's trending sort field per timeframe.
TIMEFRAME_RANK_FIELDS = {
    "m5": "trendingScoreM5",
    "h1": "trendingScoreH1",
    "h6": "trendingScoreH6",
    "h24": "trendingScoreH24",
}

# Keep this aligned with the chains accepted by import-trending-coins.mjs.
DEXSCREENER_CHAIN_SLUGS = {
    "ethereum": "ethereum",
    "bsc": "bsc",
    "polygon": "polygon",
    "avalanche": "avalanche",
    "arbitrum": "arbitrum",
    "base": "base",
    "optimism": "optimism",
    "fantom": "fantom",
    "hood": "robinhood",
    "solana": "solana",
    "sui": "sui",
    "tron": "tron",
    "xrpl": "xrpl",
}
SUPPORTED_CHAINS = tuple(DEXSCREENER_CHAIN_SLUGS.values())
GECKO_TRENDING_NETWORKS = {}
PAIR_ADDRESS_PATTERNS = {
    "ethereum": re.compile(r"0x[0-9a-fA-F]{40}"),
    "bsc": re.compile(r"0x[0-9a-fA-F]{40}"),
    "polygon": re.compile(r"0x[0-9a-fA-F]{40}"),
    "avalanche": re.compile(r"0x[0-9a-fA-F]{40}"),
    "arbitrum": re.compile(r"0x[0-9a-fA-F]{40}"),
    "base": re.compile(r"0x[0-9a-fA-F]{40}"),
    "optimism": re.compile(r"0x[0-9a-fA-F]{40}"),
    "fantom": re.compile(r"0x[0-9a-fA-F]{40}"),
    "robinhood": re.compile(r"0x[0-9a-fA-F]{40}"),
    "solana": re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}"),
    "sui": re.compile(r"0x[0-9a-fA-F]{64}"),
    "tron": re.compile(r"T[1-9A-HJ-NP-Za-km-z]{33}"),
    "xrpl": re.compile(r"[A-Za-z0-9._-]+"),
}


def scrape_trending_pair_addresses(
    chain: str, limit: int, last: str = "h24"
) -> list[tuple[str, str]]:
    """
    Loads the Dexscreener trending page for a chain/category, ranked by
    trending score over the last m5/h1/h6/h24, and returns a list of
    (chain, pair_address) tuples in ranked order.

    Only reads the first page of results as initially rendered (no
    scrolling/pagination) — Dexscreener's trending table loads up to 100
    rows on first load, which is why --limit is capped at 100.
    """
    rank_field = TIMEFRAME_RANK_FIELDS[last]
    url = f"https://dexscreener.com/{chain}?rankBy={rank_field}&order=desc"
    pairs = []

    # Match links for this chain regardless of address format. EVM addresses
    # use 0x, while Solana, Sui, and Tron use other formats.
    link_selector = f'a[href^="/{chain}/"]'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1400, "height": 1000},
        )
        page.goto(url, timeout=60000, wait_until="domcontentloaded")

        try:
            page.wait_for_selector(link_selector, timeout=30000)
        except Exception:
            os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
            page.screenshot(
                path=os.path.join(DEFAULT_OUTPUT_DIR, "debug-screenshot.png"),
                full_page=True,
            )
            with open(
                os.path.join(DEFAULT_OUTPUT_DIR, "debug-page.html"),
                "w",
                encoding="utf-8",
            ) as f:
                f.write(page.content())
            browser.close()
            raise RuntimeError(
                "Could not find pair rows.\n"
                "Saved debug-screenshot.png and debug-page.html for inspection.\n"
                "The page may be showing a bot-check/CAPTCHA, or the chain slug "
                "may be wrong."
            )

        # Give lazy-loaded rows a moment to finish rendering
        page.wait_for_timeout(1500)

        seen = set()
        links = page.query_selector_all(link_selector)
        for link in links:
            href = link.get_attribute("href")
            if not href or href in seen:
                continue
            seen.add(href)
            parts = href.strip("/").split("/")
            if len(parts) == 2:
                row_chain, pair_address = parts
                pattern = PAIR_ADDRESS_PATTERNS.get(row_chain)
                if not pattern or not pattern.fullmatch(pair_address):
                    continue
                pairs.append((row_chain, pair_address))
            if len(pairs) >= limit:
                break

        browser.close()

    return pairs


def scrape_trending_pair_addresses_with_retry(
    chain: str, limit: int, last: str = "h24"
) -> list[tuple[str, str]]:
    for attempt in range(1, TRENDING_FETCH_ATTEMPTS + 1):
        try:
            return scrape_trending_pair_addresses(chain, limit, last)
        except Exception:
            if attempt == TRENDING_FETCH_ATTEMPTS:
                raise
            delay = 2 ** (attempt - 1)
            print(f"  Trending scrape blocked/failed for {chain}.")
            print(
                f"  Retrying in {delay}s "
                f"({attempt + 1}/{TRENDING_FETCH_ATTEMPTS})..."
            )
            time.sleep(delay)


def resolve_pair(chain: str, pair_address: str) -> dict | None:
    """
    Calls the Dexscreener API for a single pair and extracts contract
    address, symbol, name, chain, price, liquidity and volume for the base
    token — the last two are needed for the denylist audit trail.
    """
    resp = requests.get(
        DEX_API_PAIR.format(chain=chain, pair_address=pair_address), timeout=15
    )
    if resp.status_code != 200:
        return None

    data = resp.json()
    pair = data.get("pair") or (data.get("pairs") or [None])[0]
    if not pair:
        return None

    base = pair.get("baseToken", {})
    return {
        "chain": pair.get("chainId"),
        "contract_address": base.get("address"),
        "symbol": base.get("symbol"),
        "name": base.get("name"),
        "price_usd": pair.get("priceUsd"),
        "liquidity_usd": (pair.get("liquidity") or {}).get("usd"),
        "volume_24h_usd": (pair.get("volume") or {}).get("h24"),
        "pair_address": pair_address,
    }


def fetch_gecko_trending_tokens(chain: str, limit: int) -> list[dict]:
    network = GECKO_TRENDING_NETWORKS.get(chain)
    if not network:
        return []

    response = requests.get(
        f"https://api.geckoterminal.com/api/v2/networks/{network}/trending_pools",
        params={"page": 1, "include": "base_token"},
        headers={"accept": "application/json;version=20230203"},
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    pools = payload.get("data") if isinstance(payload, dict) else []
    included = payload.get("included") if isinstance(payload, dict) else []
    tokens_by_id = {
        item.get("id"): item.get("attributes", {})
        for item in included or []
        if isinstance(item, dict) and item.get("type") == "token" and item.get("id")
    }
    results = []
    seen = set()
    for pool in pools[:limit] if isinstance(pools, list) else []:
        attributes = pool.get("attributes") or {}
        relationship = ((pool.get("relationships") or {}).get("base_token") or {}).get("data") or {}
        token = tokens_by_id.get(relationship.get("id"), {})
        address = str(token.get("address") or "").strip()
        if not address or address.lower() in seen:
            continue
        seen.add(address.lower())
        results.append(
            {
                "chain": chain,
                "contract_address": address,
                "name": str(token.get("name") or "").strip(),
                "symbol": str(token.get("symbol") or "").strip(),
                "price_usd": attributes.get("base_token_price_usd"),
                "liquidity_usd": attributes.get("reserve_in_usd"),
                "volume_24h_usd": (attributes.get("volume_usd") or {}).get("h24"),
                "pair_address": attributes.get("address") or "",
            }
        )
    return [item for item in results if item["name"] and item["symbol"]]


def main():
    def _limit_type(value):
        try:
            ivalue = int(value)
        except ValueError:
            raise argparse.ArgumentTypeError(f"invalid int value: '{value}'")
        if not 1 <= ivalue <= 100:
            raise argparse.ArgumentTypeError("must be 1-100")
        return ivalue

    parser = argparse.ArgumentParser(
        description="Scrape Dexscreener trending tokens, filtered through the community-token denylist"
    )
    parser.add_argument(
        "--chain",
        choices=SUPPORTED_CHAINS,
        help="Fetch one chain only; defaults to all importer-supported chains",
    )
    parser.add_argument(
        "--last",
        default="h24",
        choices=sorted(TIMEFRAME_RANK_FIELDS),
        help="Trending window: m5, h1, h6, or h24 (default: h24)",
    )
    parser.add_argument(
        "--limit",
        type=_limit_type,
        default=50,
        metavar="[1-100]",
        help=(
            "How many trending pairs to fetch (max 100 — only the first "
            "page of Dexscreener's trending table is read, no pagination)"
        ),
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.3,
        help="Delay between API calls (rate-limit friendly)",
    )
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="skip the community-token denylist and include everything",
    )
    parser.add_argument(
        "--lenient",
        action="store_true",
        help="keep only the exact-match denylist; drop the heuristic + live-ticker tiers",
    )
    parser.add_argument(
        "--no-live-check",
        action="store_true",
        help="skip the live S&P 500 ticker cross-check; the static EXCLUDE_SYMBOLS list still applies",
    )
    args = parser.parse_args()

    global LIVE_CHECK_ENABLED
    LIVE_CHECK_ENABLED = not args.no_live_check

    # The results file has a fixed name and is overwritten on every run. The
    # denied-token audit file is timestamped instead, since it's meant as a
    # per-run diagnostic trail rather than a rolling "latest results" file.
    # Both always live in DEFAULT_OUTPUT_DIR ("ds-output") — there's no flag
    # to redirect them elsewhere.
    run_stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    out_path = DEFAULT_OUTPUT_CSV
    review_path = os.path.join(DEFAULT_OUTPUT_DIR, f"denied-{run_stamp}.csv")

    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)

    chains = [args.chain] if args.chain else list(SUPPORTED_CHAINS)
    print(
        f"Scraping top {args.limit} {args.last}-trending pairs for "
        f"{len(chains)} chain(s)..."
    )
    candidates = []
    for chain in chains:
        print(f"  Fetching {chain}...")
        if chain in GECKO_TRENDING_NETWORKS:
            try:
                gecko_tokens = fetch_gecko_trending_tokens(chain, args.limit)
                candidates.extend(("geckoterminal", token, "") for token in gecko_tokens)
                print(f"  GeckoTerminal: {len(gecko_tokens)} token(s)")
            except Exception as error:
                if args.chain:
                    raise
                print(f"  Skipping {chain}: {error}")
            continue
        try:
            candidates.extend(
                ("dexscreener", chain, pair_address)
                for chain, pair_address in scrape_trending_pair_addresses_with_retry(
                    chain, args.limit, args.last
                )
            )
        except Exception as error:
            if args.chain:
                raise
            print(f"  Skipping {chain}: {error}")
    print(f"Found {len(candidates)} trending candidates. Resolving and deduplicating...")

    results = []
    denied = []
    seen_addresses = set()
    seen_symbols = {}

    for i, (source, candidate, pair_address) in enumerate(candidates, 1):
        if source == "geckoterminal":
            info = candidate
            chain = info["chain"]
        else:
            chain = candidate
            info = resolve_pair(chain, pair_address)
        if not info:
            print(f"  [{i}] failed to resolve {chain}/{pair_address or source}")
            time.sleep(args.delay)
            continue

        address = info["contract_address"]
        symbol = info["symbol"]
        name = info["name"]

        address_key = f"{chain}:{(address or '').lower()}"
        if address and address_key in seen_addresses:
            time.sleep(args.delay)
            continue

        reason = (
            None
            if args.no_filter
            else denial_reason(name, symbol, strict=not args.lenient)
        )

        # Ticker collisions: the trending list is rank-ordered, so the first
        # contract to claim a symbol is the one actually trending; a later
        # duplicate is at best ambiguous and gets denied instead.
        key = (symbol or "").strip().upper()
        if reason is None and not args.no_filter and key and key in seen_symbols:
            reason = f"duplicate-symbol:{seen_symbols[key]}"

        if address:
            seen_addresses.add(address_key)

        if reason:
            denied.append({"rank": i, **info, "denied_by": reason})
            print(f"  [{i}] denied {symbol} ({name}) - {reason}")
            time.sleep(args.delay)
            continue

        if key:
            seen_symbols[key] = address
        info["rank"] = len(results) + 1
        results.append(info)
        print(f"  [{i}] {symbol} ({name}) - {address}")
        time.sleep(args.delay)

    if results:
        fieldnames = ["chain", "token_name", "token_symbol", "contract_address"]
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=CSV_DELIMITER)
            writer.writeheader()
            for r in results:
                writer.writerow(
                    {
                        "chain": r["chain"],
                        "token_name": r["name"],
                        "token_symbol": r["symbol"],
                        "contract_address": r["contract_address"],
                    }
                )
        print(f"\nSaved {len(results)} tokens to {out_path}")
    else:
        print("\nNo results resolved.")

    if denied:
        write_denied(review_path, denied)
        print(f"Denied {len(denied)} tokens — reasons in {review_path}")
        print("  (skim it for false positives; --lenient turns the heuristics off)")


if __name__ == "__main__":
    main()
