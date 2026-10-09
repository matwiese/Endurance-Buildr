#!/usr/bin/env python3
"""Briefpapier (PDF aus InDesign) in Vektordaten für den PDF-Export umwandeln.

Aufruf:  python3 -I tools/letterhead.py assets/LSA_Briefpapier_2026-07-30-druck.pdf src/letterhead.js

Liest die Zeichenbefehle der Seite (Flächen, Logo-Umrisse; keine Schrift, keine Schnittmarken) und schreibt
  ops  die gefüllten Pfade als PDF-Operatoren (sRGB), Punkt, Ursprung links unten, bezogen auf den Beschnitt (A4)
  svg  dasselbe als SVG (für den Druckdialog, wenn jsPDF nicht erreichbar ist)
  die Fußzeilen-Texte mit Position und die Bereiche, in die Inhalt darf (aus den Formen berechnet).
Das Ergebnis liegt in src/letterhead.js und wird von tools/build.mjs mit in die HTML-Datei gebaut.
"""
import json
import re
import sys

import pypdf

src, out = sys.argv[1], sys.argv[2]
reader = pypdf.PdfReader(src)
page = reader.pages[0]
trim = [float(x) for x in page["/TrimBox"]]
W, H = trim[2] - trim[0], trim[3] - trim[1]
ox, oy = trim[0], trim[1]
stream = page.get_contents().get_data().decode("latin1")

# --- Text, Markierungen und Striche (Schnittmarken) entfernen ---------------------------------------------------
stream = re.sub(r"BT.*?ET", " ", stream, flags=re.S)
stream = re.sub(r"/Artifact\s*<<.*?>>\s*BDC", " ", stream, flags=re.S)
stream = re.sub(r"\bEMC\b", " ", stream)
tokens = re.findall(r"[-+]?\d*\.?\d+|/[A-Za-z0-9_]+|[A-Za-z*'\"]+", stream)

def mul(a, b):  # Matrizen (a b c d e f) hintereinander: erst a, dann b
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])

def apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]

ctm, stack, color, path, cur, shapes = (1, 0, 0, 1, 0, 0), [], None, [], None, []
nums = []
for t in tokens:
    if re.fullmatch(r"[-+]?\d*\.?\d+", t):
        nums.append(float(t)); continue
    op = t
    if op == "q": stack.append((ctm, color))
    elif op == "Q":
        if stack: ctm, color = stack.pop()
    elif op == "cm": ctm = mul(tuple(nums[-6:]), ctm)
    elif op == "scn" and len(nums) >= 4: color = tuple(nums[-4:])
    elif op == "m":
        cur = apply(ctm, nums[-2], nums[-1]); path.append(["m", cur])
    elif op == "l":
        cur = apply(ctm, nums[-2], nums[-1]); path.append(["l", cur])
    elif op == "c":
        p = [apply(ctm, nums[-6], nums[-5]), apply(ctm, nums[-4], nums[-3]), apply(ctm, nums[-2], nums[-1])]
        path.append(["c", *p]); cur = p[2]
    elif op == "re":
        x, y, w, h = nums[-4:]
        pts = [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)]
        path.append(["m", pts[0]]); [path.append(["l", q]) for q in pts[1:]]; path.append(["h"])
    elif op == "h": path.append(["h"])
    elif op in ("f", "F", "f*"):
        if path and color is not None: shapes.append((color, path))
        path = []
    elif op in ("n", "S", "s", "B", "b"): path = []   # Beschnittpfade und Striche (Schnittmarken) verwerfen
    nums = [] if op not in ("q", "Q") else nums
    if op not in ("q", "Q", "cm", "scn", "m", "l", "c", "re", "h", "f", "F", "f*", "n", "S", "s", "B", "b"):
        nums = []

def r3(v): return ("%.3f" % v).rstrip("0").rstrip(".")
def pt(p): return "%s %s" % (r3(p[0] - ox), r3(p[1] - oy))

# --- Ausgabe: PDF-Operatoren und SVG -----------------------------------------------------------------------------
ops, svg_paths, boxes = [], [], []
# Die Farben des Druck-PDFs sind CMYK; hier als sRGB, so wie das Original auf dem Bildschirm erscheint (aus der Darstellung gemessen)
RGB = {(0.0, 1.0, 1.0, 0.0): (227, 0, 10), (0.0, 1.0, 1.0, 0.27): (179, 5, 0), (0.0, 0.0, 0.0, 0.65): (122, 122, 122), (0.0, 0.0, 0.0, 0.0): (255, 255, 255)}
for color, p in shapes:
    c = tuple(round(x, 2) for x in color)
    rgb = RGB.get(c, (0, 0, 0))
    ops.append("%s rg" % " ".join(r3(v / 255) for v in rgb))
    d, xs, ys = [], [], []
    for seg in p:
        if seg[0] == "m": ops.append("%s m" % pt(seg[1])); d.append("M%s" % pt(seg[1])); pts = [seg[1]]
        elif seg[0] == "l": ops.append("%s l" % pt(seg[1])); d.append("L%s" % pt(seg[1])); pts = [seg[1]]
        elif seg[0] == "c":
            ops.append("%s %s %s c" % (pt(seg[1]), pt(seg[2]), pt(seg[3]))); d.append("C%s %s %s" % (pt(seg[1]), pt(seg[2]), pt(seg[3]))); pts = seg[1:]
        else: ops.append("h"); d.append("Z"); continue
        for q in pts: xs.append(q[0] - ox); ys.append(q[1] - oy)
    ops.append("f")
    hexc = "#%02X%02X%02X" % rgb
    if hexc != "#FFFFFF":   # weiße Flächen auf weißem Papier brauchen weder PDF noch SVG
        svg_paths.append('<path fill="%s" d="%s"/>' % (hexc, "".join(d)))
    if xs and hexc != "#FFFFFF": boxes.append((min(xs), min(ys), max(xs), max(ys), hexc))
ops_str = " ".join(ops)
# weiße Flächen auch aus den Operatoren nehmen
ops_str = re.sub(r"1 1 1 rg(?: [^rf]*?)? f ?", "", ops_str)

svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" preserveAspectRatio="none"><g transform="translate(0 %s) scale(1 -1)">%s</g></svg>'
       % (r3(W), r3(H), r3(H), "".join(svg_paths)))

# --- Fußzeilentext des Briefpapiers (Position aus dem Original, 7 pt) --------------------------------------------
MM = 25.4 / 72
foot_lines = [
    ("LEISTUNGSSPORT AUSTRIA", 74.5464, True),
    ("Johann Steinböck-Straße 19 | A-2345 Brunn am Gebirge | +43 (2236) 229 28 | office@leistungssport.at", 66.1464, False),
    ("www.leistungssport.at | IBAN: AT63 1200 0006 7809 1604 | BIC: BKAUATWW", 57.7464, False),
    ("ZVR-Nr. 284274244 | LG Wr. Neustadt", 49.3464, False),
]
foot = {"x": round((77.6929 - ox) * MM, 2), "size": 7,
        "lines": [{"t": t, "y": round((H - (y - oy)) * MM, 2), "bold": b} for t, y, b in foot_lines]}

# --- Wo ist Platz? Kopfformen unten (y gemessen von oben), Fußformen oben ----------------------------------------
def top_mm(b): return (H - b[3]) * MM
def bottom_mm(b): return (H - b[1]) * MM
head = max(((H - b[1]) * MM for b in boxes if b[1] > H * 0.72), default=0)       # unterste Kante der Formen oben
head_logo = max(((H - b[1]) * MM for b in boxes if b[1] > H * 0.8 and b[0] > W * 0.4), default=0)
foot_top = min((top_mm(b) for b in boxes if b[3] < H * 0.28), default=0)       # oberste Kante der Formen unten
foot_right = min((b[0] * MM for b in boxes if b[3] < H * 0.28), default=0)

js = """/* ===== Briefpapier Leistungssport Austria (generiert aus %s mit tools/letterhead.py – nicht von Hand ändern) =====
   ops   Zeichenbefehle für den PDF-Export (Punkt, Ursprung links unten, A4 %s x %s pt, Farben als sRGB)
   svg   dieselben Formen für den Druckdialog
   foot  Adresszeilen des Briefpapiers (mm von oben/links, 7 pt)
   free  freier Bereich für Inhalt in mm: top = unterhalb der Kopfformen, bottom = oberhalb der Fußzeile */
var LSA = %s;
""" % (src.split("/")[-1], r3(W), r3(H), json.dumps({
    "w": round(W, 3), "h": round(H, 3), "ops": ops_str, "svg": svg, "foot": foot,
    "colors": {"red": [227, 0, 10], "dark": [179, 5, 0], "grey": [122, 122, 122], "ink": [83, 83, 82], "ink2": [60, 60, 59]},
    "free": {"top": round(head, 1), "logoBottom": round(head_logo, 1), "bottom": round(foot["lines"][0]["y"] - 3.2, 1),
             "shapeTop": round(foot_top, 1), "shapeLeft": round(foot_right, 1)},
}, ensure_ascii=False))
open(out, "w", encoding="utf-8").write(js)
print("geschrieben:", out, "%d KB" % (len(js) / 1024), "| Formen:", len(shapes), "| frei von %.1f mm bis %.1f mm" % (head, foot["lines"][0]["y"] - 3.2),
      "| Formen unten ab %.1f mm (rechts ab %.1f mm)" % (foot_top, foot_right))
