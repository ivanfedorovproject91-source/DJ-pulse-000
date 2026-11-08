"""Статическая конфигурация DJ PULSE.

Здесь только справочники (какие жанры отслеживаем, какие страны и RSS-ленты
опрашиваем). Никаких статистических чисел в конфиге нет — все цифры приходят
из источников данных.

Чтобы добавить новый жанр — добавьте запись в GENRES (или в data/custom_genres.json,
см. README) и запустите обновление: история по нему подтянется автоматически.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
PUBLIC_DIR = DATA_DIR / "public"
HISTORY_DIR = DATA_DIR / "history"
CACHE_DIR = DATA_DIR / "cache"

# Идентифицирующий User-Agent требуют Wikimedia, MusicBrainz и Last.fm.
# В GitHub Actions адрес репозитория подставляется автоматически (переменная DJPULSE_REPO).
USER_AGENT = "DJPulse/1.0 (+%s)" % os.environ.get("DJPULSE_REPO", "https://github.com/YOUR_GITHUB_USER/dj-pulse")


@dataclass(frozen=True)
class Genre:
    id: str
    name: str
    family: str
    # Кандидаты названий статьи в английской Википедии (берётся первая существующая и не занятая другим жанром).
    wiki: tuple[str, ...]
    # Тег в Last.fm (tag.getInfo / tag.getTopArtists / tag.getTopTracks).
    lastfm_tag: str
    # Тег в MusicBrainz для поиска новых релизов.
    mb_tag: str


# Семейства жанров (подписи для интерфейса лежат во frontend/src/services/i18n.tsx).
FAMILIES = ("house", "techno", "trance", "bass", "hard", "disco", "chill", "global")


def _g(gid: str, name: str, family: str, wiki: tuple[str, ...] | None = None, tag: str | None = None) -> Genre:
    t = tag or name.lower()
    return Genre(gid, name, family, wiki or (name,), t, t)


# ВАЖНО: идентификаторы (id) — это ключи истории. Не переименовывайте существующие жанры.
# Если у жанра нет отдельной статьи в Wikipedia, он остаётся в списке со статусом «мало данных»
# (это не ошибка источника). Один и тот же статьёй два жанра владеть не могут.
GENRES: tuple[Genre, ...] = (
    # --- House ---
    _g("house", "House", "house", ("House music",)),
    _g("deep-house", "Deep House", "house", ("Deep house",)),
    _g("tech-house", "Tech House", "house", ("Tech house",)),
    _g("progressive-house", "Progressive House", "house", ("Progressive house",)),
    _g("melodic-house", "Melodic House", "house", ("Melodic house and techno", "Melodic house")),
    _g("organic-house", "Organic House", "house", ("Organic house",)),
    _g("afro-house", "Afro House", "house", ("Afro house",)),
    _g("acid-house", "Acid House", "house", ("Acid house",)),
    _g("chicago-house", "Chicago House", "house", ("Chicago house",)),
    _g("electro-house", "Electro House", "house", ("Electro house",)),
    _g("future-house", "Future House", "house", ("Future house",)),
    _g("bass-house", "Bass House", "house", ("Bass house",)),
    _g("tribal-house", "Tribal House", "house", ("Tribal house",)),
    _g("funky-house", "Funky House", "house", ("Funky house",)),
    _g("french-house", "French House", "house", ("French house",)),
    _g("big-room-house", "Big Room House", "house", ("Big room house",)),
    _g("latin-house", "Latin House", "house", ("Latin house",)),
    _g("brazilian-bass", "Brazilian Bass", "house", ("Brazilian bass",)),
    _g("slap-house", "Slap House", "house", ("Slap house",)),
    _g("minimal-house", "Minimal House", "house", ("Minimal house", "Microhouse"), "minimal house"),
    _g("jackin-house", "Jackin House", "house", ("Jackin house",), "jackin house"),
    _g("garage-house", "Garage House", "house", ("Garage house",), "garage house"),
    _g("soulful-house", "Soulful House", "house", ("Soulful house",), "soulful house"),
    _g("vocal-house", "Vocal House", "house", ("Vocal house",), "vocal house"),
    _g("afro-tech", "Afro Tech", "house", ("Afro tech",), "afro tech"),
    _g("hard-groove", "Hard Groove", "techno", ("Hard groove",), "hard groove"),
    # --- Techno ---
    _g("techno", "Techno", "techno", ("Techno",)),
    _g("melodic-techno", "Melodic Techno", "techno", ("Melodic techno",)),
    _g("hard-techno", "Hard Techno", "techno", ("Hard techno",)),
    _g("minimal-deep-tech", "Minimal / Deep Tech", "techno", ("Minimal techno", "Deep tech"), "minimal techno"),
    _g("detroit-techno", "Detroit Techno", "techno", ("Detroit techno",)),
    _g("industrial-techno", "Industrial Techno", "techno", ("Industrial techno",)),
    _g("dub-techno", "Dub Techno", "techno", ("Dub techno",)),
    _g("schranz", "Schranz", "techno", ("Schranz",)),
    _g("acid-techno", "Acid Techno", "techno", ("Acid techno",)),
    _g("indie-techno", "Indie Techno", "techno", ("Indie techno",), "indie techno"),
    _g("peak-time-techno", "Peak Time Techno", "techno", ("Peak time techno",), "peak time techno"),
    _g("dark-techno", "Dark Techno", "techno", ("Dark techno",), "dark techno"),
    _g("hypnotic-techno", "Hypnotic Techno", "techno", ("Hypnotic techno",), "hypnotic techno"),
    _g("raw-techno", "Raw Techno", "techno", ("Raw techno",), "raw techno"),
    _g("hypertechno", "Hypertechno", "techno", ("Hypertechno",), "hypertechno"),
    _g("ebm", "EBM / Dark Electro", "techno", ("Electronic body music",), "ebm"),
    # --- Trance ---
    _g("trance", "Trance", "trance", ("Trance music",)),
    _g("progressive-trance", "Progressive Trance", "trance", ("Progressive trance",)),
    _g("uplifting-trance", "Uplifting Trance", "trance", ("Uplifting trance",)),
    _g("psytrance", "Psytrance", "trance", ("Psychedelic trance", "Psytrance")),
    _g("goa-trance", "Goa Trance", "trance", ("Goa trance",)),
    _g("hard-trance", "Hard Trance", "trance", ("Hard trance",)),
    _g("vocal-trance", "Vocal Trance", "trance", ("Vocal trance",), "vocal trance"),
    _g("tech-trance", "Tech Trance", "trance", ("Tech trance",), "tech trance"),
    _g("dream-trance", "Dream Trance", "trance", ("Dream trance",), "dream trance"),
    _g("progressive-psytrance", "Progressive Psytrance", "trance", ("Progressive psytrance",), "progressive psytrance"),
    _g("full-on", "Full-On Psytrance", "trance", ("Full-on",), "full on"),
    _g("dark-psytrance", "Dark Psytrance", "trance", ("Dark psytrance",), "dark psytrance"),
    # --- Bass & Breaks ---
    _g("drum-and-bass", "Drum & Bass", "bass", ("Drum and bass",), "drum and bass"),
    _g("liquid-funk", "Liquid Funk", "bass", ("Liquid funk",), "liquid funk"),
    _g("neurofunk", "Neurofunk", "bass", ("Neurofunk",)),
    _g("jungle", "Jungle", "bass", ("Jungle music",), "jungle"),
    _g("dubstep", "Dubstep", "bass", ("Dubstep",)),
    _g("breakbeat", "Breakbeat", "bass", ("Breakbeat",)),
    _g("uk-garage", "UK Garage", "bass", ("UK garage",)),
    _g("two-step", "2-Step Garage", "bass", ("2-step garage",), "2-step"),
    _g("future-garage", "Future Garage", "bass", ("Future garage",)),
    _g("grime", "Grime", "bass", ("Grime (music genre)", "Grime")),
    _g("trap-edm", "Trap (EDM)", "bass", ("Trap (EDM)",), "trap"),
    _g("future-bass", "Future Bass", "bass", ("Future bass",)),
    _g("jump-up", "Jump Up", "bass", ("Jump-up",), "jump up"),
    _g("techstep", "Techstep", "bass", ("Techstep",)),
    _g("darkstep", "Darkstep", "bass", ("Darkstep",)),
    _g("speed-garage", "Speed Garage", "bass", ("Speed garage",), "speed garage"),
    _g("uk-bass", "UK Bass", "bass", ("UK bass",), "uk bass"),
    _g("jersey-club", "Jersey Club", "bass", ("Jersey club",), "jersey club"),
    _g("riddim", "Riddim", "bass", ("Riddim (dubstep)",), "riddim"),
    _g("melodic-dubstep", "Melodic Dubstep", "bass", ("Melodic dubstep",), "melodic dubstep"),
    # --- Hard Dance ---
    _g("hardstyle", "Hardstyle", "hard", ("Hardstyle",)),
    _g("hardcore", "Hardcore / Gabber", "hard", ("Hardcore (electronic music genre)", "Gabber"), "gabber"),
    _g("happy-hardcore", "Happy Hardcore", "hard", ("Happy hardcore",)),
    _g("frenchcore", "Frenchcore", "hard", ("Frenchcore",)),
    _g("rawstyle", "Rawstyle", "hard", ("Rawstyle",)),
    _g("uptempo-hardcore", "Uptempo Hardcore", "hard", ("Uptempo hardcore",), "uptempo hardcore"),
    _g("hard-bounce", "Hard Bounce", "hard", ("Hard bounce",), "hard bounce"),
    _g("hands-up", "Hands Up", "hard", ("Hands up (music)",), "hands up"),
    _g("hard-dance", "Hard Dance", "hard", ("Hard dance",)),
    # --- Disco & Retro ---
    _g("disco", "Disco", "disco", ("Disco",)),
    _g("nu-disco", "Nu-Disco", "disco", ("Nu-disco",), "nu disco"),
    _g("italo-disco", "Italo Disco", "disco", ("Italo disco",)),
    _g("electro", "Electro", "disco", ("Electro (music)",), "electro"),
    _g("electroclash", "Electroclash", "disco", ("Electroclash",)),
    _g("synthwave", "Synthwave", "disco", ("Synthwave",)),
    _g("eurodance", "Eurodance", "disco", ("Eurodance",)),
    _g("vaporwave", "Vaporwave", "disco", ("Vaporwave",)),
    _g("balearic", "Balearic Beat", "disco", ("Balearic beat",), "balearic"),
    _g("space-disco", "Cosmic / Space Disco", "disco", ("Space disco",), "space disco"),
    _g("italo-dance", "Italo Dance", "disco", ("Italo dance",), "italo dance"),
    # --- Downtempo & Experimental ---
    _g("downtempo", "Downtempo", "chill", ("Downtempo",)),
    _g("electronica", "Electronica", "chill", ("Electronica",)),
    _g("ambient", "Ambient", "chill", ("Ambient music",), "ambient"),
    _g("idm", "IDM", "chill", ("Intelligent dance music",), "idm"),
    _g("chillout", "Chillout", "chill", ("Chill-out music",), "chillout"),
    _g("trip-hop", "Trip Hop", "chill", ("Trip hop",)),
    _g("glitch", "Glitch", "chill", ("Glitch (music)",), "glitch"),
    _g("breakcore", "Breakcore", "chill", ("Breakcore",)),
    _g("organic-downtempo", "Organic Downtempo", "chill", ("Organic downtempo",), "organic downtempo"),
    _g("lo-fi-house", "Lo-Fi House", "chill", ("Lo-fi house",), "lo-fi house"),
    _g("leftfield", "Leftfield", "chill", ("Leftfield",)),
    # --- Global & Other ---
    _g("indie-dance", "Indie Dance", "global", ("Indie dance",)),
    _g("amapiano", "Amapiano", "global", ("Amapiano",)),
    _g("gqom", "Gqom", "global", ("Gqom",)),
    _g("baile-funk", "Baile Funk", "global", ("Funk carioca",), "baile funk"),
    _g("phonk", "Phonk", "global", ("Phonk",)),
    _g("drift-phonk", "Drift Phonk", "global", ("Drift phonk",), "drift phonk"),
    _g("afrobeats-dance", "Afro / Tribal Dance", "global", ("Afro tribal",), "afro tribal"),
    _g("hyperpop", "Hyperpop", "global", ("Hyperpop",)),
    _g("psychedelic-bass", "Psychedelic Bass", "global", ("Psychedelic bass",), "psychedelic bass"),
)


def load_genres() -> tuple[Genre, ...]:
    """Базовые жанры + пользовательские из data/custom_genres.json (если файл есть)."""
    extra = DATA_DIR / "custom_genres.json"
    if not extra.exists():
        return GENRES
    try:
        raw = json.loads(extra.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return GENRES
    out = list(GENRES)
    known = {g.id for g in out}
    for item in raw if isinstance(raw, list) else []:
        try:
            gid = str(item["id"])
            if gid in known:
                continue
            out.append(
                Genre(
                    id=gid,
                    name=str(item["name"]),
                    family=str(item.get("family") or "global") if str(item.get("family") or "global") in FAMILIES else "global",
                    wiki=tuple(item.get("wiki") or [item["name"]]),
                    lastfm_tag=str(item.get("lastfm_tag") or item["name"].lower()),
                    mb_tag=str(item.get("mb_tag") or item["name"].lower()),
                )
            )
        except (KeyError, TypeError, AttributeError):
            continue
    return tuple(out)


@dataclass(frozen=True)
class Country:
    code: str  # ISO 3166-1 alpha-2
    name_en: str  # название в формате Last.fm geo.* (английское)
    name_ru: str


# Теги, по которым артист считается электронным. Нужны, чтобы в рейтинг не попадали поп- и хип-хоп-исполнители.
ELECTRONIC_TAGS = frozenset({
    "electronic", "electronica", "edm", "electro", "dj", "house", "techno", "trance", "dubstep",
    "drum and bass", "dnb", "drum n bass", "breaks", "breakbeat", "garage", "idm", "ambient", "downtempo", "chillout",
    "trip hop", "disco", "nu disco", "synthwave", "eurodance", "hardstyle", "hardcore", "gabber", "psytrance", "goa",
    "bass", "future bass", "trap edm", "jungle", "grime", "phonk", "amapiano", "gqom", "baile funk", "glitch", "minimal",
    "deep house", "tech house", "progressive house", "electro house", "big room", "psychedelic trance",
    "dark ambient", "ebm", "vocal trance", "uk garage", "afro house", "melodic techno",
})

COUNTRIES: tuple[Country, ...] = (
    Country("RU", "Russian Federation", "Россия"),
    Country("US", "United States", "США"),
    Country("GB", "United Kingdom", "Великобритания"),
    Country("DE", "Germany", "Германия"),
    Country("NL", "Netherlands", "Нидерланды"),
    Country("FR", "France", "Франция"),
    Country("ES", "Spain", "Испания"),
    Country("IT", "Italy", "Италия"),
    Country("BR", "Brazil", "Бразилия"),
    Country("UA", "Ukraine", "Украина"),
    Country("PL", "Poland", "Польша"),
    Country("TR", "Turkey", "Турция"),
    Country("ZA", "South Africa", "ЮАР"),
)

# RSS музыкальных изданий. Хранятся только заголовок, ссылка, дата и источник —
# текст статей не копируется. Если лента недоступна, источник помечается ошибкой,
# остальные продолжают работать. Адреса можно поменять в data/custom_feeds.json.
RSS_FEEDS: tuple[dict, ...] = (
    {"id": "mixmag", "name": "Mixmag", "url": "https://mixmag.net/rss.xml"},
    {"id": "djmag", "name": "DJ Mag", "url": "https://djmag.com/rss.xml"},
    {"id": "attack", "name": "Attack Magazine", "url": "https://www.attackmagazine.com/feed/"},
)


def load_feeds() -> tuple[dict, ...]:
    extra = DATA_DIR / "custom_feeds.json"
    if not extra.exists():
        return RSS_FEEDS
    try:
        raw = json.loads(extra.read_text(encoding="utf-8"))
        if isinstance(raw, list) and raw:
            return tuple(f for f in raw if isinstance(f, dict) and "url" in f and "id" in f)
    except (OSError, ValueError):
        pass
    return RSS_FEEDS


@dataclass
class Thresholds:
    """Пороги классификации статуса жанра (проценты)."""

    rising_30d: float = 10.0
    declining_30d: float = -10.0
    emerging_30d: float = 25.0
    emerging_max_score: float = 25.0
    min_history_days_for_status: int = 35
    rising_artist_30d: float = 15.0
    rising_artist_min_signals: int = 1
    rising_artist_min_wiki_views: float = 50.0


@dataclass
class Settings:
    thresholds: Thresholds = field(default_factory=Thresholds)
    wiki_backfill_days: int = 365
    history_keep_days: int = 800
    top_artists_per_tag: int = 25
    max_registry_artists: int = 600
    mb_discover_ru_limit: int = 40
    mb_discover_genres_per_run: int = 25   # российские артисты ищутся по части жанров за запуск (по кругу)
    preview_lookups_per_run: int = 1000      # поиск превью на Deezer для треков Last.fm
    preview_per_genre: int = 15
    mb_lookups_per_run: int = 100
    mb_label_lookups_per_run: int = 80
    tracks_per_tag: int = 15
    news_max_items: int = 40
    news_max_age_days: int = 21


SETTINGS = Settings()
