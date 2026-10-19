#!/usr/bin/env python3
"""Erzeugt die Excel-Testdateien mit eingefügten Fotos (nur für die Tests nötig; die fertigen Dateien liegen daneben).

Aufruf (aus dem Repository-Ordner):  python3 -I tests/fixtures/make_fotos.py
Braucht XlsxWriter und Pillow. Die Rohdaten stammen aus den Beispieldaten der Auswertung (DEMO_CSV in src/segeln-base.html).

  fotos_schwebend.xlsx   Blatt „Eingabe raw data“ mit Spalte „Foto“; je Person ein in Excel eingefügtes (schwebendes) Bild in der Zeile der Person
  fotos_in_zelle.xlsx    dasselbe als „Bild in Zelle“ (Excel 365)
  fotos_blatt.xlsx       Blatt „Fotos“ mit Name und daneben eingefügten Bildern; im Rohdatenblatt selbst keine Bilder

Fotos: Wende Sophie rot, Luv Paul blau, Schot Hannah grün (einfarbig mit hellem Kreis), alle anderen ohne Foto.
"""
import csv, io, json, re, sys
from pathlib import Path

import xlsxwriter
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parent
src = (root / "src" / "segeln-base.html").read_text(encoding="utf-8")
demo = json.loads('"' + re.search(r'var DEMO_CSV="(.*?)";\n', src, re.S).group(1) + '"')
rows = list(csv.reader(io.StringIO(demo)))
head, data = rows[0], rows[1:]

COLORS = {"Wende Sophie": (220, 40, 40), "Luv Paul": (40, 60, 220), "Schot Hannah": (40, 180, 60)}
def png(name):
    path = out / ("_" + name.replace(" ", "_") + ".png")
    im = Image.new("RGB", (150, 200), COLORS[name]); d = ImageDraw.Draw(im)
    d.ellipse((45, 40, 105, 100), fill=(245, 245, 245)); d.rectangle((30, 120, 120, 200), fill=(245, 245, 245))
    im.save(path); return str(path)

def sheet(wb, name="Eingabe raw data", photo_col=True):
    ws = wb.add_worksheet(name)
    for c, h in enumerate(head + (["Foto"] if photo_col else [])): ws.write(0, c, h)
    for r, row in enumerate(data, start=1):
        for c, v in enumerate(row): ws.write(r, c, v)
        ws.set_row(r, 60 if photo_col and row[0] in COLORS else None)
    return ws

def first_rows():
    seen, res = set(), {}
    for r, row in enumerate(data, start=1):
        if row[0] in COLORS and row[0] not in seen: seen.add(row[0]); res[row[0]] = r
    return res

fc = len(head)   # Spalte „Foto“
with xlsxwriter.Workbook(out / "fotos_schwebend.xlsx") as wb:
    ws = sheet(wb); ws.set_column(fc, fc, 14)
    for n, r in first_rows().items(): ws.insert_image(r, fc, png(n), {"x_scale": 0.3, "y_scale": 0.3, "object_position": 1})
with xlsxwriter.Workbook(out / "fotos_in_zelle.xlsx") as wb:
    ws = sheet(wb); ws.set_column(fc, fc, 14)
    for n, r in first_rows().items(): ws.embed_image(r, fc, png(n))
with xlsxwriter.Workbook(out / "fotos_blatt.xlsx") as wb:
    sheet(wb, photo_col=False)
    fs = wb.add_worksheet("Fotos"); fs.write(0, 0, "Name"); fs.set_column(1, 1, 14)
    for i, n in enumerate(COLORS, start=1):
        fs.write(i, 0, n); fs.set_row(i, 60); fs.insert_image(i, 1, png(n), {"x_scale": 0.3, "y_scale": 0.3, "object_position": 1})
for f in out.glob("_*.png"): f.unlink()
print("geschrieben:", ", ".join(p.name for p in sorted(out.glob("*.xlsx"))))
