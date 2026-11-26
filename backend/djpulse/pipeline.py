"""Оркестратор сбора данных DJ PULSE.

Принципы:
* сбой одного источника не останавливает остальные (каждый шаг в try/except);
* при сбое предыдущие данные остаются, а в meta.json виден last_success источника;
* ни одного «придуманного» числа: нет данных → поле None → в интерфейсе «нет данных»;
* история накапливается в data/history/history.json (ежедневные точки).
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import config
from .config import ELECTRONIC_TAGS
from .analytics import insights as insights_mod
from .analytics import trends
from .collectors import deezer, lastfm, musicbrainz, rss, ticketmaster, wikipedia
from .digest import build_digest
from .http import Http, SourceError
from .store import History, SourceState, iso, read_json, utcnow, write_json

SCHEMA_VERSION = 1


def _short(msg: str, n: int = 90) -> str:
    """Сообщение об ошибке без HTML-мусора (страницы 404 приходят целиком)."""
    m = re.match(r"(HTTP \d+ [^:<]*)", msg)
    clean = m.group(1).strip() if m else re.sub(r"<[^>]*>|\s+", " ", msg).strip()
    return clean[:n]


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "artist-" + format(abs(hash(name)) % 10**8, "08d")


def norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def prev_value(series: dict, today: date, max_age: int = 3):
    """Последнее значение строго до today, не старше max_age дней."""
    best = None
    for d, v in series.items():
        dd = date.fromisoformat(d)
        if dd < today and (today - dd).days <= max_age and (best is None or dd > best[0]):
            best = (dd, v)
    return best[1] if best else None


_ELECTRONIC_NORM = frozenset(norm(x) for x in ELECTRONIC_TAGS)


def is_electronic(tags: list[str], from_genre_source: bool) -> bool:
    """Электронный ли артист: по тегам (MusicBrainz + Last.fm). Без тегов — доверяем источнику, из которого он пришёл."""
    if not tags:
        return from_genre_source
    hits = [i for i, t in enumerate(tags) if norm(t) in _ELECTRONIC_NORM]
    return bool(hits) and (hits[0] < 3 or len(hits) >= 2)


class Pipeline:
    def __init__(self, env: dict, http: Http | None = None, today: date | None = None,
                 public_dir: Path | None = None, data_dir: Path | None = None):
        self.env = env
        self.http = http or Http()
        self.today = today or utcnow().date()
        self.public = public_dir or config.PUBLIC_DIR
        data = data_dir or config.DATA_DIR
        self.data_dir = data
        self.cache_dir = data / "cache"
        self.settings = config.SETTINGS
        self.genres = config.load_genres()
        self.hist = History(data / "history" / "history.json", self.settings.history_keep_days)
        self.state = SourceState(self.public / "sources.json")
        self.errors: list[str] = []
        self.notes: list[str] = []   # информационные пометки (не сбои источников)
        self.lf = lastfm.LastFm(self.http, env["LASTFM_API_KEY"]) if env.get("LASTFM_API_KEY") else None
        self.tm_key = env.get("TICKETMASTER_API_KEY")

    # ---------- утилиты ----------
    def _guard(self, sid: str, fn, *a, **kw):
        try:
            res = fn(*a, **kw)
            return res
        except SourceError as exc:
            self.state.fail(sid, _short(str(exc))); self.errors.append(f"{sid}: {_short(str(exc), 160)}")
        except Exception as exc:  # не даём одному источнику уронить остальные
            self.state.fail(sid, f"{type(exc).__name__}: {exc}"); self.errors.append(f"{sid}: {exc}")
        return None

    def _cache(self, name: str) -> dict:
        return read_json(self.cache_dir / name, {})

    def _save_cache(self, name: str, obj: dict) -> None:
        write_json(self.cache_dir / name, obj)

    # ---------- 1. Wikipedia: жанры ----------
    def step_wikipedia_genres(self) -> None:
        titles_cache = self._cache("wiki_titles.json")
        if titles_cache.get("__v") != 2:   # старый кэш создан без проверки страниц-«разветвлений»
            titles_cache = {"__v": 2}
        failures = 0
        resolved: dict[str, str] = {}
        def work():
            nonlocal failures
            need = sorted({c for g in self.genres for c in g.wiki if c not in titles_cache})
            if need:
                titles_cache.update(wikipedia.resolve_titles(self.http, need))
                self._save_cache("wiki_titles.json", titles_cache)
            owners: dict[str, str] = {}
            for g in self.genres:
                title = next((titles_cache[c] for c in g.wiki if titles_cache.get(c)), None)
                if not title:
                    # Нет отдельной статьи — это свойство жанра, а не сбой источника.
                    self.notes.append(f"{g.name}: нет отдельной статьи в Wikipedia — тренд не считается")
                    continue
                if title in owners:
                    # Два жанра не могут делить одну статью: вторая кривая была бы копией первой.
                    self.notes.append(f"{g.name}: статья «{title}» уже занята жанром {owners[title]} — тренд не считается")
                    continue
                owners[title] = g.name
                resolved[g.id] = title
                ent = f"genre:{g.id}"
                start, end = wikipedia.date_window(self.hist.last_day(ent, "wiki"), self.today,
                                                   self.settings.wiki_backfill_days)
                try:
                    self.hist.put_many(ent, "wiki", wikipedia.fetch_daily_views(self.http, title, start, end))
                except SourceError as exc:
                    failures += 1; self.errors.append(f"wikipedia {g.name}: {exc}")
        self._guard("wikipedia", work)
        self.step_genre_summaries(resolved)
        if resolved and failures == 0:
            self.state.ok("wikipedia", extra={"genres_loaded": len(resolved)})
        elif resolved and failures < len(resolved):
            self.state.ok("wikipedia", f"частично: ошибок {failures} из {len(resolved)}",
                          extra={"genres_loaded": len(resolved), "partial": True})
        elif resolved:
            # Не загрузился ни один жанр — это сбой источника, а не «частичный» успех.
            self.state.fail("wikipedia", f"не загрузились данные ни по одному жанру ({failures})")
        self.wiki_genre_titles = resolved

    def step_genre_summaries(self, resolved: dict[str, str]) -> None:
        """Описание жанра — один раз на статью, обновляется раз в ~2 месяца."""
        cache = self._cache("wiki_summaries.json")
        now = utcnow()
        def fresh(e: dict) -> bool:
            try:
                return (now - datetime.fromisoformat(e["at"])).days < 60
            except Exception:
                return False
        fails = 0
        for title in sorted(set(resolved.values())):
            if title in cache and fresh(cache[title]):
                continue
            try:
                cache[title] = {"text": wikipedia.fetch_summary(self.http, title), "at": iso(now)}
            except SourceError:
                fails += 1
                if fails >= 5:
                    break
        self._save_cache("wiki_summaries.json", cache)
        self.genre_summaries = {gid: (cache.get(t) or {}).get("text") for gid, t in resolved.items()}

    # ---------- 2. Last.fm: жанры, артисты, треки ----------
    def step_lastfm_genres(self) -> None:
        self.lf_tag_tracks: dict[str, list[dict]] = {}
        if not self.lf:
            self.state.disabled("lastfm", "ключ LASTFM_API_KEY не задан — источник отключён")
            return
        done = 0
        def work():
            nonlocal done
            for g in self.genres:
                try:
                    info = self.lf.tag_info(g.lastfm_tag)
                    ent = f"genre:{g.id}"
                    self.hist.put(ent, "lf_reach", self.today.isoformat(), info["reach"])
                    self.hist.put(ent, "lf_taggings", self.today.isoformat(), info["taggings"])
                    self.lf_tag_tracks[g.id] = self.lf.tag_top_tracks(g.lastfm_tag, self.settings.tracks_per_tag)
                    done += 1
                except SourceError as exc:
                    self.errors.append(f"lastfm {g.name}: {exc}")
        self._guard("lastfm", work)
        if done:
            self.state.ok("lastfm", None if done == len(self.genres) else f"частично: {done}/{len(self.genres)} жанров",
                          extra={"genres_loaded": done})

    # ---------- 3. Deezer ----------
    def step_deezer_chart(self) -> None:
        self.dz_tracks: list[dict] = []
        def work():
            self.dz_tracks = deezer.chart_tracks(self.http)
            rel = self._cache("dz_release.json")
            for t in self.dz_tracks:
                key = str(t["deezer_id"])
                if key not in rel:
                    try:
                        rel[key] = deezer.track_release_date(self.http, t["deezer_id"]) or ""
                    except SourceError:
                        continue
                t["release_date"] = rel.get(key) or None
            self._save_cache("dz_release.json", rel)
        self._guard("deezer", work)
        if self.dz_tracks:
            self.state.ok("deezer", extra={"tracks": len(self.dz_tracks)})

    def compute_genres(self) -> list[dict]:
        end = self.today - timedelta(days=1)
        daily = {g.id: self.hist.series(f"genre:{g.id}", "wiki") for g in self.genres}
        table = trends.genre_table(daily, end, self.settings.thresholds)
        out = []
        for g in self.genres:
            row = table[g.id]
            lf = self.hist.series(f"genre:{g.id}", "lf_reach")
            lf_growth = trends.snapshot_growth(lf, self.today, 30)
            cutoff = (self.today - timedelta(days=365)).isoformat()
            wiki_hist = sorted((d, v) for d, v in daily[g.id].items() if d >= cutoff)
            out.append({
                "id": g.id, "name": g.name, "family": g.family, "score": row["score"], "level": row["level"],
                "changes": row["changes"], "status": row["status"], "history_days": row["history_days"],
                "signals": {"lastfm_growth_30d": lf_growth,
                            "lastfm_reach": (lf[max(lf)] if lf else None)},
                "history": {"wiki": wiki_hist, "lf_reach": sorted(lf.items())},
                "wiki_article": getattr(self, "wiki_genre_titles", {}).get(g.id),
                "summary": getattr(self, "genre_summaries", {}).get(g.id),
                "sources": ["Wikipedia Pageviews"] + (["Last.fm"] if lf else []),
                "as_of": max(daily[g.id]) if daily[g.id] else None,
            })
        return out

    def compute_tracks(self) -> list[dict]:
        day = self.today.isoformat()
        tracks = []
        for t in getattr(self, "dz_tracks", []):
            tid = f"dz{t['deezer_id']}"
            ent = f"track:{tid}"
            self.hist.put(ent, "chart_pos", day, t["position"])
            prev = prev_value(self.hist.series(ent, "chart_pos"), self.today)
            tracks.append({
                "id": tid, "title": t["title"], "artist": t["artist"], "cover": t["cover"], "url": t["url"],
                "preview": t["preview"], "source": "deezer", "chart": "Deezer · Electro", "genre": None,
                "chart_position": t["position"], "previous_position": prev,
                "position_delta": (prev - t["position"]) if prev else None,
                "release_date": t.get("release_date"), "as_of": day,
                "history": sorted(self.hist.series(ent, "chart_pos").items())[-30:],
            })
        for gid, arr in getattr(self, "lf_tag_tracks", {}).items():
            for t in arr:
                tid = f"lf-{gid}-{slugify(t['title'])}-{slugify(t['artist'])}"[:90]
                ent = f"track:{tid}"
                self.hist.put(ent, f"tag_rank", day, t["rank"])
                prev = prev_value(self.hist.series(ent, "tag_rank"), self.today)
                tracks.append({
                    "id": tid, "title": t["title"], "artist": t["artist"], "cover": None, "url": t["url"], "preview": None,
                    "source": "lastfm", "chart": f"Last.fm · тег", "genre": gid, "chart_position": t["rank"],
                    "previous_position": prev, "position_delta": (prev - t["rank"]) if prev else None,
                    "release_date": None, "as_of": day,
                    "history": sorted(self.hist.series(ent, "tag_rank").items())[-30:],
                })
        return tracks

    def filter_electronic_tracks(self, tracks: list[dict]) -> list[dict]:
        """Теги Last.fm ставят слушатели, поэтому в треки жанра попадает поп-музыка. Оставляем только исполнителей
        с электронными тегами; трек в «Techno» — только от того, кого источники относят к Techno.
        Исполнители проверяются по Last.fm, результат кэшируется. Непроверенные пока не показываем."""
        genre_by_tag: dict[str, str] = {}
        for g in self.genres:
            for tag in (g.lastfm_tag, g.mb_tag, g.name):
                genre_by_tag[norm(tag)] = g.id
        cache = self._cache("track_artist_class.json")
        names: dict[str, str] = {}
        for t in tracks:
            if t["source"] == "lastfm":
                names.setdefault(norm(t["artist"]), t["artist"])
        todo = [k for k in names if k not in cache]
        if self.lf and todo:
            fails = 0
            for k in todo[: self.settings.artist_class_lookups_per_run]:
                try:
                    info = self.lf.artist_info(names[k], None)
                except SourceError:
                    fails += 1
                    if fails >= 8:
                        break
                    continue
                tags = (info or {}).get("tags") or []
                cache[k] = {"el": bool(info) and is_electronic(tags, False),
                            "g": sorted({genre_by_tag[norm(x)] for x in tags if norm(x) in genre_by_tag})}
            self._save_cache("track_artist_class.json", cache)

        def keep(t: dict) -> bool:
            if t["source"] != "lastfm":
                return True
            e = cache.get(norm(t["artist"])) or {}
            return bool(e.get("el")) and (not e.get("g") or t["genre"] in e["g"])
        return [t for t in tracks if keep(t)]

    def enrich_previews(self, tracks: list[dict]) -> None:
        """Треки Last.fm не имеют аудио. Ищем тот же трек на Deezer (строгое совпадение исполнителя
        и названия) и подставляем 30-секундное превью. Ссылки Deezer на превью со временем протухают,
        поэтому кэш считается свежим около суток и обновляется при следующем запуске."""
        cands: dict[str, list[dict]] = {}
        per_genre: dict[str, int] = {}
        for t in sorted((x for x in tracks if x["source"] == "lastfm"), key=lambda x: x["chart_position"]):
            if per_genre.get(t["genre"], 0) >= self.settings.preview_per_genre:
                continue
            per_genre[t["genre"]] = per_genre.get(t["genre"], 0) + 1
            cands.setdefault(f"{norm(t['artist'])}|{norm(t['title'])}", []).append(t)
        if not cands:
            return
        cache = self._cache("track_previews2.json")
        now = utcnow()
        def age_h(e: dict) -> float:
            try:
                return (now - datetime.fromisoformat(e["at"])).total_seconds() / 3600
            except Exception:
                return 1e9
        stale = [k for k in cands if k not in cache or age_h(cache[k]) > (168 if cache[k].get("miss") else 24 * 14)]
        stale.sort(key=lambda k: age_h(cache[k]) if k in cache else 1e10, reverse=True)
        used = fails = 0
        for k in stale[: self.settings.preview_lookups_per_run]:
            t = cands[k][0]
            try:
                found = deezer.find_track(self.http, t["artist"], t["title"])
            except SourceError:
                fails += 1
                if fails >= 5:   # Deezer недоступен — не тратим время
                    break
                continue
            cache[k] = {"at": iso(now), **(found or {"miss": True})}
            used += 1
        for k, arr in cands.items():
            e = cache.get(k)
            if e and e.get("deezer_id") and age_h(e) <= 24 * 30:
                for t in arr:
                    t["preview"] = e.get("preview")
                    t["deezer_id"] = e.get("deezer_id")
                    t["cover"] = t["cover"] or e.get("cover")
        keep = {k: v for k, v in cache.items() if k in cands}
        self._save_cache("track_previews2.json", keep)
        if fails:
            self.notes.append(f"Deezer: не удалось найти превью для части треков ({fails} запросов)")

    def step_releases(self) -> list[dict]:
        out: list[dict] = []
        since = (self.today - timedelta(days=90)).isoformat()
        until = self.today.isoformat()
        prev = read_json(self.public / "releases.json", {}).get("items", [])
        fails = 0
        def work():
            nonlocal fails
            for g in self.genres:
                try:
                    for r in musicbrainz.recent_release_groups(self.http, g.mb_tag, since, until, 15):
                        r["genre"] = g.id
                        out.append(r)
                except SourceError:
                    fails += 1
        self._guard("musicbrainz_releases", work)
        self.state.data.pop("musicbrainz_releases", None)
        if fails == len(self.genres):
            self.errors.append("musicbrainz releases: недоступно, оставлены прошлые данные")
            return prev
        if out:
            self.state.ok("musicbrainz", extra={"releases": len(out)})
        out.sort(key=lambda r: r["date"], reverse=True)
        # один релиз может попасть в несколько жанров — оставляем первое вхождение
        seen, uniq = set(), []
        for r in out:
            if r["mbid"] in seen:
                continue
            seen.add(r["mbid"]); uniq.append(r)
        self.attach_labels(uniq)
        return uniq

    def attach_labels(self, releases: list[dict]) -> None:
        """Лейбл релиза из MusicBrainz. Лейбл у релиза не меняется, поэтому результат кэшируется навсегда;
        за запуск делаем ограниченное число новых запросов (1 запрос/сек)."""
        cache = self._cache("mb_labels.json")
        budget, fails = self.settings.mb_label_lookups_per_run, 0
        for r in releases:
            if r["mbid"] in cache:
                continue
            if budget <= 0 or fails >= 5:
                break
            budget -= 1
            try:
                cache[r["mbid"]] = musicbrainz.release_label(self.http, r["mbid"])
            except SourceError:
                fails += 1
        for r in releases:
            r["label"] = cache.get(r["mbid"])
        if len(cache) > 3000:
            cache = {k: v for k, v in cache.items() if k in {r["mbid"] for r in releases}}
        self._save_cache("mb_labels.json", cache)

    def compute_labels(self, releases: list[dict]) -> list[dict]:
        """Лейблы по выборке свежих релизов MusicBrainz (не по всему рынку): сколько новых релизов, у каких артистов, в каких жанрах."""
        gname = {g.id: g.name for g in self.genres}
        by: dict[str, dict] = {}
        for r in releases:
            lab = r.get("label")
            if not lab:
                continue
            e = by.setdefault(lab["id"], {"id": lab["id"], "name": lab["name"],
                                          "url": f"https://musicbrainz.org/label/{lab['id']}",
                                          "n_releases": 0, "artists": [], "genres": {}, "releases": []})
            e["n_releases"] += 1
            if r["artist"] not in e["artists"]:
                e["artists"].append(r["artist"])
            e["genres"][r["genre"]] = e["genres"].get(r["genre"], 0) + 1
            e["releases"].append({"title": r["title"], "artist": r["artist"], "date": r["date"], "url": r["url"]})
        out = []
        for e in by.values():
            e["artists"] = e["artists"][:6]
            e["releases"] = sorted(e["releases"], key=lambda x: x["date"], reverse=True)[:5]
            e["genres"] = sorted(({"genre": g, "name": gname.get(g, g), "count": n} for g, n in e["genres"].items()),
                                 key=lambda x: -x["count"])[:5]
            out.append(e)
        out.sort(key=lambda e: (-e["n_releases"], e["name"].lower()))
        return out[:60]

    def step_events(self) -> list[dict]:
        if not self.tm_key:
            self.state.disabled("ticketmaster", "ключ TICKETMASTER_API_KEY не задан — события не показываются (необязательный источник)")
            return []
        prev = read_json(self.public / "events.json", {}).get("items", [])
        res = self._guard("ticketmaster", ticketmaster.upcoming_events, self.http, self.tm_key, self.today)
        if res is None:
            return prev       # источник упал — оставляем прошлые события, статус «временно недоступен»
        self.state.ok("ticketmaster", extra={"events": len(res)})
        return res

    def step_news(self) -> list[dict]:
        items, ok = [], 0
        prev = read_json(self.public / "news.json", {}).get("items", [])
        feeds = config.load_feeds()
        for k in [k for k in self.state.data if k.startswith("rss:") and k[4:] not in {f["id"] for f in feeds}]:
            del self.state.data[k]   # лента убрана из списка — не показываем её старую ошибку
        for f in feeds:
            try:
                items += rss.fetch_feed(self.http, f); ok += 1
                self.state.ok(f"rss:{f['id']}", extra={"name": f["name"]})
            except SourceError as exc:
                self.state.fail(f"rss:{f['id']}", _short(str(exc)))
                self.notes.append(f"Лента «{f['name']}» сейчас недоступна — новости из неё не показаны")
                self.state.data[f"rss:{f['id']}"]["name"] = f["name"]
        if not ok:
            return prev
        cutoff = iso(datetime(self.today.year, self.today.month, self.today.day, 23, 59, 59, tzinfo=timezone.utc) - timedelta(days=self.settings.news_max_age_days))
        items = [i for i in items if i["published"] >= cutoff]
        items.sort(key=lambda i: i["published"], reverse=True)
        return items[: self.settings.news_max_items]

    # ---------- смены статусов жанров ----------
    def update_status_log(self, genres: list[dict], prev: dict[str, str]) -> list[dict]:
        """Журнал смен статуса (Rising/Stable/…): нужен персональным уведомлениям.
        Фиксируем только переходы между осмысленными статусами; последние 7 дней уходят в дайджест."""
        path = self.hist.path.parent / "status_log.json"
        log: list[dict] = read_json(path, [])
        if self.state.data.get("wikipedia", {}).get("status") == "ok":
            day = self.today.isoformat()
            for g in genres:
                old = prev.get(g["id"])
                if old and old != "insufficient" and g["status"] != "insufficient" and old != g["status"]:
                    if not any(e["date"] == day and e["genre"] == g["id"] for e in log):
                        log.append({"date": day, "genre": g["id"], "name": g["name"], "from": old, "to": g["status"]})
        cutoff = (self.today - timedelta(days=30)).isoformat()
        log = [e for e in log if e["date"] >= cutoff]
        write_json(path, log, pretty=True)
        recent = (self.today - timedelta(days=7)).isoformat()
        return [e for e in log if e["date"] >= recent]

    # ---------- запуск ----------
    def run_news_only(self) -> dict:
        """Лёгкое частое обновление: только новости (RSS) и новые релизы (MusicBrainz).
        Основные тренды и их дата актуальности (meta.json) не трогаются."""
        news = self.step_news()
        releases = self.step_releases()
        generated = iso(utcnow())
        write_json(self.public / "news.json", {"generated_at": generated, "items": news})
        write_json(self.public / "releases.json", {"generated_at": generated, "items": releases})
        write_json(self.public / "labels.json", {"generated_at": generated, "items": self.compute_labels(releases)})
        self.state.save()
        return {"news": len(news), "releases": len(releases), "errors": self.errors}

    def run(self) -> dict:
        self.wiki_genre_titles = {}
        self.dz_tracks = []
        self.lf_tag_tracks = {}
        self.step_wikipedia_genres()
        self.step_lastfm_genres()
        self.step_deezer_chart()

        prev_status = {g["id"]: g["status"] for g in read_json(self.public / "genres.json", {}).get("items", [])}
        genres = self.compute_genres()
        tracks = self.compute_tracks()
        tracks = self.filter_electronic_tracks(tracks)
        self.enrich_previews(tracks)
        releases = self.step_releases()
        labels = self.compute_labels(releases)
        events = self.step_events()
        news = self.step_news()
        insights = insights_mod.build_insights(genres, tracks, releases, self.today)
        status_changes = self.update_status_log(genres, prev_status)

        # YouTube использовался только для рейтинга артистов, который удалён.
        self.state.data.pop("youtube", None)
        self.hist.prune(self.today)
        self.hist.save()
        self.state.save()

        generated = iso(utcnow())
        crit_ok = self.state.data.get("wikipedia", {}).get("status") == "ok"
        # Разовые сбои отдельных запросов (503 MusicBrainz, один артист в Last.fm) не должны портить общий статус:
        # данные при этом берутся из накопленного кэша. Они остаются видны в заметках и на панели источников.
        soft = [e for e in self.errors if e.startswith("musicbrainz")]
        if soft and len(soft) < 25:
            self.errors = [e for e in self.errors if e not in soft]
            self.notes.extend(soft[:10])
        any_error = bool(self.errors)
        status = "ok" if crit_ok and not any_error else ("partial" if crit_ok or any(
            s.get("status") == "ok" for s in self.state.data.values()) else "failed")
        meta = {
            "schema": SCHEMA_VERSION, "generated_at": generated, "data_date": self.today.isoformat(), "status": status,
            "demo": False, "errors": self.errors[:40], "notes": self.notes[:80],
            "counts": {"genres": len(genres), "tracks": len(tracks),
                       "releases": len(releases), "news": len(news)},
            "history_days_max": max((g["history_days"] for g in genres), default=0),
        }
        w = self.public
        # Не затираем последний успешный снимок, если Wikipedia (основа трендов) не загрузилась
        write_json(w / "meta.json", meta, pretty=True)
        if crit_ok or not (w / "genres.json").exists():
            write_json(w / "genres.json", {"generated_at": generated, "items": genres})
            write_json(w / "insights.json", {"generated_at": generated, **insights})
        write_json(w / "tracks.json", {"generated_at": generated, "items": tracks}) if tracks or not (w / "tracks.json").exists() else None
        write_json(w / "releases.json", {"generated_at": generated, "items": releases})
        write_json(w / "news.json", {"generated_at": generated, "items": news})
        write_json(w / "labels.json", {"generated_at": generated, "items": labels})
        write_json(w / "events.json", {"generated_at": generated, "items": events})
        write_json(w / "digest.json", build_digest(meta, genres, tracks, insights, status_changes))
        return meta
