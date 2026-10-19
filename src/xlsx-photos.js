/* ===== Fotos aus der Excel-Rohdatendatei =====
   Beim Laden einer .xlsx-Datei werden die darin eingefügten Bilder den Athlet:innen zugeordnet und stehen gleich in der
   Einzelauswertung (und im PDF) zur Verfügung. Unterstützt:
     – Bilder, die in Excel eingefügt sind („Einfügen → Bilder“, schwebend über den Zellen) – zugeordnet über die Zeile
       (Spalte „Name“ in der Zeile des Bildes; mehrzeilige Bilder: erste Zeile mit Namen)
     – „Bild in Zelle“ (Excel 365: Bild in der Zelle, z. B. in einer Spalte „Foto“)
   Eine Datei .xlsx ist ein ZIP-Archiv; gelesen wird mit dem eingebauten DecompressionStream des Browsers (kein Zusatzpaket).
   Die Tabellenwerte (Namen) kommen aus der bereits mit SheetJS gelesenen Arbeitsmappe. */
var XlsxPhotos = (function () {
  "use strict";
  var NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };
  var X = { unsupported: false };

  /* ---------- minimaler ZIP-Leser ---------- */
  function utf8(u8) { return new TextDecoder("utf-8").decode(u8); }
  function inflateRaw(u8) {
    if (typeof DecompressionStream !== "function") { X.unsupported = true; return Promise.reject(new Error("DecompressionStream fehlt")); }
    var ds = new DecompressionStream("deflate-raw");
    return new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function zipOpen(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("kein ZIP-Archiv");
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), ent = {};
    for (var i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      ent[utf8(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nl + el + cl;
    }
    function bytes(name) {
      var m = ent[name]; if (!m) return Promise.resolve(null);
      var o = m.off, nl = dv.getUint16(o + 26, true), el = dv.getUint16(o + 28, true), data = u8.subarray(o + 30 + nl + el, o + 30 + nl + el + m.size);
      if (m.method === 0) return Promise.resolve(data);
      if (m.method === 8) return inflateRaw(data);
      return Promise.resolve(null);
    }
    return { has: function (n) { return !!ent[n]; }, bytes: bytes, text: function (n) { return bytes(n).then(function (b) { return b ? utf8(b) : null; }); } };
  }

  /* ---------- XML und Beziehungen ---------- */
  function parse(text) { if (!text) return null; var d = new DOMParser().parseFromString(text, "application/xml"); return d.getElementsByTagName("parsererror").length ? null : d; }
  function all(node, local) { var o = [], l = node.getElementsByTagName("*"); for (var i = 0; i < l.length; i++) if (l[i].localName === local) o.push(l[i]); return o; }
  function child(node, local) { for (var c = node.firstElementChild; c; c = c.nextElementSibling) if (c.localName === local) return c; return null; }
  function rattr(el, name) { return el.getAttributeNS(NS_R, name) || el.getAttribute("r:" + name) || ""; }
  function resolve(base, target) {
    if (!target) return ""; if (target[0] === "/") return target.slice(1);
    var parts = base.split("/"); parts.pop();
    target.split("/").forEach(function (s) { if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s); });
    return parts.join("/");
  }
  /* Beziehungen eines Teils: {id: {target (aufgelöst), type}} */
  function rels(zip, part) {
    var d = part.lastIndexOf("/"), rp = part.slice(0, d + 1) + "_rels/" + part.slice(d + 1) + ".rels";
    return zip.text(rp).then(function (t) {
      var doc = parse(t), out = {}; if (!doc) return out;
      all(doc, "Relationship").forEach(function (r) { out[r.getAttribute("Id")] = { target: resolve(part, r.getAttribute("Target")), type: r.getAttribute("Type") || "" }; });
      return out;
    });
  }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; }

  /* ---------- Fundstellen: Bild + Blatt + Zeile ---------- */
  /* Blätter: [{name, part}] */
  function sheetsOf(zip) {
    return Promise.all([zip.text("xl/workbook.xml"), rels(zip, "xl/workbook.xml")]).then(function (r) {
      var doc = parse(r[0]), out = []; if (!doc) return out;
      all(doc, "sheet").forEach(function (s) { var rel = r[1][rattr(s, "id")]; if (rel) out.push({ name: s.getAttribute("name"), part: rel.target }); });
      return out;
    });
  }
  /* schwebende Bilder: Zeichnung des Blatts → Anker mit Bild */
  function floating(zip, sheet) {
    return rels(zip, sheet.part).then(function (sr) {
      var drawings = Object.keys(sr).filter(function (k) { return /\/drawing$/.test(sr[k].type); }).map(function (k) { return sr[k].target; });
      return Promise.all(drawings.map(function (dp) {
        return Promise.all([zip.text(dp), rels(zip, dp)]).then(function (r) {
          var doc = parse(r[0]), out = []; if (!doc) return out;
          ["twoCellAnchor", "oneCellAnchor"].forEach(function (kind) {
            all(doc, kind).forEach(function (a) {
              var pic = all(a, "pic")[0], blip = pic && all(pic, "blip")[0], from = child(a, "from"); if (!blip || !from) return;
              var rel = r[1][rattr(blip, "embed")]; if (!rel) return;
              var row = parseInt((child(from, "row") || {}).textContent, 10), col = parseInt((child(from, "col") || {}).textContent, 10), end = row;
              var to = child(a, "to");
              if (to) { var tr = parseInt((child(to, "row") || {}).textContent, 10), off = parseInt((child(to, "rowOff") || {}).textContent, 10) || 0; if (isFinite(tr)) end = Math.max(row, tr - (off === 0 ? 1 : 0)); }
              if (isFinite(row)) out.push({ sheet: sheet.name, row: row, end: end, col: isFinite(col) ? col : 0, media: rel.target });
            });
          });
          return out;
        });
      })).then(function (l) { return [].concat.apply([], l); });
    });
  }
  /* „Bild in Zelle“: Zelle mit vm → Metadaten → Rich Value → Bildbeziehung */
  function inCell(zip, sheets) {
    if (!zip.has("xl/richData/rdrichvalue.xml") || !zip.has("xl/metadata.xml")) return Promise.resolve([]);
    return Promise.all([zip.text("xl/metadata.xml"), zip.text("xl/richData/rdrichvalue.xml"), zip.text("xl/richData/rdrichvaluestructure.xml"),
      zip.text("xl/richData/richValueRel.xml"), rels(zip, "xl/richData/richValueRel.xml")]).then(function (r) {
      var meta = parse(r[0]), rv = parse(r[1]), st = parse(r[2]), rvr = parse(r[3]), rr = r[4];
      if (!meta || !rv || !rvr) return [];
      /* Typnummer von XLRICHVALUE (1-basiert) und Liste der Rich-Value-Nummern je futureMetadata-Eintrag */
      var types = all(meta, "metadataType").map(function (t) { return t.getAttribute("name"); }), tIdx = types.indexOf("XLRICHVALUE") + 1;
      var fm = all(meta, "futureMetadata").filter(function (f) { return f.getAttribute("name") === "XLRICHVALUE"; })[0];
      var fmIdx = fm ? all(fm, "bk").map(function (b) { var v = all(b, "rvb")[0]; return v ? parseInt(v.getAttribute("i"), 10) : -1; }) : [];
      var vmeta = all(meta, "valueMetadata")[0], vbk = vmeta ? all(vmeta, "bk") : [];
      var vmToRv = vbk.map(function (b) { var rc = all(b, "rc").filter(function (c) { return parseInt(c.getAttribute("t"), 10) === tIdx; })[0]; return rc ? fmIdx[parseInt(rc.getAttribute("v"), 10)] : -1; });
      /* Struktur: an welcher Stelle steht LocalImageIdentifier? */
      var structs = st ? all(st, "s").map(function (s) { return all(s, "k").map(function (k) { return k.getAttribute("n"); }); }) : [];
      var rvList = all(rv, "rv").map(function (v) {
        var keys = structs[parseInt(v.getAttribute("s"), 10)] || [], pos = Math.max(0, keys.indexOf("_rvRel:LocalImageIdentifier")), vals = all(v, "v");
        return vals[pos] ? parseInt(vals[pos].textContent, 10) : -1;
      });
      var relList = all(rvr, "rel").map(function (e) { var rel = rr[rattr(e, "id")]; return rel ? rel.target : ""; });
      return Promise.all(sheets.map(function (sh) {
        return zip.text(sh.part).then(function (t) {
          if (!t || t.indexOf(" vm=") < 0) return [];
          var doc = parse(t), out = []; if (!doc) return out;
          all(doc, "c").forEach(function (c) {
            var vm = parseInt(c.getAttribute("vm"), 10); if (!isFinite(vm) || vm < 1) return;
            var media = relList[rvList[vmToRv[vm - 1]]]; if (!media) return;
            var m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute("r") || ""); if (!m) return;
            out.push({ sheet: sh.name, row: parseInt(m[2], 10) - 1, end: parseInt(m[2], 10) - 1, col: colNum(m[1]), media: media });
          });
          return out;
        });
      })).then(function (l) { return [].concat.apply([], l); });
    });
  }
  function locate(zip) {
    return sheetsOf(zip).then(function (sheets) {
      return Promise.all([Promise.all(sheets.map(function (s) { return floating(zip, s); })).then(function (l) { return [].concat.apply([], l); }), inCell(zip, sheets)])
        .then(function (r) { return r[0].concat(r[1]); });
    });
  }

  /* ---------- Zeile → Name ---------- */
  /* Texte einer Zeile des Blatts: {name: Zelle der Spalte „Name“ (oder ""), others: alle anderen Textzellen der Zeile} */
  function rowTexts(wb) {
    var info = {};
    return function (sheet, row) {
      var ws = wb.Sheets[sheet]; if (!ws || !ws["!ref"]) return { name: "", others: [] };
      var ref = XLSX.utils.decode_range(ws["!ref"]), nf = info[sheet];
      if (!nf) {
        nf = info[sheet] = { col: -1, hdr: -1 };
        for (var r = ref.s.r; r <= Math.min(ref.e.r, ref.s.r + 40) && nf.col < 0; r++)
          for (var c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 60); c++) { var h = ws[XLSX.utils.encode_cell({ r: r, c: c })]; if (h && typeof hnorm === "function" && hnorm(h.v) === "name") { nf.col = c; nf.hdr = r; break; } }
      }
      var out = { name: "", others: [] };
      if (nf.col >= 0 && row > nf.hdr) { var nc = ws[XLSX.utils.encode_cell({ r: row, c: nf.col })]; if (nc && nc.v != null) out.name = String(nc.v).trim(); }
      for (var cc = ref.s.c; cc <= ref.e.c; cc++) {
        var cell = ws[XLSX.utils.encode_cell({ r: row, c: cc })];
        if (cell && cell.t === "s" && cell.v != null && String(cell.v).trim()) out.others.push(String(cell.v).trim());
      }
      return out;
    };
  }

  /* ---------- Bild → quadratisches Foto ---------- */
  function toSquare(bytes, ext) {
    return new Promise(function (ok) {
      var url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] || "image/png" })), im = new Image();
      im.onload = function () { var out = null; try { out = squareDataUrl(im); } catch (e) { /* unlesbar */ } URL.revokeObjectURL(url); ok(out); };
      im.onerror = function () { URL.revokeObjectURL(url); ok(null); };
      im.src = url;
    });
  }

  /* Bilder aus der Excel-Datei den Personen zuordnen und als Fotos eintragen.
     buf = Inhalt der Datei, wb = mit SheetJS gelesene Arbeitsmappe → Promise<Anzahl neu gesetzter Fotos> */
  X.apply = function (buf, wb) {
    var zip; try { zip = zipOpen(buf); } catch (e) { return Promise.resolve(0); }
    var texts = rowTexts(wb), done = {}, jobs = [];
    return locate(zip).then(function (found) {
      found.sort(function (a, b) { return (a.sheet < b.sheet ? -1 : a.sheet > b.sheet ? 1 : 0) || (a.row - b.row) || (a.col - b.col); });
      found.forEach(function (f) {
        var ext = (/\.([a-z0-9]+)$/i.exec(f.media) || [])[1]; ext = ext && ext.toLowerCase();
        if (!MIME[ext]) return;   /* z. B. EMF/WMF: im Browser nicht darstellbar */
        var p = null;
        for (var r = f.row; r <= f.end && !p; r++) {   /* Zeile des Bildes; bei hohen Bildern die erste Zeile mit einem Namen */
          var t = texts(f.sheet, r);
          if (t.name) p = personFor(t.name, true);
          for (var k = 0; k < t.others.length && !p; k++) p = personFor(t.others[k], false);
        }
        if (!p || done[p.name] || (typeof PHOTOS !== "undefined" && PHOTOS[p.name])) return;   /* ein Foto je Person (das erste); von Hand geladene Fotos gewinnen */
        done[p.name] = 1;
        jobs.push(zip.bytes(f.media).then(function (b) { return b ? toSquare(b, ext) : null; }).then(function (url) { if (url) { FOTOS[p.name] = url; return 1; } return 0; }));
      });
      return Promise.all(jobs);
    }).then(function (l) { return l.reduce(function (a, b) { return a + b; }, 0); }).catch(function () { return 0; });
  };
  /* Person zu einem Text aus der Zeile: genau gleicher Name; nur bei der Namensspalte zusätzlich die eindeutige Übereinstimmung wie bei Foto-Dateinamen */
  function personFor(t, fuzzy) {
    var n = norm(t), i;
    for (i = 0; i < players.length; i++) if (norm(players[i].name) === n) return players[i];
    return fuzzy && t.length >= 4 ? matchPlayer(t) : null;
  }
  X.locate = function (buf) { return locate(zipOpen(buf)); };
  return X;
})();
