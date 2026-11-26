"""MusicBrainz — открытые метаданные (CC0), без ключа, лимит 1 запрос/сек.

Даёт: страну ПРОИСХОЖДЕНИЯ артиста, теги, ссылки (Wikidata, YouTube, сайт),
новые релизы по тегам жанров. Теги — пользовательские, поэтому качество фильтра
по жанру ограничено; в интерфейсе это отмечено.
"""
from __future__ import annotations

import re

from ..http import Http

BASE = "https://musicbrainz.org/ws/2"


def _norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def recent_release_groups(http: Http, tag: str, since: str, until: str, limit: int = 25) -> list[dict]:
    q = (f'tag:"{tag}" AND firstreleasedate:[{since} TO {until}] '
         f'AND (primarytype:single OR primarytype:ep OR primarytype:album)')
    data = http.get(f"{BASE}/release-group", {"query": q, "fmt": "json", "limit": limit}) or {}
    out = []
    for r in data.get("release-groups", []):
        credits = r.get("artist-credit") or []
        artist = "".join((c.get("name", "") + c.get("joinphrase", "")) for c in credits).strip()
        date = r.get("first-release-date") or ""
        if not (r.get("id") and r.get("title") and artist and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date)):
            continue  # неполная дата — не показываем «примерный» релиз
        out.append({
            "mbid": r["id"], "title": r["title"], "artist": artist, "date": date,
            "type": r.get("primary-type"),
            "artist_mbid": (credits[0].get("artist") or {}).get("id") if credits else None,
            "url": f"https://musicbrainz.org/release-group/{r['id']}",
        })
    return out


def release_label(http: Http, rg_mbid: str) -> dict | None:
    """Лейбл релиза: берём лейбл из самого раннего издания группы, у которого он указан.
    None — лейбл не указан (самиздат, «[no label]»)."""
    d = http.get(f"{BASE}/release", {"release-group": rg_mbid, "inc": "labels", "fmt": "json", "limit": 25}, ok_404=True) or {}
    rels = sorted(d.get("releases", []), key=lambda r: r.get("date") or "9999")
    for r in rels:
        for li in r.get("label-info") or []:
            lab = li.get("label") or {}
            name = (lab.get("name") or "").strip()
            if lab.get("id") and name and name.lower() != "[no label]":
                return {"id": lab["id"], "name": name}
    return None
