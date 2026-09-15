#!/usr/bin/env python3
"""
trending_tokens_birdeye.py

Top-N trending tokens per chain, via Birdeye's official /defi/token_trending
endpoint (https://docs.birdeye.so/docs/trending-tokens).

WHY BIRDEYE INSTEAD OF DEXSCREENER OR GECKOTERMINAL:
    - DexScreener's site is Cloudflare-protected (403 on plain HTTP), and its
      JSON API has no trending endpoint at all.
    - GeckoTerminal has a real trending endpoint, but its ranking blends
      GeckoTerminal-site engagement into the score.
    - Birdeye's /defi/token_trending is a documented, first-party endpoint
      that both platforms index the same kind of permissionless on-chain
      pools; there's no "corporate vs community" gate on either — the
      difference is which trending formula each one uses.

AUTH:
    Requires a free Birdeye API key (https://birdeye.so -> dashboard).
    Set it as an environment variable rather than hardcoding it:
        export BIRDEYE_API_KEY="your-key-here"

RATE LIMIT:
    Free tier: 60 requests/minute, shared across ALL your API keys combined
    (per Birdeye's dashboard). This script paces at ~50/min to leave margin,
    since providers' stated limits routinely have less real headroom than
    advertised (see: our GeckoTerminal run days ago).

CHAIN COVERAGE:
    There is no --chain flag. Every run fetches the full cross-matched set:
    the wishlist intersected with what Birdeye actually serves, which is
    Ethereum, BNB Smart Chain, Solana, Polygon, Avalanche, Arbitrum, Base,
    Optimism, Sui and Hood.

    Dogecoin, Tron, Fantom, KuCoin Community Chain and XRP Ledger are gone
    from the map — Birdeye has no coverage for any of them, so carrying them
    as None entries only produced a "skipped" line per run.

    Hood is the exception: its slug ("robinhood") is inferred rather than
    documented, but it returns real data, so it is attempted on every run
    regardless of the preflight (FORCE_TRY_SLUGS).

    Each run calls /defi/networks first and skips anything Birdeye has since
    dropped, and prints a note if Birdeye has added a network not in CHAINS.

FLAGS:
    --top 50             tokens per chain (default 100)
    --sort-by liquidity  Birdeye's rank (default), or liquidity/volume24hUSD
    --no-filter          skip the community-token denylist
    --lenient            drop the heuristic tier, keep only exact-match rules
    --no-live-check      skip the live S&P 500 ticker cross-check
    --master FILE        master CSV to merge into (default trending_tokens_master.csv)
    --no-merge           write a standalone timestamped CSV instead of merging
    --prune-master       re-run the denylist over existing master rows and drop hits
    --review-out FILE    write every denied token + its reason to this CSV

PAGE SIZE:
    The API caps `limit` at 20 per call, so top 100 = 5 paginated calls
    per chain (offset 0, 20, 40, 60, 80).

Setup:
    pip install requests
    export BIRDEYE_API_KEY="your-key-here"
    python trending_tokens_birdeye.py

Output:
    trending_tokens_master.csv  — cumulative, one row per (chain, contract).
    columns: chain, token_name, token_symbol, contract_address

    (rank, liquidity_usd, volume_24h_usd, first_seen, last_seen are kept in
    a JSON sidecar next to the master CSV — see state_path_for() — so
    --prune-master/--prune-only can still fully re-evaluate old rows)

    The master file is the point of re-running: each run keys on
    contract_address (lowercased, per chain). Addresses already in the file
    get their rank/liquidity/volume/last_seen refreshed in place; only
    genuinely new contracts are appended. Nothing is ever silently replaced,
    and first_seen is preserved from the run that discovered the token.

    Identity is the contract address, NOT the symbol or name — ticker
    collisions are routine on permissionless chains (this data set has two
    separate MUSE contracts, two SNOPs and two PRISMs), and a token can be
    renamed after deployment while the address stays fixed.

    denied_<timestamp>.csv — every token the filter rejected, with the rule
    that caught it. The denylist below is deliberately over-inclusive, so
    this audit file is how you find false positives and walk them back.
"""

import argparse
import csv
import datetime
import os
import re
import sys
import time

import requests

API_URL = "https://public-api.birdeye.so/defi/token_trending"
TOP_N_PER_CHAIN = 100
PAGE_SIZE = 20  # hard cap enforced by the API
MAX_BACKOFF = 90
REQUEST_TIMEOUT = 20
# 60 rpm is the account-wide ceiling (shared across all your keys, per
# Birdeye's own dashboard note) — 1.3s spacing is ~46/min, leaving margin
# rather than riding the line at 60.
DEFAULT_DELAY = 1.3

# ---------------------------------------------------------------------------
# EXCLUDE_SYMBOLS: a curated denylist, not a real classification.
#
# Birdeye's trending response has no field distinguishing "community" from
# "corporate/infra" tokens — the schema is just address, name, symbol,
# liquidity, volume24hUSD, rank. This list is a hand-maintained best guess
# at stablecoins, wrapped native assets, major L1/L2 tokens, and DEX/CEX
# governance tokens, filtered out by symbol match (case-insensitive).
#
# It will both over- and under-filter: new blue-chip tokens won't be caught
# until you add them, and a community token that happens to reuse a listed
# symbol (rare, but happens with copycat tickers) would be wrongly dropped.
# Edit freely — this is meant to be tuned, not treated as authoritative.
# ---------------------------------------------------------------------------
EXCLUDE_SYMBOLS = {
    # stablecoins
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
    # non-USD fiat stablecoins — same product category as the USD ones
    # above, just missing from the original list. Found un-denied in the
    # master: "Euro Coin" (EUROC), "AllUnity EUR" (EURAU), "EURC" on
    # Optimism, "Monerium EUR emoney" (EURE). Extending to the rest of the
    # known EUR/other-fiat stablecoin family proactively, per "deny when
    # unsure" — these are all real regulated-issuer products, not memes.
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
    "ALETH",  # Alchemix synthetic ETH-backed yield token
    "BNSOL",
    "JITOSOL",
    "CBBTC",  # Coinbase Wrapped BTC — real Coinbase product
    # major L1/L2 base assets (rarely "trend" but occasionally surface)
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
    "ADA",
    "DOGE",
    "TRX",
    "TON",
    "AVAX",
    "MATIC",
    "POL",
    "FTM",
    "ARB",
    "OP",
    "SUI",
    # Additional major L1/L2 base assets, same category as the above —
    # found un-denied in the master ("Internet Computer" ICP on Base/
    # Ethereum, "SEI" on Ethereum, "NEAR" on Solana, "Zcash" ZEC on Solana).
    # Extending the same blue-chip-infra logic to the rest of the top-100
    # cohort that wasn't hardcoded yet, per "deny when unsure": a top L1
    # token appearing on a "trending community tokens" list is far more
    # likely a bridged/wrapped instance of the real asset than a genuine
    # new community project reusing the name.
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
    # ApeCoin — Yuga Labs' ecosystem/governance token (BAYC). Borderline:
    # it also has meme-community energy, but it's fundamentally a
    # corporate-ecosystem governance token like UNI/AAVE below, not a
    # standalone community deploy. Found un-denied on Polygon.
    "APE",
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
    "LINK",  # Chainlink — oracle infra, top-20-market-cap; found un-denied on
    # Ethereum/Base/Polygon/BSC in the master (name is "Chainlink" or
    # "ChainLink Token", so no existing rule caught it)
    "PENDLE",  # Pendle Finance — yield-trading protocol governance token,
    # same category as AAVE/COMP/CRV above; found un-denied on
    # Arbitrum/BSC/Base in the master
    "PONS",  # Pons is one of the DEXs Robinhood Chain trades against — infra, not a meme
    "STRATEGY",  # "Strategy" is the current corporate name of the former MicroStrategy (MSTR)
    "CME",  # matches Chicago Mercantile Exchange's ticker
    # centralized-exchange / corporate chain-native tokens
    "OKB",
    "CRO",
    "FTT",
    "HT",
    "KCS",
    "LEO",
    "GT",
    "HOOD",  # Robinhood Markets' own Nasdaq ticker — the chain's own corporate token
    "𝕏",  # X (Twitter) platform branding
    # -----------------------------------------------------------------------
    # Major public-company / ETF tickers. Robinhood Chain's actual real-world
    # use case is tokenized stocks (per Bitquery: 450+ "Stock Tokens" trade
    # on it), so any of these appearing as a "trending token" is far more
    # likely a genuine tokenized-equity product than a coincidental meme
    # ticker collision. Applied on a precautionary basis: some of these
    # (AMC, GME) are also popular meme-coin tickers in their own right and
    # could wrongly exclude a real community token sharing the name — an
    # accepted tradeoff, per instruction to deny when unsure.
    # -----------------------------------------------------------------------
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
    # -----------------------------------------------------------------------
    # Added after reviewing a full unfiltered Hood run (the 100-row CSV).
    # Each of these got through the original list; each is either a real
    # product/protocol ticker or an established off-chain ticker that a
    # permissionless token happens to reuse. Per "deny when unsure", the
    # collision itself is the reason — we are not trying to adjudicate which
    # deployment is the "real" one.
    # -----------------------------------------------------------------------
    "TSLR",  # Tesla-adjacent ticker; also a live leveraged-TSLA ETF ticker
    "HBTC",  # Huobi BTC — an actual wrapped-BTC product ticker
    "LIT",  # Litentry, and Lighter (zk perp DEX) uses the same shorthand
    "CLANKER",  # Clanker is a token-deployer service with its own token
    "V4",  # reads as Uniswap v4 infra, not a community token
    "PRISM",  # two separate contracts here ("Prism Assets", "Prism Finance")
    "STAX",  # Stax Finance — protocol naming
    "WOOD",  # "Sherwood Protocol"; Sherwood is also Robinhood's media brand
    "POOLS",  # pools.trade — a trading venue, not a token community
    "LISTED",  # "Listed exchange"
    "HOOKR",  # hookr.fun — launchpad-style platform
    "LOCK",  # HoodLock — token-locking service
    "ZFORGE",  # ZECFORGE.tech — tooling product
    "LEV7",  # leverage-product naming convention
    "DTF",  # DTF is Reserve's "decentralized token folio" product class
    "QUBIT",  # Qubit Finance was a real lending protocol
    "INDEX",  # Index Coop's ticker; also generically a basket product
    "DELTA",  # options-greek / Delta Financial collision
    "NOTE",  # Notional Finance's stablecoin ticker
    "OPEN",  # too generic to attribute; OpenLedger uses it
    "MUSE",  # Muse DAO's ticker; appears twice here on two contracts
    "RSTR",  # "Robinhood Hat Strategy" — treasury-vehicle naming
    "RKST",  # "rocket strategy" — same pattern
    "UNIHOOD",  # Uniswap-brand-adjacent; likely a fork/venue, not a meme
    "BAWSAQ",  # exchange naming (GTA joke or not, it reads as a venue)
    "ICOIN",  # generic product-sounding naming
    # Gaps the original list implied but never actually contained, plus
    # commodity/major-ticker collisions. Ticker collision alone is sufficient
    # reason to deny — see the standing-policy note at the end of this set.
    "AMC",  # AMC Entertainment's NYSE ticker (also a popular meme-stock ticker)
    "AI",  # C3.ai's NYSE ticker
    "AU",  # gold; tokenized-gold products use it
    "MOO",  # Beefy Finance's governance token
    "PUMP",  # pump.fun's token
    "RSI",  # a real trading-indicator term, also reused by "relative
    # strength" style structured products
    "BOW",  # Bowhead Specialty Holdings' NYSE ticker (confirmed live)
    # Gold-backed commodity tokens. Found un-denied in the master ("Tether
    # Gold", "Tether Gold Tokens", "PAX Gold") — real, redeemable
    # gold-custody products, same category as the stablecoins above.
    # NOTE: deliberately symbol-only, not name-substring — the master also
    # has plenty of legitimate meme tokens with "Gold" in the name (Golden
    # Dragon, Golden Goose, Gold Reserve, RuneScape Gold, SUI GOLD,
    # Goldfish); a name-substring rule would wrongly deny all of those.
    "XAUT",
    "XAUT0",
    "PAXG",
    # STANDING POLICY: deny on any ticker collision, full stop. A meme-sounding
    # name (e.g. "A Meme Coin" for AMC, "Artificial Inu" for AI) is NOT grounds
    # to remove an entry from this set — the name is exactly what a copycat
    # would pick to look innocent, and "unsure" is a reason to deny, not a
    # reason to reconsider. Do not re-litigate these in a future session.
}


def is_excluded(symbol):
    if not symbol:
        return False
    return symbol.strip().upper() in EXCLUDE_SYMBOLS


# ---------------------------------------------------------------------------
# EXCLUDE_NAME_SUBSTRINGS: same idea as EXCLUDE_SYMBOLS, but for tokens
# identified by their *name* rather than ticker — e.g. official/corporate
# tokens on a chain often have a name containing the chain's own brand
# ("Robinhood Token") rather than a recognizable symbol. Matched as a
# case-insensitive substring of the token name. Add more as you spot them.
# ---------------------------------------------------------------------------
EXCLUDE_NAME_SUBSTRINGS = {
    "robinhood token",
    "ondo tokenized",  # e.g. "Robinhood Markets (Ondo Tokenized)" — real tokenized RWA product
    "xstock",  # tokenized-stock product branding
    "tokenized",  # generic — catches other RWA-product namings beyond xStock/Ondo
    "synthetic",
    "perpetual",
    "wrapped",
    "staked",
    "coinbase",
    "binance",
    "kraken",
    "nasdaq",
    # Additional major CEX brands, same category as coinbase/binance/kraken
    # above — no evidence of a current hit in the master, but this is a
    # coverage gap, not a judgment call: any of these appearing in a
    # trending name is exchange-native branding, not a community project.
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


# ---------------------------------------------------------------------------
# HEURISTIC TIER (skipped with --lenient)
#
# Everything above is an exact/substring match on something specific we
# recognised. This tier is the "deny when unsure" part: word-level patterns
# that indicate a *product* — a protocol, venue, fund, or structured
# instrument — rather than a community token.
#
# This tier WILL produce false positives. A meme can absolutely be called
# "Down to Finance" as a joke. That is the accepted cost of the instruction;
# the denied_<timestamp>.csv audit file exists so those are visible and can
# be walked back by hand, either by editing these sets or by adding the
# symbol to ALLOW_SYMBOLS below.
#
# Matching is on whole words, not raw substrings — a bare `in` test would
# make "note" eat "Notes on a Frog" and "ai" eat "Paired". Word boundaries
# keep the over-filtering to things that actually read as product names.
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
    # Reserve Protocol's "decentralized token folio" product class name.
    # Already an exact-symbol denylist entry (DTF), but found un-denied
    # when it appears as a word in the name with a different ticker:
    # "Reserve Magnificent 7 DTF (Base)", symbol MAG7.
    "dtf",
    # "Reserve" as a standalone product word. Per standing policy (deny
    # when unsure), added even though it re-catches "Gold Reserve" and
    # "TIBBIR Strategic Reserve" — tokens the earlier gold-substring rule
    # deliberately spared. That earlier carve-out weighed avoiding
    # over-filtering the meme "gold" trend; this word-level rule is a
    # separate mechanism and the policy default is to deny, not to
    # preserve past exceptions. If "Gold Reserve" turns out to be a false
    # positive, walk it back via ALLOW_SYMBOLS after checking the audit
    # file, not by removing this word.
    "reserve",
}

# Bare major-company names, no "tokenized"/"stock"/ticker needed to trigger.
# Per standing policy (deny when unsure, better safe than sorry): the vast
# majority of the real tokenized-equity universe is already caught by the
# EXCLUDE_SYMBOLS tickers (AAPL, MSFT, ...) or the "tokenized" substring —
# this tier exists for the residual case where a tokenized-stock deploy uses
# a non-standard symbol but still names itself after the company. Found
# un-denied in the master: "Apple" on BNB Smart Chain, symbol didn't match
# AAPL. Whole-word match, same mechanism as PRODUCT_NAME_WORDS, so "Big
# Apple Coin" or "Pineapple" would also be caught — accepted per policy.
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

# A name that is really a domain ("pools.trade", "ZECFORGE.tech",
# "Hookr.fun", "this is not a website") is a platform advertising itself.
# Note the deliberate omission of nothing here — any TLD-looking suffix
# counts, because the pattern, not the specific TLD, is the signal.
DOMAIN_NAME_PATTERN = re.compile(
    r"\b[\w-]+\.(fun|trade|tech|io|xyz|app|finance|exchange|money|network|"
    r"com|org|net|wtf|gg|ai|so|to|sh)\b",
    re.IGNORECASE,
)

# Carve-out for a specific false-positive class found in the audit file:
# ~19 of 316 denials were tokens named after the exact pattern
# "REPONAME github.com/owner/REPONAME" — a "tokenize a GitHub repo" meme
# trend, not a project advertising its own domain. github.com/gitlab.com
# are dev-platform references, not the token's own branded domain the way
# "pools.trade" or "ZECFORGE.tech" are, so they shouldn't trip this rule.
DOMAIN_ALLOWLIST = {"github.com", "gitlab.com"}

# Versioned naming ("Programmable V4", "Something v3") is how protocols
# label releases. Communities do not ship point releases.
VERSIONED_NAME_PATTERN = re.compile(r"\bv[2-9]\b", re.IGNORECASE)

# Structured/leveraged product tickers: OPENAIX1L, LEV7, BTC3S, ETH2XL.
LEVERAGED_SYMBOL_PATTERN = re.compile(
    r"(^LEV\d+$)|(\d+X[LS]$)|(X\d+[LS]$)|(\d+(LONG|SHORT)$)", re.IGNORECASE
)

# Cross-chain "canonical" bridged-asset naming: "Cardano (Universal)",
# "Stellar (Universal)", "Bittensor (CCIP-Bridged)", "Bitcoin Avalanche
# Bridged (BTC.b)". Same category as "wrapped"/"staked" in
# EXCLUDE_NAME_SUBSTRINGS — a bridge-issued representation of a native
# asset, not a community token — but these use "(Universal)",
# "(...-Bridged)", or the bare word "bridged" instead of "wrapped", so they
# were passing through un-denied. Found un-denied in the master on
# Avalanche/Base with symbols (e.g. "BTC.b") that don't exact-match the
# EXCLUDE_SYMBOLS entries for the underlying asset either.
BRIDGED_ASSET_NAME_PATTERN = re.compile(
    r"\(universal\)|\(ccip-bridged\)|\(wormhole\)|\bbridged\b", re.IGNORECASE
)

# Tickers that are pure stock-ticker shape (3-5 letters) AND appear in a name
# that also mentions a company suffix. Kept narrow on purpose: a blanket
# "any 3-4 letter symbol is a stock" rule would delete most of the chain.
CORPORATE_SUFFIX_PATTERN = re.compile(
    r"\b(inc|corp|corporation|ltd|llc|plc|nv|sa|ag|holdings|group)\b\.?$",
    re.IGNORECASE,
)

# Yield-bearing / liquid-wrapper stablecoin derivatives: a symbol that
# *contains* a known stablecoin ticker but isn't an exact match is a
# wrapped/yield representation of that stablecoin (e.g. "syrupUSDC" —
# Maple Finance's yield-bearing USDC wrapper, found un-denied in the
# master), same category as stETH/cbETH in EXCLUDE_NAME_SUBSTRINGS but for
# stablecoins instead of ETH. Checked against a small core set, not all of
# EXCLUDE_SYMBOLS, to avoid false-triggering on short/generic tickers.
_STABLE_BASE_TICKERS = ("USDC", "USDT", "DAI", "USDE", "BUSD", "TUSD")
_DERIVATIVE_BASE_TICKERS = (
    "ETH",
    "BTC",
    "SOL",
    "BNB",
    "AVAX",
    "MATIC",
    "ARB",
    "OP",
)


def is_stablecoin_derivative(symbol):
    if not symbol:
        return False
    sym = symbol.strip().upper()
    # Suffix match, not substring: real wrapper naming puts the base ticker
    # at the END (syrupUSDC, sDAI, aDAI, cDAI). A substring check instead
    # would wrongly catch unrelated tokens like "DAIFUKU" (a dessert-themed
    # meme, "DAI" is just the first 3 letters) — found as a false positive
    # while testing this rule against the master.
    for base in _STABLE_BASE_TICKERS:
        if sym.endswith(base) and sym != base:
            return True
    return False


def is_base_asset_derivative(symbol):
    """Reject synthetic, wrapped, staked, or yield products named after majors.

    The name-denylist catches explicit product wording. This catches compact
    tickers such as ALETH, WBTC, and BETH without denying the base ticker.
    """
    if not symbol:
        return False
    sym = symbol.strip().upper()
    return any(sym.endswith(base) and sym != base for base in _DERIVATIVE_BASE_TICKERS)


# Escape hatch: anything listed here is kept even if the heuristic tier
# flags it. Use this instead of weakening the rules above when you confirm
# a specific false positive.
ALLOW_SYMBOLS = set()

# ---------------------------------------------------------------------------
# LIVE TICKER CROSS-CHECK (optional 4th tier, on by default)
#
# EXCLUDE_SYMBOLS is hand-maintained and will always lag reality — a new S&P
# 500 addition, a new spot ETF, whatever. Per the standing policy ("deny
# when unsure"), a symbol should not get a free pass just because nobody has
# manually added it to the static set yet. This tier checks the trending
# symbol against a small cached list of major real-world tickers pulled at
# runtime, so genuinely new collisions get caught without waiting for a
# manual edit.
#
# This is intentionally conservative about WHERE it looks (major indices'
# constituents + large-cap crypto, not the entire ticker universe), because
# the failure mode of a too-broad live list is denying real community
# tokens whose 3-4 letter ticker coincidentally matches an obscure
# micro-cap — the static list above already covers the tickers worth
# hardcoding; this tier is for catching the ones that weren't added yet.
# ---------------------------------------------------------------------------
_LIVE_TICKER_CACHE = None
LIVE_CHECK_ENABLED = True  # flipped by --no-live-check in main()


def _load_live_ticker_set():
    """
    Best-effort fetch of major stock/ETF tickers, cached for the process.
    Network failure or missing key just means this tier is skipped for the
    run — it is a supplement to EXCLUDE_SYMBOLS, not a replacement, so a
    failure here should not block the whole script.
    """
    global _LIVE_TICKER_CACHE
    if _LIVE_TICKER_CACHE is not None:
        return _LIVE_TICKER_CACHE
    tickers = set()
    try:
        # Wikipedia's S&P 500 constituent table is stable, free, and doesn't
        # need an API key — good enough for "is this a real large-cap
        # ticker", which is all this tier needs to answer.
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
        return None  # short/alpha-only mirrors real ticker shape; longer or
        # symbol-heavy strings (e.g. "CYBERINU") are not ticker-shaped and
        # produce too many coincidental hits to be worth checking
    if sym in _load_live_ticker_set():
        return f"live-ticker-match:{sym}"
    return None


def _words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def heuristic_reason(name, symbol):
    """Return a short reason string if the heuristic tier rejects, else None."""
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


def denial_reason(name, symbol, strict=True):
    """
    Single entry point. Returns a reason string if the token should be
    denied, or None if it passes. `strict=False` disables the heuristic tier.
    """
    if symbol and symbol.strip().upper() in ALLOW_SYMBOLS:
        return None
    if is_excluded(symbol):
        return "symbol-denylist"
    if is_excluded_by_name(name):
        return "name-denylist"
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


# Leveraged structured products (e.g. "OPENAI 1x Long") track a real
# company or asset with a multiplier — a DeFi financial product, not a
# community meme, even when the name looks casual. Matches "1x Long",
# "3x Short", etc. anywhere in the name, case-insensitive.
LEVERAGED_PRODUCT_PATTERN = re.compile(r"\d+\s*x\s*(long|short)\b", re.IGNORECASE)


def is_leveraged_product(name):
    return bool(name) and bool(LEVERAGED_PRODUCT_PATTERN.search(name))


# Real token names are short. A name running to hundreds of characters is a
# spam pattern — usually dozens of real token names (Bitcoin, USDT, XRP...)
# stuffed together to game search/trending visibility, not a legitimate
# project. Catches that whole category without needing each one named.
MAX_NAME_LENGTH = 80


def is_name_spam(name):
    return bool(name) and len(name.strip()) > MAX_NAME_LENGTH


# Placeholder/junk deploys — someone's test transaction, not a project of
# any kind. Found un-denied in the master ("test token" on Arbitrum).
# Exact-match (not substring) on purpose: a substring rule on "test" would
# wrongly catch real meme names like "Contest Coin" or "Testosterone Inu".
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


# Emoji in the name or symbol. Legitimate community tokens occasionally use
# a single decorative emoji, but a real project doesn't need one to be
# identifiable — its actual signal here is "spam/shitcoin trying to catch
# the eye in a trending list" (🎯🔥😹🎒, etc.), the same pattern as
# is_name_spam/is_junk_name above: an objective, non-judgment-call signal,
# so this runs unconditionally rather than only under --lenient's opposite
# (strict) tier. Ranges cover the actual emoji blocks (pictographs, misc
# symbols, dingbats, misc symbols-and-arrows, misc technical, playing
# cards/mahjong, plus the variation-selector-16 and ZWJ used to join
# multi-codepoint emoji) and deliberately exclude general punctuation
# (U+2000-206F) and geometric shapes (U+25A0-25FF), which would otherwise
# false-positive on ordinary dashes/quotes and on shape glyphs that aren't
# actually used as emoji.
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # emoticons, pictographs, transport, supplemental, mahjong/cards
    "\U00002600-\U000027BF"  # misc symbols + dingbats
    "\U00002B00-\U00002BFF"  # misc symbols and arrows (\u2b50 etc.)
    "\U00002300-\U000023FF"  # misc technical (\u23f0 etc.)
    "\U0000FE0F"  # variation selector-16 (forces emoji presentation)
    "\U0000200D"  # zero-width joiner (combines multi-part emoji)
    "]",
    flags=re.UNICODE,
)


def has_emoji(name, symbol):
    return bool((name and EMOJI_PATTERN.search(name)) or (symbol and EMOJI_PATTERN.search(symbol)))


# ---------------------------------------------------------------------------
# EDIT THIS: label -> Birdeye chain slug. None = not supported by Birdeye.
# ---------------------------------------------------------------------------
NETWORKS_URL = "https://public-api.birdeye.so/defi/networks"

# Cross-matched against Birdeye's /defi/networks response
# (docs.birdeye.so/docs/supported-networks): solana, ethereum, arbitrum,
# avalanche, bsc, optimism, polygon, base, zksync, sui — some responses also
# include monad, megaeth, fogo and aptos. Intersecting that with the 15-chain
# wishlist leaves the 8 EVM/Solana entries below plus Sui. zksync, monad,
# megaeth, fogo and aptos are supported by Birdeye but were not on the
# wishlist, so they are not fetched.
#
# Dropped entirely, because Birdeye has no coverage and a None entry just
# prints a "skipped" line on every run:
#   Dogecoin  — no smart contracts, no DEXs; nothing to index anywhere
#   Tron, Fantom, KuCoin Community Chain, XRP Ledger — absent from /defi/networks
CHAINS = {
    "Ethereum": "ethereum",
    "BNB Smart Chain": "bsc",
    "Solana": "solana",
    "Polygon": "polygon",
    "Avalanche": "avalanche",
    "Arbitrum": "arbitrum",
    "Base": "base",
    "Optimism": "optimism",
    "Sui": "sui",
    # Hood is the one entry NOT on the documented list. The slug "robinhood"
    # is inferred from Birdeye's naming convention, but it demonstrably
    # returns real Hood-chain data, so it stays and is attempted regardless
    # of what the preflight says (see FORCE_TRY_SLUGS).
    "Hood": "robinhood",
}

# Slugs to attempt even when /defi/networks does not list them.
FORCE_TRY_SLUGS = {"robinhood"}


def fetch_supported_slugs(api_key):
    """
    Ask Birdeye which networks it currently serves. Returns a lowercased set,
    or None if the call fails — None means "could not check", which is
    treated as "attempt everything" rather than "skip everything", since a
    transient failure here should not silently empty the whole run.
    """
    payload = get_json(
        NETWORKS_URL, {"accept": "application/json", "X-API-KEY": api_key}, {}
    )
    if not payload:
        return None
    data = payload.get("data")
    if not isinstance(data, list):
        return None
    return {str(slug).strip().lower() for slug in data if slug}


def get_json(url, headers, params, retries=6):
    """GET with backoff on 429. Returns None on give-up."""
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(
                url, headers=headers, params=params, timeout=REQUEST_TIMEOUT
            )
            if resp.status_code == 429:
                wait = min(2**attempt, MAX_BACKOFF)
                print(f"    rate limited, backing off {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            if resp.status_code == 401:
                print("    401 Unauthorized — check BIRDEYE_API_KEY", file=sys.stderr)
                return None
            resp.raise_for_status()
            return resp.json()
        except ValueError:
            print("    response was not valid JSON", file=sys.stderr)
            return None
        except requests.RequestException as e:
            if attempt == retries:
                print(f"    giving up after {retries} attempts: {e}", file=sys.stderr)
                return None
            time.sleep(attempt * 1.5)
    return None


def fetch_trending(
    chain_slug,
    api_key,
    top_n=TOP_N_PER_CHAIN,
    delay=DEFAULT_DELAY,
    sort_by="rank",
    filter_denylist=True,
    strict=True,
    denied_out=None,
    max_pages=25,
):
    """
    Ranked trending tokens for one chain, with EXCLUDE_SYMBOLS filtered out.

    Filtering happens before top_n is checked, so this keeps paginating
    until it actually has top_n *community* tokens (or runs out of pages),
    not top_n raw tokens minus whatever got filtered.
    """
    headers = {
        "accept": "application/json",
        "x-chain": chain_slug,
        "X-API-KEY": api_key,
    }
    rows = []
    seen_addresses = set()
    seen_symbols = {}
    excluded_count = 0

    for page in range(max_pages):
        offset = page * PAGE_SIZE
        payload = get_json(
            API_URL,
            headers,
            {
                "sort_by": sort_by,
                "sort_type": "asc" if sort_by == "rank" else "desc",
                "offset": offset,
                "limit": PAGE_SIZE,
            },
        )
        if payload is None or not payload.get("success"):
            print(
                f"    page at offset {offset} failed — keeping what we have",
                file=sys.stderr,
            )
            break

        tokens = (payload.get("data") or {}).get("tokens") or []
        if not tokens:
            break  # ran out of trending tokens; legitimate, not an error

        for tok in tokens:
            address = tok.get("address")
            symbol = tok.get("symbol")
            name = tok.get("name")
            if not address or address in seen_addresses:
                continue
            reason = (
                denial_reason(name, symbol, strict=strict) if filter_denylist else None
            )
            # Ticker collisions: the trending list is rank-ordered, so the
            # first contract to claim a symbol is the one actually trending.
            # A second contract with the same ticker is, at best, ambiguous —
            # so it goes. Identity stays the address; this only drops the
            # later duplicate from this run, and the earlier one is named in
            # the audit file so the pair is easy to inspect.
            key = (symbol or "").strip().upper()
            if reason is None and filter_denylist and key and key in seen_symbols:
                reason = f"duplicate-symbol:{seen_symbols[key]}"

            if reason:
                excluded_count += 1
                seen_addresses.add(address)  # still dedupe if it reappears
                if denied_out is not None:
                    denied_out.append(
                        {
                            "token_name": name,
                            "token_symbol": symbol,
                            "contract_address": address,
                            "liquidity_usd": tok.get("liquidity"),
                            "volume_24h_usd": tok.get("volume24hUSD"),
                            "denied_by": reason,
                        }
                    )
                continue
            seen_addresses.add(address)
            if key:
                seen_symbols[key] = address
            rows.append(
                {
                    "rank": len(rows) + 1,
                    "token_name": tok.get("name"),
                    "token_symbol": symbol,
                    "contract_address": address,
                    "liquidity_usd": tok.get("liquidity"),
                    "volume_24h_usd": tok.get("volume24hUSD"),
                }
            )
            if len(rows) >= top_n:
                if excluded_count:
                    print(f"    (filtered out {excluded_count} denylisted tokens)")
                return rows

        if page < max_pages - 1:
            time.sleep(delay)

    if excluded_count:
        print(f"    (filtered out {excluded_count} denylisted tokens)")
    if filter_denylist and len(rows) < top_n:
        print(
            f"    hit {max_pages}-page safety cap before reaching {top_n} "
            f"community tokens — got {len(rows)}",
            file=sys.stderr,
        )
    return rows


DEFAULT_MASTER_CSV = "trending_tokens_master.csv"

MASTER_FIELDS = [
    "chain",
    "token_name",
    "token_symbol",
    "contract_address",
]

# Kept internally (never written to the master CSV) — the rest of what's
# needed to re-run rank/liquidity-aware logic against rows already on disk.
_INTERNAL_FIELDS = [
    "rank",
    "liquidity_usd",
    "volume_24h_usd",
    "first_seen",
    "last_seen",
]

DENIED_FIELDS = [
    "chain",
    "token_name",
    "token_symbol",
    "contract_address",
    "liquidity_usd",
    "volume_24h_usd",
    "denied_by",
]


def master_key(chain, address):
    """Identity is (chain, lowercased address) — never the symbol or name."""
    return (chain or "").strip(), (address or "").strip().lower()


def state_path_for(master_path):
    """The master CSV carries chain/name/symbol/address. The JSON sidecar
    next to it keeps the rest — rank, liquidity, volume, first/last seen —
    so --prune-master and --prune-only can still fully re-evaluate rows
    already on disk without needing a fresh API pull."""
    base, _ = os.path.splitext(master_path)
    return base + ".state.json"


def load_state(master_path):
    """
    {key: full-row-dict}, keyed by (chain, lowercased address). Missing file
    means either a first run, or a master CSV that predates this sidecar —
    either way, returns {} and callers fall back to whatever the CSV itself
    has (chain, token_name, token_symbol, contract_address).
    """
    path = state_path_for(master_path)
    if not os.path.exists(path):
        return {}
    import json

    with open(path, encoding="utf-8") as f:
        try:
            raw = json.load(f)
        except ValueError:
            return {}
    return {tuple(k.split("\x1f")): v for k, v in raw.items()}


def save_state(master_path, state):
    import json

    path = state_path_for(master_path)
    serializable = {f"{k[0]}\x1f{k[1]}": v for k, v in state.items()}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(serializable, f, indent=0)


def load_master(path):
    """
    Load existing rows keyed by (chain, lowercased address), preferring the
    JSON sidecar (full fields, including rank/liquidity/volume/dates) and
    falling back to the plain CSV for anything the sidecar doesn't have —
    e.g. a master file edited by hand, or one from before this sidecar
    existed. token_symbol comes straight off the CSV either way now; older
    master files written before this column existed will just read back as
    "" here, same as before.
    """
    state = load_state(path)
    if not os.path.exists(path):
        return state
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = master_key(row.get("chain"), row.get("contract_address"))
            if not key[1] or key in state:
                continue
            state[key] = {
                "chain": row.get("chain", ""),
                "token_name": row.get("token_name", ""),
                "token_symbol": row.get("token_symbol", ""),
                "contract_address": row.get("contract_address", ""),
                "rank": "",
                "liquidity_usd": "",
                "volume_24h_usd": "",
                "first_seen": "",
                "last_seen": "",
            }
    return state


def merge_rows(existing, fetched):
    """
    Additive merge. Returns (rows, added_count, refreshed_count).

    Known contracts keep their first_seen and get fresh metrics; unknown
    contracts are appended. Rows in the master that this run did not see are
    left exactly as they were — a token dropping off the trending list is not
    evidence it stopped existing, so it is never deleted here.
    """
    today = datetime.date.today().isoformat()
    added = refreshed = 0

    for row in fetched:
        key = master_key(row.get("chain"), row.get("contract_address"))
        if not key[1]:
            continue
        fresh = {
            "chain": row.get("chain", ""),
            "last_seen": today,
            "rank": row.get("rank", ""),
            "token_name": row.get("token_name", ""),
            "token_symbol": row.get("token_symbol", ""),
            "contract_address": row.get("contract_address", ""),
            "liquidity_usd": row.get("liquidity_usd", ""),
            "volume_24h_usd": row.get("volume_24h_usd", ""),
        }
        if key in existing:
            prior = existing[key]
            fresh["first_seen"] = prior.get("first_seen") or ""
            existing[key] = {**prior, **fresh}
            refreshed += 1
        else:
            fresh["first_seen"] = today
            existing[key] = fresh
            added += 1

    ordered = sorted(
        existing.values(),
        key=lambda r: (r.get("chain", ""), _as_float(r.get("rank"))),
    )
    return ordered, added, refreshed


def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("inf")


def write_master(path, rows):
    """Writes chain, token_name, token_symbol, contract_address. Everything
    else (rank, liquidity, volume, first/last seen) is saved separately —
    see save_master_and_state."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MASTER_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in MASTER_FIELDS})


def save_master_and_state(path, rows):
    """rows: iterable of full dicts (chain, token_name, token_symbol,
    contract_address, rank, liquidity_usd, volume_24h_usd, first_seen,
    last_seen). Writes the user-facing CSV (chain/name/symbol/address) plus
    the sidecar that keeps rank/liquidity/volume/dates, so future
    --prune-master/--prune-only runs can fully re-evaluate old rows."""
    rows = list(rows)
    write_master(path, rows)
    state = {master_key(r.get("chain"), r.get("contract_address")): r for r in rows}
    save_state(path, state)


def write_denied(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=DENIED_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in DENIED_FIELDS})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=TOP_N_PER_CHAIN)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    parser.add_argument(
        "--sort-by",
        default="rank",
        choices=["rank", "liquidity", "volume24hUSD"],
        help="Birdeye's own trending rank, or re-sort by liquidity/volume",
    )
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="skip the community-token denylist and include everything",
    )
    parser.add_argument(
        "--no-live-check",
        action="store_true",
        help="skip the live S&P 500 ticker cross-check (no network call to "
        "Wikipedia); the static EXCLUDE_SYMBOLS list still applies",
    )
    parser.add_argument(
        "--lenient",
        action="store_true",
        help="keep only the exact-match denylist; drop the heuristic tier",
    )
    parser.add_argument(
        "--master",
        default=DEFAULT_MASTER_CSV,
        help=f"cumulative CSV to merge into (default: {DEFAULT_MASTER_CSV})",
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="write a standalone timestamped CSV instead of merging into master",
    )
    parser.add_argument(
        "--prune-master",
        action="store_true",
        help="re-run the current denylist over existing master rows and drop hits",
    )
    parser.add_argument(
        "--review-out",
        help="where to write the denied-token audit CSV (default: denied_<ts>.csv)",
    )
    parser.add_argument(
        "--prune-only",
        action="store_true",
        help="clean an existing master CSV against the current denylist and "
        "exit — no API call, no key needed",
    )
    args = parser.parse_args()

    global LIVE_CHECK_ENABLED
    LIVE_CHECK_ENABLED = not args.no_live_check

    if args.prune_only:
        existing = load_master(args.master)
        if not existing:
            print(f"No rows found in {args.master}", file=sys.stderr)
            sys.exit(1)
        keep, dropped = {}, []
        for key, row in existing.items():
            reason = denial_reason(
                row.get("token_name"), row.get("token_symbol"), strict=not args.lenient
            )
            if reason:
                dropped.append({**row, "denied_by": reason})
            else:
                keep[key] = row
        save_master_and_state(args.master, list(keep.values()))
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
        review_path = args.review_out or f"denied_{stamp}.csv"
        if dropped:
            write_denied(review_path, dropped)
        print(
            f"{args.master}: kept {len(keep)}, dropped {len(dropped)}"
            + (f" (reasons in {review_path})" if dropped else "")
        )
        return

    api_key = os.environ.get("BIRDEYE_API_KEY")
    if not api_key:
        print(
            "ERROR: set BIRDEYE_API_KEY as an environment variable first.\n"
            '  export BIRDEYE_API_KEY="your-key-here"',
            file=sys.stderr,
        )
        sys.exit(1)

    rows_out = []
    denied_out = []

    supported = fetch_supported_slugs(api_key)
    if supported is None:
        print("Could not read /defi/networks — attempting every chain anyway.")
        chains_to_fetch = dict(CHAINS)
    else:
        chains_to_fetch = {}
        for name, slug in CHAINS.items():
            if slug in supported or slug in FORCE_TRY_SLUGS:
                chains_to_fetch[name] = slug
            else:
                print(f"[{name}] skipped — '{slug}' not in /defi/networks.")
        new_slugs = supported - set(CHAINS.values())
        if new_slugs:
            print(
                f"Note: Birdeye also serves {', '.join(sorted(new_slugs))} — "
                f"add them to CHAINS if you want them."
            )

    print(f"Fetching {len(chains_to_fetch)} chains: " f"{', '.join(chains_to_fetch)}\n")

    for chain_name, chain_slug in chains_to_fetch.items():
        print(f"[{chain_name} / {chain_slug}] fetching trending tokens...")
        chain_denied = []
        try:
            rows = fetch_trending(
                chain_slug,
                api_key,
                top_n=args.top,
                delay=args.delay,
                sort_by=args.sort_by,
                filter_denylist=not args.no_filter,
                strict=not args.lenient,
                denied_out=chain_denied,
            )
        except Exception as e:
            print(f"  unexpected failure, skipping chain: {e}", file=sys.stderr)
            denied_out.extend({"chain": chain_name, **d} for d in chain_denied)
            continue

        denied_out.extend({"chain": chain_name, **d} for d in chain_denied)

        if not rows:
            print(f"  no trending tokens returned — check the chain slug and key.")
            continue

        for row in rows:
            rows_out.append({"chain": chain_name, **row})

        print(f"  got {len(rows)} tokens.")
        if len(rows) < args.top:
            print(f"  (only {len(rows)}/{args.top} available — using what's there)")

        time.sleep(args.delay)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")

    if denied_out:
        review_path = args.review_out or f"denied_{timestamp}.csv"
        write_denied(review_path, denied_out)
        print(f"\nDenied {len(denied_out)} tokens — reasons in {review_path}")
        print("  (skim it for false positives; --lenient turns the heuristics off)")

    if not rows_out:
        print(
            "\nNothing collected. Check BIRDEYE_API_KEY and network access "
            "to public-api.birdeye.so."
        )
        return

    if args.no_merge:
        out_path = f"trending_tokens_birdeye_{timestamp}.csv"
        today = datetime.date.today().isoformat()
        save_master_and_state(
            out_path,
            [{"first_seen": today, "last_seen": today, **r} for r in rows_out],
        )
        print(f"\nDone. Wrote {len(rows_out)} rows to {out_path}")
        return

    existing = load_master(args.master)
    pruned = 0
    if args.prune_master and not args.no_filter:
        keep = {}
        for key, row in existing.items():
            reason = denial_reason(
                row.get("token_name"),
                row.get("token_symbol"),
                strict=not args.lenient,
            )
            if reason:
                pruned += 1
                denied_out.append({**row, "denied_by": f"pruned:{reason}"})
            else:
                keep[key] = row
        existing = keep

    merged, added, refreshed = merge_rows(existing, rows_out)
    save_master_and_state(args.master, merged)

    print(f"\nDone. {args.master}: {len(merged)} tokens total")
    print(f"  {added} new, {refreshed} refreshed", end="")
    print(f", {pruned} pruned by the current denylist" if pruned else "")
    if args.prune_master and denied_out:
        review_path = args.review_out or f"denied_{timestamp}.csv"
        write_denied(review_path, denied_out)


if __name__ == "__main__":
    main()
