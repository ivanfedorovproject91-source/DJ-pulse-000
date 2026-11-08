import json
from datetime import date, timedelta

import pytest

from djpulse import config
from djpulse.collectors import rss
from djpulse.pipeline import Pipeline
from tests.fakes import FakeHttp

TODAY = date(2026, 7, 1)


@pytest.fixture
def dirs(tmp_path, monkeypatch):
    pub, data = tmp_path / "public", tmp_path / "data"
    pub.mkdir(); (data / "cache").mkdir(parents=True); (data / "history").mkdir()
    return pub, data


def run(dirs, http, env=None, today=TODAY):
    pub, data = dirs
    return Pipeline(env if env is not None else {"LASTFM_API_KEY": "k"}, http=http, today=today, public_dir=pub, data_dir=data).run()


def load(dirs, name):
    name = name if name.endswith(".json") else name + ".json"
    return json.loads((dirs[0] / name).read_text(encoding="utf-8"))


def test_full_run_produces_all_files(dirs):
    meta = run(dirs, FakeHttp(TODAY))
    for f in ("meta", "genres", "artists", "tracks", "releases", "news", "countries", "insights", "digest", "sources"):
        assert (dirs[0] / f"{f}.json").exists(), f
    assert meta["demo"] is False
    g = load(dirs, "genres")["items"]
    assert len(g) >= 18
    # Wikipedia-бэкфилл даёт историю сразу → есть Trend Score и изменения за 7/30/90 дней
    deep = next(x for x in g if x["id"] == "deep-house")
    assert deep["score"] is not None and deep["changes"]["d30"] is not None and deep["changes"]["d90"] is not None
    assert len(deep["history"]["wiki"]) > 300


def test_missing_wikipedia_article_is_reported_not_faked(dirs, monkeypatch):
    monkeypatch.setattr(config, "GENRES", config.GENRES + (
        config.Genre("ghost", "Ghost", "global", ("Nonexistent genre",), "ghost", "ghost"),))
    run(dirs, FakeHttp(TODAY))
    ghost = next(x for x in load(dirs, "genres")["items"] if x["id"] == "ghost")
    assert ghost["score"] is None and ghost["status"] == "insufficient"
    assert ghost["history"]["wiki"] == []
    meta = load(dirs, "meta")
    assert any("Ghost" in n for n in meta["notes"])      # пометка, а не сбой источника
    assert not any("Ghost" in e for e in meta["errors"])
    assert meta["status"] == "ok"                          # из-за жанра без статьи статус не «partial»


def test_snapshot_metrics_have_no_growth_on_first_day(dirs):
    run(dirs, FakeHttp(TODAY))
    a = load(dirs, "artists")["items"]
    one = next(x for x in a if x["name"] == "Artist One")
    assert one["metrics"]["lf_listeners"]["value"] == 12345
    # Last.fm — снимок за один день: роста нет, и это None, а не 0
    lf = next(s for s in one["signals"] if s["metric"] == "lf_listeners") if any(s["metric"] == "lf_listeners" for s in one["signals"]) else None
    assert lf is None


def test_snapshot_growth_after_30_days(dirs):
    run(dirs, FakeHttp(TODAY))
    # через 30 дней тот же показатель вырос: подменим историю вручную
    hist_path = dirs[1] / "history" / "history.json"
    h = json.loads(hist_path.read_text(encoding="utf-8"))
    for ent, m in h.items():
        if ent.startswith("artist:") and "lf_listeners" in m:
            (d, v), = m["lf_listeners"].items()
            m["lf_listeners"] = {(TODAY - timedelta(days=30)).isoformat(): v / 1.5, d: v}
    hist_path.write_text(json.dumps(h), encoding="utf-8")
    run(dirs, FakeHttp(TODAY))
    one = next(x for x in load(dirs, "artists")["items"] if x["name"] == "Artist One")
    sig = next(s for s in one["signals"] if s["metric"] == "lf_listeners")
    assert sig["d30"] == 50.0
    assert one["rising"] and "Last.fm" in one["rising"]["sources"]


def test_one_source_down_does_not_block_others(dirs):
    meta = run(dirs, FakeHttp(TODAY, fail_hosts=("api.deezer.com",)))
    sources = load(dirs, "sources.json")
    assert sources["wikipedia"]["status"] == "ok"
    assert sources["lastfm"]["status"] == "ok"
    assert sources.get("deezer", {}).get("status") != "ok"
    assert meta["status"] in ("ok", "partial")
    assert load(dirs, "genres")["items"]  # данные есть


def test_failed_source_keeps_previous_success_date(dirs):
    run(dirs, FakeHttp(TODAY))
    first = load(dirs, "sources.json")["deezer"]["last_success"]
    run(dirs, FakeHttp(TODAY, fail_hosts=("api.deezer.com",)), today=TODAY + timedelta(days=1))
    d = load(dirs, "sources.json")["deezer"]
    assert d["last_success"] == first  # не затёрт
    assert d["status"] == "error"


def test_wikipedia_down_keeps_previous_genres_file(dirs):
    run(dirs, FakeHttp(TODAY))
    before = load(dirs, "genres")["generated_at"]
    meta = run(dirs, FakeHttp(TODAY, fail_hosts=("wikimedia.org", "wikipedia.org")), today=TODAY + timedelta(days=1))
    after = load(dirs, "genres.json")
    assert meta["status"] != "ok"
    assert after["generated_at"] == before  # старый снимок не выдан за новый


def test_no_lastfm_key_disables_source_honestly(dirs):
    run(dirs, FakeHttp(TODAY), env={})
    s = load(dirs, "sources.json")
    assert s["lastfm"]["status"] == "disabled"
    assert s["youtube"]["status"] == "disabled"
    # приложение всё равно получает жанры и чарт Deezer
    assert load(dirs, "genres")["items"] and load(dirs, "tracks")["items"]


def test_russia_artists_have_origin_country_from_musicbrainz(dirs):
    run(dirs, FakeHttp(TODAY))
    a = load(dirs, "artists")["items"]
    ru = [x for x in a if x["country"] == "RU"]
    assert ru and all(x["country_source"] == "MusicBrainz" for x in ru)
    c = next(x for x in load(dirs, "countries")["items"] if x["code"] == "RU")
    assert c["origin"]["n_artists"] == len(ru)
    assert "СЛУШАТЕЛЕЙ" in c["listeners"]["source"]  # география слушателей отдельно от происхождения


def test_incomplete_release_dates_are_dropped(dirs):
    run(dirs, FakeHttp(TODAY))
    r = load(dirs, "releases")["items"]
    assert r and all(len(x["date"]) == 10 for x in r)
    assert not any(x["title"] == "Fuzzy" for x in r)


def test_chart_delta_needs_previous_day(dirs):
    run(dirs, FakeHttp(TODAY))
    t = next(x for x in load(dirs, "tracks")["items"] if x["source"] == "deezer")
    assert t["position_delta"] is None  # вчерашних данных нет → нет «динамики»
    run(dirs, FakeHttp(TODAY), today=TODAY + timedelta(days=1))
    t = next(x for x in load(dirs, "tracks")["items"] if x["source"] == "deezer")
    assert t["position_delta"] == 0 and t["previous_position"] == 1


def test_digest_is_html_safe_and_has_footer(dirs):
    run(dirs, FakeHttp(TODAY))
    d = load(dirs, "digest.json")
    assert d["footer"].startswith("Данные на")
    for text in d["sections"].values():
        assert "<script" not in text


def test_rss_parser_filters_undated_and_unsafe():
    out = rss.fetch_feed(FakeHttp(TODAY), {"id": "x", "name": "X", "url": "https://x/rss"})
    assert [i["title"] for i in out] == ["Big release"]
    assert out[0]["published"].endswith("Z")


def test_rss_rejects_garbage():
    with pytest.raises(Exception):
        rss.parse_feed("<html><not-closed>")


def test_news_only_mode_does_not_touch_trend_meta(dirs):
    run(dirs, FakeHttp(TODAY))
    before = load(dirs, "meta")["generated_at"]
    genres_before = load(dirs, "genres")["generated_at"]
    pub, data = dirs
    res = Pipeline({}, http=FakeHttp(TODAY), today=TODAY, public_dir=pub, data_dir=data).run_news_only()
    assert res["news"] >= 1 and res["releases"] >= 1
    assert load(dirs, "meta")["generated_at"] == before          # дата основных данных не «освежается» задним числом
    assert load(dirs, "genres")["generated_at"] == genres_before


def test_same_musicbrainz_artist_under_two_names_is_merged(dirs, monkeypatch):
    # «Artist One» и алиас «A1» в MusicBrainz — один и тот же mbid → один артист в реестре
    from tests import fakes
    class AliasHttp(fakes.FakeHttp):
        def get(self, url, params=None, **kw):
            if url.endswith("/artist") and "musicbrainz" in url and "country:RU" not in (params or {}).get("query", ""):
                return {"artists": [{"id": "same-mbid", "name": "Artist One", "score": 100}]}
            if "musicbrainz.org/ws/2/artist/mb-ru-1" in url:
                return {"id": "mb-ru-1", "name": "Ruski DJ", "country": "RU", "area": {"name": "Russia"}, "tags": [], "relations": []}
            if "musicbrainz.org/ws/2/artist/same-mbid" in url:
                return {"id": "same-mbid", "name": "Artist One", "country": "RU", "area": {"name": "Russia"}, "tags": [], "relations": []}
            return super().get(url, params, **kw)
    monkeypatch.setattr(fakes, "FakeHttp", AliasHttp)
    run(dirs, AliasHttp(TODAY))
    a = [x for x in load(dirs, "artists")["items"] if x["country"] == "RU"]
    ids = [x["id"] for x in a]
    assert len(ids) == len(set(ids))
    assert sum(1 for x in a if x["name"] == "Artist One") == 1


def test_two_genres_cannot_share_one_wikipedia_article(dirs, monkeypatch):
    first = config.GENRES[0]
    twin = config.Genre("twin", "Twin", "global", first.wiki, "twin", "twin")
    monkeypatch.setattr(config, "GENRES", config.GENRES + (twin,))
    run(dirs, FakeHttp(TODAY))
    items = {x["id"]: x for x in load(dirs, "genres")["items"]}
    assert items["twin"]["score"] is None and items["twin"]["history"]["wiki"] == []
    assert items[first.id]["history"]["wiki"]
    assert any("Twin" in n for n in load(dirs, "meta")["notes"])


def test_genres_have_family_and_digest_brief(dirs):
    run(dirs, FakeHttp(TODAY))
    items = load(dirs, "genres")["items"]
    assert all(g["family"] in config.FAMILIES for g in items)
    d = load(dirs, "digest.json")
    assert "deep-house" in d["genre_brief"] and d["genre_brief"]["deep-house"]["status"]
    assert d["status_changes"] == []


def test_status_change_is_logged(dirs):
    run(dirs, FakeHttp(TODAY))
    gp = dirs[0] / "genres.json"
    g = json.loads(gp.read_text(encoding="utf-8"))
    real = next(x for x in g["items"] if x["id"] == "deep-house")["status"]
    for x in g["items"]:
        if x["id"] == "deep-house":
            x["status"] = "declining" if real != "declining" else "rising"
    gp.write_text(json.dumps(g), encoding="utf-8")
    run(dirs, FakeHttp(TODAY), today=TODAY + timedelta(days=1))
    ch = load(dirs, "digest.json")["status_changes"]
    assert any(c["genre"] == "deep-house" and c["to"] == real for c in ch)
    assert (dirs[1] / "history" / "status_log.json").exists()


def test_lastfm_tracks_get_deezer_preview_only_on_exact_match(dirs):
    run(dirs, FakeHttp(TODAY))
    lf = [t for t in load(dirs, "tracks")["items"] if t["source"] == "lastfm"]
    assert lf and all(t["preview"] == "https://p/song.mp3" for t in lf)   # «Other» с тем же артистом не подошёл
    assert all(t["url"] == "https://last.fm/t" for t in lf)               # ссылка осталась на Last.fm


def test_rss_failure_is_a_note_not_an_error(dirs):
    meta = run(dirs, FakeHttp(TODAY, fail_hosts=("attackmagazine.com",)))
    assert not any("rss" in e.lower() for e in meta["errors"])
    assert any("Attack" in n for n in meta["notes"])


def test_removed_feed_state_is_dropped(dirs):
    run(dirs, FakeHttp(TODAY))
    p = dirs[1] / "cache"
    from djpulse.store import SourceState
    sp = next((dirs[1]).rglob("sources.json"), None) or (dirs[0] / "sources.json")
    d = json.loads(sp.read_text(encoding="utf-8"))
    d["rss:residentadvisor"] = {"status": "error", "message": "HTTP 404", "name": "Resident Advisor"}
    sp.write_text(json.dumps(d), encoding="utf-8")
    run(dirs, FakeHttp(TODAY), today=TODAY + timedelta(days=1))
    assert "rss:residentadvisor" not in load(dirs, "sources.json")


def test_disambiguation_page_is_not_used_as_genre_article(dirs, monkeypatch):
    monkeypatch.setattr(config, "GENRES", config.GENRES + (
        config.Genre("amb", "Ambig", "global", ("Ambiguous genre",), "amb", "amb"),))
    run(dirs, FakeHttp(TODAY))
    g = next(x for x in load(dirs, "genres")["items"] if x["id"] == "amb")
    assert g["history"]["wiki"] == [] and g["wiki_article"] is None
    assert any("Ambig" in n for n in load(dirs, "meta")["notes"])


def test_genre_gets_wikipedia_summary(dirs):
    run(dirs, FakeHttp(TODAY))
    g = next(x for x in load(dirs, "genres")["items"] if x["id"] == "deep-house")
    assert g["summary"] and g["summary"].startswith("Deep house is")
    assert len(g["summary"]) <= 421


def test_labels_come_from_earliest_release_with_label(dirs):
    run(dirs, FakeHttp(TODAY))
    labs = load(dirs, "labels.json")["items"]
    assert labs and labs[0]["name"] == "Deep Records"          # раннее издание, а не «Late Label»
    assert labs[0]["n_releases"] >= 1 and labs[0]["releases"][0]["title"] == "New EP"
    assert "musicbrainz.org/label/lab-1" in labs[0]["url"]
    assert any(r.get("label") for r in load(dirs, "releases.json")["items"])


def test_label_lookups_are_cached(dirs):
    class Counting(FakeHttp):
        n = 0
        def get(self, url, params=None, **kw):
            if url.endswith("/ws/2/release"):
                Counting.n += 1
            return super().get(url, params, **kw)
    run(dirs, Counting(TODAY)); first = Counting.n
    run(dirs, Counting(TODAY), today=TODAY + timedelta(days=1))
    assert first >= 1 and Counting.n == first


def test_events_disabled_without_key_and_loaded_with_key(dirs):
    run(dirs, FakeHttp(TODAY))
    assert load(dirs, "events.json")["items"] == []
    assert load(dirs, "sources.json")["ticketmaster"]["status"] == "disabled"
    run(dirs, FakeHttp(TODAY), env={"LASTFM_API_KEY": "k", "TICKETMASTER_API_KEY": "t"})
    ev = load(dirs, "events.json")["items"]
    assert [e["id"] for e in ev] == ["ev1"]                    # событие без даты отброшено
    assert ev[0]["city"] == "Berlin" and ev[0]["country"] == "DE"


def test_events_source_down_keeps_previous_events(dirs):
    env = {"LASTFM_API_KEY": "k", "TICKETMASTER_API_KEY": "t"}
    run(dirs, FakeHttp(TODAY), env=env)
    run(dirs, FakeHttp(TODAY, fail_hosts=("ticketmaster.com",)), env=env, today=TODAY + timedelta(days=1))
    assert [e["id"] for e in load(dirs, "events.json")["items"]] == ["ev1"]
    assert load(dirs, "sources.json")["ticketmaster"]["status"] == "error"


def test_is_electronic_filters_pop_and_accepts_dance_music():
    from djpulse.pipeline import is_electronic
    assert is_electronic(["deep house", "pop"], False)
    assert is_electronic(["pop", "electronic"], False)
    assert not is_electronic(["pop", "rnb", "soul", "electronic"], False)
    assert not is_electronic(["pop", "rnb", "soul", "seen live", "house"], False)  # единственный электронный тег где-то в хвосте
    assert not is_electronic(["pop", "rnb"], True)
    assert is_electronic([], True) and not is_electronic([], False)
