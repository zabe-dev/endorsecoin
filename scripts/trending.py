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
from urllib.parse import quote, urlsplit

import requests
from playwright.sync_api import sync_playwright

DEX_API_PAIR = "https://api.dexscreener.com/latest/dex/pairs/{chain}/{pair_address}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "ds-output")
DEFAULT_OUTPUT_CSV = os.path.join(DEFAULT_OUTPUT_DIR, "trending-coins.csv")
TRENDING_FETCH_ATTEMPTS = 3
PAIR_RESOLVE_ATTEMPTS = 3
DEXSCREENER_MIN_INTERVAL = 1.1

CSV_DELIMITER = ","

# =============================================================================
# Filters out stablecoins, wrapped/staked assets, major L1/L2s, DEX/CEX governance
# tokens, tokenized stocks/ETFs, and other "real product" tokens so only genuine
# community tokens remain.
# =============================================================================

EXCLUDE_SYMBOLS = {
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
    "BTC",
    "BITCOIN",
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
    "APE",
    "STBL",
    "YAK",
    "OVER",
    "ETHFI",
    "RADIO",
    "DEEP",
    "NS",
    "CETUS",
    "NAVX",
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
    "LINK",
    "PENDLE",
    "STRATEGY",
    "CME",
    "OKB",
    "CRO",
    "FTT",
    "HT",
    "KCS",
    "LEO",
    "GT",
    "HOOD",
    "𝕏",
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
    "TSLR",
    "HBTC",
    "LIT",
    "CLANKER",
    "V4",
    "PRISM",
    "STAX",
    "WOOD",
    "POOLS",
    "LISTED",
    "HOOKR",
    "LOCK",
    "ZFORGE",
    "LEV7",
    "DTF",
    "QUBIT",
    "INDEX",
    "DELTA",
    "NOTE",
    "OPEN",
    "MUSE",
    "RSTR",
    "RKST",
    "UNIHOOD",
    "BAWSAQ",
    "ICOIN",
    "AMC",
    "AI",
    "AU",
    "MOO",
    "PUMP",
    "RSI",
    "BOW",
    "XAUT",
    "XAUT0",
    "PAXG",
}


def is_excluded(symbol):
    if not symbol:
        return False
    return symbol.strip().upper() in EXCLUDE_SYMBOLS


EXCLUDE_NAME_EXACT = {
    "bitcoin",
    "ethereum",
    "binance coin",
    "solana",
    "xrp",
    "cardano",
    "tron",
    "toncoin",
    "avalanche",
    "polygon",
    "fantom",
    "arbitrum",
    "optimism",
    "sui",
    "cosmos",
    "polkadot",
    "near protocol",
    "internet computer",
    "filecoin",
    "hedera",
    "vechain",
    "algorand",
    "multiversx",
    "stellar",
    "litecoin",
    "bitcoin cash",
    "ethereum classic",
    "monero",
    "zcash",
    "aptos",
    "sei",
    "celestia",
    "injective",
    "quant",
    "flow",
    "kava",
    "theta network",
    "apecoin",
    "tether",
    "usd coin",
    "dai",
    "binance usd",
    "trueusd",
    "first digital usd",
    "usde",
    "paypal usd",
    "pax dollar",
    "gemini dollar",
}

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
    return lowered in EXCLUDE_NAME_EXACT or any(
        substr in lowered for substr in EXCLUDE_NAME_SUBSTRINGS
    )


STABLECOIN_NAME_PATTERN = re.compile(
    r"\b(?:stablecoin|[a-z0-9-]+\s+usd|usd\s+coin)\b", re.IGNORECASE
)
GENERIC_TOKEN_NAME_PATTERN = re.compile(r"(?:^|[\s_-])token(?:$|[\s_-])", re.IGNORECASE)


def is_stablecoin_name(name):
    return bool(name) and bool(STABLECOIN_NAME_PATTERN.search(name.strip()))


def is_generic_token_name(name):
    return bool(name) and bool(GENERIC_TOKEN_NAME_PATTERN.search(name.strip()))


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
    "dtf",
    "reserve",
    "governance",
    "utility",
    "dao",
    "game",
    "games",
}

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

DOMAIN_NAME_PATTERN = re.compile(
    r"\b[\w-]+\.(fun|trade|tech|io|xyz|app|finance|exchange|money|network|"
    r"com|org|net|wtf|gg|ai|so|to|sh)\b",
    re.IGNORECASE,
)

DOMAIN_ALLOWLIST = {"github.com", "gitlab.com"}

VERSIONED_NAME_PATTERN = re.compile(r"\bv[2-9]\b", re.IGNORECASE)

LEVERAGED_SYMBOL_PATTERN = re.compile(
    r"(^LEV\d+$)|(\d+X[LS]$)|(X\d+[LS]$)|(\d+(LONG|SHORT)$)", re.IGNORECASE
)

BRIDGED_ASSET_NAME_PATTERN = re.compile(
    r"\(universal\)|\(ccip-bridged\)|\(wormhole\)|\bbridged\b", re.IGNORECASE
)

CORPORATE_SUFFIX_PATTERN = re.compile(
    r"\b(inc|corp|corporation|ltd|llc|plc|nv|sa|ag|holdings|group)\b\.?$",
    re.IGNORECASE,
)

_STABLE_BASE_TICKERS = ("USDC", "USDT", "DAI", "USDE", "BUSD", "TUSD")
_DERIVATIVE_BASE_TICKERS = ("ETH", "BTC", "SOL", "BNB", "AVAX", "MATIC", "ARB", "OP")


def is_stablecoin_derivative(symbol):
    if not symbol:
        return False
    sym = symbol.strip().upper()
    return any(sym.endswith(base) and sym != base for base in _STABLE_BASE_TICKERS)


def is_base_asset_derivative(symbol):
    if not symbol:
        return False
    sym = symbol.strip().upper()
    return any(sym.endswith(base) and sym != base for base in _DERIVATIVE_BASE_TICKERS)


ALLOW_SYMBOLS = set()

_LIVE_TICKER_CACHE = None
LIVE_CHECK_ENABLED = True


def _load_live_ticker_set():
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
        return None
    if sym in _load_live_ticker_set():
        return f"live-ticker-match:{sym}"
    return None


def _words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def heuristic_reason(name, symbol):
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


LEVERAGED_PRODUCT_PATTERN = re.compile(r"\d+\s*x\s*(long|short)\b", re.IGNORECASE)


def is_leveraged_product(name):
    return bool(name) and bool(LEVERAGED_PRODUCT_PATTERN.search(name))


MAX_NAME_LENGTH = 80


def is_name_spam(name):
    return bool(name) and len(name.strip()) > MAX_NAME_LENGTH


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
# DEXSCREENER SCRAPING
# =============================================================================

TIMEFRAME_RANK_FIELDS = {
    "m5": "trendingScoreM5",
    "h1": "trendingScoreH1",
    "h6": "trendingScoreH6",
    "h24": "trendingScoreH24",
}

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

EVM_HREF = r"(0x[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?(?::[A-Za-z0-9_-]+)?)"

PAIR_HREF_RE = {
    "ethereum": re.compile(rf"^/ethereum/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "bsc": re.compile(rf"^/bsc/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "polygon": re.compile(rf"^/polygon/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "avalanche": re.compile(rf"^/avalanche/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "arbitrum": re.compile(rf"^/arbitrum/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "base": re.compile(rf"^/base/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "optimism": re.compile(rf"^/optimism/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "fantom": re.compile(rf"^/fantom/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "robinhood": re.compile(rf"^/robinhood/{EVM_HREF}(?:/|\?|#|$)", re.I),
    "sui": re.compile(r"^/sui/(0x[0-9a-fA-F]{1,64})(?:/|\?|#|$)", re.I),
    "solana": re.compile(r"^/solana/([A-Za-z0-9]{32,48})(?:/|\?|#|$)", re.I),
    "tron": re.compile(
        r"^/tron/((?:[Tt][A-Za-z0-9]{33})|(?:41[0-9a-fA-F]{40})|(?:0x[0-9a-fA-F]{40}))(?:/|\?|#|$)",
        re.I,
    ),
    "xrpl": re.compile(
        r"^/xrpl/((?:[0-9A-Fa-f]{40}|[A-Za-z0-9]{2,32})\.r[A-Za-z0-9]{24,40}(?:_[A-Za-z0-9]{2,40})?)"
        r"(?:/|\?|#|$)",
        re.I,
    ),
}


def _pair_slug_from_href(chain: str, href: str) -> str | None:
    if not href:
        return None
    path = urlsplit(href).path or href
    if not path.startswith("/"):
        path = "/" + path
    pat = PAIR_HREF_RE.get(chain)
    if not pat:
        return None
    m = pat.search(path)
    return m.group(1) if m else None


def _collect_pair_from_row(chain: str, row: dict, seen: set, pairs: list) -> None:
    if not isinstance(row, dict):
        return
    row_chain = str(row.get("chainId") or chain).lower()
    if row_chain != chain:
        return
    addr = row.get("pairAddress") or row.get("pair") or row.get("id")
    if not addr:
        url = row.get("url") or ""
        slug = _pair_slug_from_href(chain, url)
        addr = slug
    if not addr:
        return
    addr = str(addr)
    if row_chain != "xrpl" and ":" in addr and not addr.lower().startswith("0x"):
        addr = addr.split(":")[-1]
    key = f"{row_chain}:{addr}".lower()
    if key in seen:
        return
    seen.add(key)
    pairs.append((row_chain, addr))


def scrape_trending_pair_addresses(
    chain: str, limit: int, last: str = "h24"
) -> list[tuple[str, str]]:
    rank_field = TIMEFRAME_RANK_FIELDS[last]
    url = f"https://dexscreener.com/{chain}?rankBy={rank_field}&order=desc"
    pairs: list[tuple[str, str]] = []
    seen: set[str] = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1400, "height": 1800},
        )

        def on_response(resp):
            try:
                ct = (resp.headers.get("content-type") or "").lower()
                if "json" not in ct:
                    return
                data = resp.json()
            except Exception:
                return
            rows = []
            if isinstance(data, dict):
                for key in ("pairs", "results", "data", "items"):
                    val = data.get(key)
                    if isinstance(val, list):
                        rows = val
                        break
                if not rows and isinstance(data.get("pair"), dict):
                    rows = [data["pair"]]
            elif isinstance(data, list):
                rows = data
            for row in rows:
                _collect_pair_from_row(chain, row, seen, pairs)

        page.on("response", on_response)
        page.goto(url, timeout=60000, wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        page.wait_for_timeout(1500)

        if len(pairs) < limit:
            for _ in range(30):
                hrefs = page.eval_on_selector_all(
                    "a[href]",
                    "els => els.map(e => e.getAttribute('href')).filter(Boolean)",
                )
                for href in hrefs:
                    slug = _pair_slug_from_href(chain, href)
                    if not slug:
                        continue
                    key = f"{chain}:{slug}".lower()
                    if key in seen:
                        continue
                    seen.add(key)
                    pairs.append((chain, slug))
                if len(pairs) >= limit:
                    break
                page.evaluate(
                    "window.scrollBy(0, Math.max(window.innerHeight * 0.9, 700))"
                )
                page.wait_for_timeout(400)

        if len(pairs) < 5:
            os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
            page.screenshot(
                path=os.path.join(DEFAULT_OUTPUT_DIR, f"debug-{chain}.png"),
                full_page=True,
            )
            with open(
                os.path.join(DEFAULT_OUTPUT_DIR, f"debug-{chain}.html"),
                "w",
                encoding="utf-8",
            ) as f:
                f.write(page.content())

        browser.close()

    return pairs[:limit]


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
    retryable_statuses = {403, 408, 425, 429, 500, 502, 503, 504}
    url = DEX_API_PAIR.format(
        chain=chain,
        pair_address=quote(pair_address, safe="._-"),
    )

    for attempt in range(1, PAIR_RESOLVE_ATTEMPTS + 1):
        try:
            resp = requests.get(
                url,
                timeout=15,
                headers={"User-Agent": "trending-tokens-script/1.0"},
            )
            if resp.status_code != 200:
                if resp.status_code not in retryable_statuses:
                    return None
                error = f"HTTP {resp.status_code}"
            else:
                data = resp.json()
                if not isinstance(data, dict):
                    pair = None
                else:
                    pair = data.get("pair") or (data.get("pairs") or [None])[0]
                if isinstance(pair, dict):
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
                error = "empty pair response"
        except (requests.RequestException, ValueError) as exc:
            error = str(exc) or exc.__class__.__name__

        if attempt == PAIR_RESOLVE_ATTEMPTS:
            return None
        delay = DEXSCREENER_MIN_INTERVAL * (2 ** (attempt - 1))
        print(f"  Pair resolve failed for {chain}/{pair_address}: {error}.")
        print(f"  Retrying in {delay}s ({attempt + 1}/{PAIR_RESOLVE_ATTEMPTS})...")
        time.sleep(delay)

    return None


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
        relationship = ((pool.get("relationships") or {}).get("base_token") or {}).get(
            "data"
        ) or {}
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
        default=DEXSCREENER_MIN_INTERVAL,
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
    args.delay = max(args.delay, DEXSCREENER_MIN_INTERVAL)

    global LIVE_CHECK_ENABLED
    LIVE_CHECK_ENABLED = not args.no_live_check

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
                candidates.extend(
                    ("geckoterminal", token, "") for token in gecko_tokens
                )
                print(f"  GeckoTerminal: {len(gecko_tokens)} token(s)")
            except Exception as error:
                if args.chain:
                    raise
                print(f"  Skipping {chain}: {error}")
            continue
        try:
            chain_pairs = scrape_trending_pair_addresses_with_retry(
                chain, args.limit, args.last
            )
            candidates.extend(
                ("dexscreener", c, pair_address) for c, pair_address in chain_pairs
            )
            print(f"  Found {len(chain_pairs)} {chain} candidates")
        except Exception as error:
            if args.chain:
                raise
            print(f"  Skipping {chain}: {error}")
    print(
        f"Found {len(candidates)} trending candidates. Resolving and deduplicating..."
    )

    results = []
    denied = []
    seen_addresses = set()
    seen_symbols = {}
    failed_resolutions = 0
    duplicate_contracts = 0

    for i, (source, candidate, pair_address) in enumerate(candidates, 1):
        if source == "geckoterminal":
            info = candidate
            chain = info["chain"]
        else:
            chain = candidate
            info = resolve_pair(chain, pair_address)
        if not info:
            failed_resolutions += 1
            print(f"  [{i}] failed to resolve {chain}/{pair_address or source}")
            time.sleep(args.delay)
            continue

        address = info["contract_address"]
        symbol = info["symbol"]
        name = info["name"]

        address_key = f"{chain}:{(address or '').lower()}"
        if address and address_key in seen_addresses:
            duplicate_contracts += 1
            time.sleep(args.delay)
            continue

        reason = (
            None
            if args.no_filter
            else denial_reason(name, symbol, strict=not args.lenient)
        )

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

    resolved = len(results) + len(denied) + duplicate_contracts
    accounted = resolved + failed_resolutions
    print(
        "\nSummary: "
        f"{len(candidates)} candidates | "
        f"{accounted} accounted | "
        f"{len(results)} saved | "
        f"{len(denied)} denied | "
        f"{duplicate_contracts} duplicate contracts skipped | "
        f"{failed_resolutions} failed resolution"
    )
    if accounted != len(candidates):
        print(
            f"Warning: summary mismatch ({accounted} accounted vs "
            f"{len(candidates)} candidates)."
        )

    if denied:
        write_denied(review_path, denied)
        print(f"Denied {len(denied)} tokens — reasons in {review_path}")
        print("  (skim it for false positives; --lenient turns the heuristics off)")


if __name__ == "__main__":
    main()
