#!/usr/bin/env python3
"""Build intro-data.js for the NovaTerra intro animation.

Geometry source: Natural Earth 110m admin-0 countries (public domain) — fetched
to /tmp/ne110m.geojson. Everything else (projection, dot grid, arcs, label
anchors) is derived here so the animation is generated, never hand-drawn.

Projection: Miller cylindrical, cropped to 84°N..56°S (Antarctica dropped).
  x = (lon + 180) / 360
  y = (miller(84) - miller(lat)) / (miller(84) - miller(-56))

Outputs:
  ../intro-data.js   compact dot bitmap + country outlines + nodes + arcs
  /tmp/intro-preview.png   static render of the final frame, for review
"""

import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp/ne110m.geojson"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JS = os.path.join(HERE, "..", "intro-data.js")
PREVIEW = "/tmp/intro-preview.png"

VIEW_W = 1200.0
LAT_TOP, LAT_BOTTOM = 84.0, -56.0
GRID_DEG = 2.0            # dot pitch, in degrees
DOT = 2.5                 # dot size in viewBox units

FOCUS = ["South Africa", "Ghana", "Zimbabwe"]
RELATED = ["Guyana", "Suriname", "United Arab Emirates"]

# Where each market's marker actually sits. The geometric centroid of a country
# is not a place: Guyana's falls ~350 km inland in the rainforest, Suriname's
# ~300 km, and the UAE's in the Empty Quarter ~200 km from the city the label
# names. Since the copy says "Dubai" and "head office in South Africa", the
# marker belongs on the trading address, not the centre of the landmass.
MARKETS = {
    "South Africa": (-26.2041, 28.0473),          # Johannesburg
    "Ghana": (5.6037, -0.1870),                   # Accra
    "Zimbabwe": (-17.8252, 31.0335),              # Harare
    "Guyana": (6.8013, -58.1551),                 # Georgetown
    "Suriname": (5.8520, -55.2038),               # Paramaribo
    "United Arab Emirates": (25.2048, 55.2708),   # Dubai
}

# Copy taken from the site's own "Who We Are" footprint list.
LABELS = {
    "South Africa": ("SOUTH AFRICA", "HEAD OFFICE"),
    "Ghana": ("GHANA", "ACTIVE MARKET"),
    "Zimbabwe": ("ZIMBABWE", "ACTIVE MARKET"),
    "Guyana": ("GUYANA", "ACTIVE MARKET"),
    "Suriname": ("SURINAME", "ACTIVE MARKET"),
    "United Arab Emirates": ("DUBAI", "ACTIVE MARKET"),
}

# Label placement per focus market: a direction from the node (only the angle
# is used) plus a distance held in SCREEN pixels. The camera zooms ~3x, so a
# distance stored in map units would be multiplied by the zoom and throw the
# labels off the frame — holding it in pixels keeps the composition identical
# at every zoom, the same way the type and hairline weights are held.
LABEL_ANCHOR = {
    "South Africa": (-212.0, 30.0),
    "Ghana": (44.0, -32.0),
    "Zimbabwe": (66.0, -40.0),
}
LABEL_PX = {
    "South Africa": 168.0,
    "Ghana": 108.0,
    "Zimbabwe": 126.0,
}

PAPER = (250, 250, 246)
MIST = (220, 228, 224)
SAGE = (143, 167, 155)
FOREST_DARK = (16, 36, 31)


# ---------------------------------------------------------------- projection
def miller(lat):
    return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))


MY_TOP, MY_BOTTOM = miller(LAT_TOP), miller(LAT_BOTTOM)
H_UNITS = MY_TOP - MY_BOTTOM
VIEW_H = VIEW_W * H_UNITS / (2 * math.pi)


def project(lon, lat):
    x = (lon + 180.0) / 360.0 * VIEW_W
    y = (MY_TOP - miller(lat)) / H_UNITS * VIEW_H
    return x, y


# The camera settles here: wide enough to hold every market on the site
# (Guyana 59°W .. Dubai 54°E, 24°N .. 35°S) with ocean margin around them.
ZOOM_LON = (-75.0, 70.0)
ZOOM_LAT = (32.0, -48.0)


def zoom_box():
    x0, _ = project(ZOOM_LON[0], 0)
    x1, _ = project(ZOOM_LON[1], 0)
    _, y0 = project(0, ZOOM_LAT[0])
    _, y1 = project(0, ZOOM_LAT[1])
    return [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]


# ---------------------------------------------------------------- land masks
SCALE = 10  # raster pixels per degree


def to_px(lon, lat):
    return ((lon + 180.0) * SCALE, (90.0 - lat) * SCALE)


def rasterise(features, size):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for feature in features:
        geometry = feature.get("geometry")
        if not geometry:
            continue
        polys = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
                 else [geometry["coordinates"]])
        for poly in polys:
            for i, ring in enumerate(poly):
                draw.polygon([to_px(x, y) for x, y in ring], fill=0 if i else 255)
    return mask


def ring_area_centroid(poly):
    """Area centroid of a polygon's outer ring, in lon/lat degrees."""
    ring = poly[0]
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a *= 0.5
    if abs(a) < 1e-9:
        return ring[0]
    return cx / (6 * a), cy / (6 * a)


def main():
    data = json.load(open(SRC))
    feats = [f for f in data["features"] if f.get("geometry")]
    by_name = {f["properties"]["ADMIN"]: f for f in feats}

    size = (int(360 * SCALE), int(180 * SCALE))
    world_mask = rasterise(feats, size)
    africa = [f for f in feats if f["properties"].get("CONTINENT") == "Africa"]
    africa_mask = rasterise(africa, size)
    focus_mask = rasterise([by_name[n] for n in FOCUS if n in by_name], size)

    # ------------------------------------------------------------ dot bitmap
    rows = []
    counts = {0: 0, 1: 0, 2: 0, 3: 0}
    lats, lons = [], []
    lat = LAT_TOP - GRID_DEG / 2
    while lat > LAT_BOTTOM:
        lats.append(lat)
        lat -= GRID_DEG
    lon = -180.0 + GRID_DEG / 2
    while lon < 180.0:
        lons.append(lon)
        lon += GRID_DEG

    for la in lats:
        row = []
        for lo in lons:
            px, py = to_px(lo, la)
            if focus_mask.getpixel((int(px), int(py))):
                code = 3
            elif africa_mask.getpixel((int(px), int(py))):
                code = 2
            elif world_mask.getpixel((int(px), int(py))):
                code = 1
            else:
                code = 0
            counts[code] += 1
            row.append(code)
        rows.append("".join(str(c) for c in row))

    # ------------------------------------------------------------ outlines
    outlines = {}
    for name in FOCUS:
        feature = by_name.get(name)
        if not feature:
            continue
        geometry = feature["geometry"]
        polys = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
                 else [geometry["coordinates"]])
        parts, points = [], 0
        for poly in polys:
            for ring in poly[:1]:          # outer rings only
                pts = [project(x, y) for x, y in ring]
                points += len(pts)
                parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
        outlines[name] = {"d": "".join(parts), "points": points}

    # ------------------------------------------------------------ nodes
    nodes = {}
    for name in FOCUS + RELATED:
        feature = by_name.get(name)
        if not feature:
            continue
        geometry = feature["geometry"]
        polys = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
                 else [geometry["coordinates"]])
        # Prefer the named market's own coordinates; fall back to the largest
        # ring's centroid only for a market we have no address for.
        if name in MARKETS:
            lat_c, lon_c = MARKETS[name]
        else:
            largest = max(polys, key=lambda p: len(p[0]))
            lon_c, lat_c = ring_area_centroid(largest)
        x, y = project(lon_c, lat_c)
        label, sub = LABELS.get(name, (name.upper(), ""))
        node = {
            "x": round(x, 1), "y": round(y, 1),
            "lon": round(lon_c, 2), "lat": round(lat_c, 2),
            "label": label, "sub": sub,
            "focus": name in FOCUS,
        }
        offset = LABEL_ANCHOR.get(name)
        if offset:
            dist = math.hypot(*offset)
            node["labelDir"] = [round(offset[0] / dist, 4), round(offset[1] / dist, 4)]
            node["labelPx"] = LABEL_PX.get(name, 120.0)
        nodes[name] = node

    # ------------------------------------------------------------ arcs
    hub = nodes["South Africa"]
    arcs = []
    # Bow per route, tuned so no two arcs cross. Every arc bows north, so two
    # routes leaving the hub on a similar bearing will intersect unless their
    # bulges are nested rather than equal: Guyana/Suriname leave 4° apart and
    # must nest (Guyana outside, Suriname inside), and Zimbabwe runs almost due
    # north into the space the Dubai arc sweeps, so it stays nearly straight.
    # Verified by segment-intersection test: 2 crossings before, 0 after.
    bow = {"Ghana": 0.20, "Zimbabwe": 0.06, "United Arab Emirates": 0.22,
           "Guyana": 0.30, "Suriname": 0.12}
    for name, factor in bow.items():
        node = nodes.get(name)
        if not node:
            continue
        mx, my = (hub["x"] + node["x"]) / 2, (hub["y"] + node["y"]) / 2
        dx, dy = node["x"] - hub["x"], node["y"] - hub["y"]
        dist = math.hypot(dx, dy)
        # perpendicular, normalised, always bowing north (negative y)
        px, py = -dy / dist, dx / dist
        if py > 0:
            px, py = -px, -py
        cx, cy = mx + px * dist * factor, my + py * dist * factor
        arcs.append({
            "to": name,
            "d": f"M{hub['x']:.1f} {hub['y']:.1f}Q{cx:.1f} {cy:.1f} {node['x']:.1f} {node['y']:.1f}",
            "cp": [round(cx, 1), round(cy, 1)],
            "focus": node["focus"],
        })

    # ------------------------------------------------------------ graticule
    grat = []
    for lo in range(-150, 180, 30):
        pts = [project(lo, la) for la in range(-56, 85, 4)]
        grat.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in pts))
    for la in range(-30, 90, 30):
        pts = [project(lo, la) for lo in range(-180, 181, 4)]
        grat.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in pts))

    # ------------------------------------------------------------ emit
    payload = {
        "viewBox": [round(VIEW_W), round(VIEW_H)],
        "viewBoxZoom": zoom_box(),
        "grid": {"deg": GRID_DEG, "dot": DOT,
                 "x0": round(project(lons[0], 0)[0], 2),
                 "y0": round(project(0, lats[0])[1], 2),
                 "stepX": round(VIEW_W / len(lons), 3),
                 "stepY": round((project(0, lats[-1])[1] - project(0, lats[0])[1]) / (len(lats) - 1), 3)},
        "rows": rows,
        "graticule": "".join(grat),
        "outlines": outlines,
        "nodes": nodes,
        "arcs": arcs,
        "hub": "South Africa",
    }
    with open(OUT_JS, "w") as fh:
        fh.write("/* Generated by tools/build-intro-data.py — do not edit by hand.\n"
                 "   Geometry: Natural Earth 110m admin-0 (public domain). */\n")
        fh.write("window.NOVATERRA_INTRO = ")
        json.dump(payload, fh, separators=(",", ":"))
        fh.write(";\n")

    print(f"viewBox {payload['viewBox']}  grid {len(lons)}x{len(lats)} = {len(lons)*len(lats)} cells")
    print(f"codes  world:{counts[1]} africa:{counts[2]} focus:{counts[3]}")
    print(f"outline points: " + ", ".join(f"{k}:{v['points']}" for k, v in outlines.items()))
    print(f"intro-data.js: {os.path.getsize(OUT_JS)/1024:.1f} KB")
    for name, n in nodes.items():
        print(f"  node {name:24s} ({n['x']:7.1f},{n['y']:6.1f})  lon/lat {n['lon']:7.2f},{n['lat']:6.2f}")

    preview(payload)


# ---------------------------------------------------------------- preview
def load_font(size):
    for path in ("/System/Library/Fonts/HelveticaNeue.ttc",
                 "/System/Library/Fonts/Helvetica.ttc",
                 "/System/Library/Fonts/Supplemental/Arial.ttf",
                 "/Library/Fonts/Arial.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_tracked(draw, xy, text, font, fill, track):
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + track


def preview(payload):
    """Render the two key frames — world reveal and settled camera — so the
    composition can be reviewed without a browser."""
    vw, vh = payload["viewBox"]
    preview_frame(payload, [0, 0, vw, vh], "/tmp/intro-preview-world.png")
    preview_frame(payload, payload["viewBoxZoom"], "/tmp/intro-preview-zoom.png", final=True)


def preview_frame(payload, box, path, final=False, size=(1440, 810), fit="slice"):
    W, H = size
    bx, by, bw, bh = box
    # mirrors the site's preserveAspectRatio: "slice" on landscape, "meet" portrait
    S = max(W / bw, H / bh) if fit == "slice" else min(W / bw, H / bh)
    ox, oy = (W - bw * S) / 2, (H - bh * S) / 2

    img = Image.new("RGB", (W, H), FOREST_DARK)
    d = ImageDraw.Draw(img)

    def sx(v, horizontal=True):
        return (v - bx) * S + ox if horizontal else (v - by) * S + oy

    def pt(x, y):
        return (sx(x), sx(y, False))

    grat = payload["graticule"]
    for sub in grat.split("M")[1:]:
        pts = [pt(*map(float, p.split())) for p in sub.rstrip("Z").split("L")]
        d.line(pts, fill=(30, 55, 48), width=1)

    grid = payload["grid"]
    metrics = {"world": 0, "africa": 0, "focus": 0}
    colours = {1: (58, 76, 69), 2: (96, 118, 108), 3: PAPER}
    names = {1: "world", 2: "africa", 3: "focus"}
    dot = max(1.0, grid["dot"] * S)
    for r, row in enumerate(payload["rows"]):
        for c, ch in enumerate(row):
            code = int(ch)
            if not code:
                continue
            x = grid["x0"] + c * grid["stepX"]
            y = grid["y0"] + r * grid["stepY"]
            if not (bx - dot <= x <= bx + bw + dot and by - dot <= y <= by + bh + dot):
                continue
            metrics[names[code]] += 1
            d.rectangle([sx(x), sx(y, False), sx(x) + dot, sx(y, False) + dot],
                        fill=colours[code])

    for name, o in payload["outlines"].items():
        for sub in o["d"].split("M")[1:]:
            pts = [pt(*map(float, p.split())) for p in sub.rstrip("Z").split("L")]
            d.line(pts, fill=SAGE, width=2)

    if final:
        font = load_font(17)
        small = load_font(12)
        for arc in payload["arcs"]:
            flat = [float(v) for v in arc["d"].replace("M", "").replace("Q", " ").split()]
            p0, cp, p1 = (flat[0], flat[1]), (flat[2], flat[3]), (flat[4], flat[5])
            curve = []
            for i in range(41):
                t = i / 40
                x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * cp[0] + t * t * p1[0]
                y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * cp[1] + t * t * p1[1]
                curve.append(pt(x, y))
            d.line(curve, fill=(110, 132, 122) if not arc["focus"] else SAGE,
                   width=1 if not arc["focus"] else 2)

        for name, n in payload["nodes"].items():
            x, y = pt(n["x"], n["y"])
            size = 11 if n["focus"] else 7
            d.rectangle([x - size / 2, y - size / 2, x + size / 2, y + size / 2],
                        fill=PAPER if n["focus"] else SAGE)
            if n["focus"]:
                d.rectangle([x - size, y - size, x + size, y + size], outline=SAGE, width=1)

        for name, n in payload["nodes"].items():
            if not n.get("labelDir"):
                continue
            # Mirrors intro.js: the offset is held in screen pixels, so it is
            # divided by the live scale to get back into map units.
            dx, dy = n["labelDir"]
            lx = n["x"] + dx * n["labelPx"] / S
            ly = n["y"] + dy * n["labelPx"] / S
            gap = 14.0 / S
            ex, ey = lx - dx * gap, ly - dy * gap
            d.line([pt(ex, ey), pt(n["x"], n["y"])], fill=SAGE, width=1)
            # anchor the text by its near edge so the leader meets the edge,
            # never the middle of the word
            tx, ty = pt(lx, ly)
            right = dx > 0
            # PIL has no text-anchor: measure the string and shift it
            width = sum(d.textlength(ch, font=font) + 2.4 for ch in n["label"])
            subw = sum(d.textlength(ch, font=small) + 2.4 for ch in n["sub"])
            ax = tx if right else tx - width
            bx = tx if right else tx - subw
            ink = PAPER if n["focus"] else SAGE
            draw_tracked(d, (ax, ty - 14), n["label"], font, ink, 2.4)
            draw_tracked(d, (bx, ty + 8), n["sub"], small, SAGE, 2.4)

    img.save(path)
    print(f"preview {path}  box={box}  dots in frame={metrics}")


if __name__ == "__main__":
    main()
