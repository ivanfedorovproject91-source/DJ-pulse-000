"""Ticketmaster Discovery API — предстоящие электронные события. Нужен бесплатный ключ (TICKETMASTER_API_KEY).

Честные границы: это только то, что продаётся через Ticketmaster и его партнёров. Охват
сильный в США, Канаде, Великобритании, Европе; России и многих клубных сцен там практически нет.
Без ключа источник отключён, события не выдумываются.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from ..http import Http

URL = "https://app.ticketmaster.com/discovery/v2/events.json"


def upcoming_events(http: Http, key: str, today: date, days: int = 60, pages: int = 3) -> list[dict]:
    out: list[dict] = []
    for page in range(pages):
        d = http.get(URL, {
            "apikey": key, "classificationName": "electronic", "size": 100, "page": page, "sort": "date,asc",
            "startDateTime": f"{today.isoformat()}T00:00:00Z",
            "endDateTime": f"{(today + timedelta(days=days)).isoformat()}T23:59:59Z",
        }) or {}
        evs = (d.get("_embedded") or {}).get("events") or []
        for e in evs:
            day = ((e.get("dates") or {}).get("start") or {}).get("localDate") or ""
            if not (e.get("id") and e.get("name") and e.get("url") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", day)):
                continue
            v = ((e.get("_embedded") or {}).get("venues") or [{}])[0]
            cls = (e.get("classifications") or [{}])[0]
            out.append({
                "id": e["id"], "name": e["name"], "date": day, "url": e["url"],
                "venue": v.get("name"), "city": (v.get("city") or {}).get("name"),
                "country": (v.get("country") or {}).get("countryCode"),
                "genre": (cls.get("genre") or {}).get("name"), "subgenre": (cls.get("subGenre") or {}).get("name"),
            })
        if len(evs) < 100:
            break
    seen, uniq = set(), []
    for e in sorted(out, key=lambda x: x["date"]):
        if e["id"] not in seen:
            seen.add(e["id"]); uniq.append(e)
    return uniq
