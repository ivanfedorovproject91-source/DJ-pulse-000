"""Deezer public API — без ключа (лимит ~50 запросов / 5 сек).

Используется только для 30-секундных превью и обложек треков жанра.
"""
from __future__ import annotations

from ..http import Http

BASE = "https://api.deezer.com"


def _norm_name(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def _loose_title(s: str) -> str:
    """Название без скобок и пометок feat./with — «Track (Original Mix)» и «Track» считаем одним треком."""
    import re
    s = re.sub(r"[\(\[].*?[\)\]]", " ", s.lower())
    s = re.split(r"\b(?:feat|ft|featuring|with)\b\.?", s)[0]
    s = re.split(r" - ", s)[0]
    return _norm_name(s)


def find_track(http: Http, artist: str, title: str) -> dict | None:
    """Ищет трек по исполнителю и названию; принимает только совпадение обоих, чтобы не подставить чужую песню.
    Возвращает id трека на Deezer: свежую ссылку на превью приложение берёт по этому id в момент нажатия
    (ссылки в поиске живут считанные минуты, хранить их бессмысленно)."""
    ta, tt = _norm_name(artist), _loose_title(title)
    queries = (f'artist:"{artist}" track:"{title}"', f"{artist} {title}")
    for q in queries:
        data = http.get(f"{BASE}/search", {"q": q, "limit": 10}) or {}
        for t in data.get("data", []):
            if _norm_name((t.get("artist") or {}).get("name", "")) == ta and _loose_title(t.get("title", "")) == tt:
                album = t.get("album") or {}
                return {"deezer_id": t.get("id"), "preview": t.get("preview") or None, "url": t.get("link"),
                        "cover": album.get("cover_medium") or album.get("cover")}
    return None
