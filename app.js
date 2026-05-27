:root {
  --teal: #457c77;
  --teal-2: #2d7e78;
  --night: #0f2f2d;
  --deep: #173d3b;
  --mint: #d9e8e4;
  --mint-2: #6fa29a;
  --ivory: #f4efe6;
  --paper: #f8f7f2;
  --ink: #1e2625;
  --bronze: #b58b5b;
  --clay: #9a5e4e;
  --line: rgba(217, 232, 228, 0.22);
  --shadow: 0 20px 60px rgba(5, 22, 21, 0.28);
  --radius: 8px;
  color-scheme: dark light;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(135deg, rgba(15, 47, 45, 0.98), rgba(23, 61, 59, 0.96)),
    radial-gradient(circle at 20% 10%, rgba(181, 139, 91, 0.14), transparent 28%);
  color: var(--paper);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
  letter-spacing: 0;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.site-header {
  width: min(1420px, calc(100% - 32px));
  margin: 0 auto;
  padding: 22px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.brand img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  flex: 0 0 auto;
  filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.22));
}

.brand h1,
.panel-heading h2,
.map-heading h2,
.section-heading h2,
.note-block h2 {
  margin: 0;
  color: var(--paper);
  font-weight: 850;
  line-height: 1.05;
}

.brand h1 {
  font-size: clamp(1.55rem, 2vw, 2.3rem);
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--mint);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.header-actions,
.form-actions,
.tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ghost-button,
.primary-button,
.secondary-button,
.tab {
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--paper);
  background: rgba(248, 247, 242, 0.07);
  padding: 9px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 760;
  text-decoration: none;
  transition:
    transform 160ms ease,
    background 160ms ease,
    border-color 160ms ease;
}

.ghost-button:hover,
.secondary-button:hover,
.tab:hover {
  transform: translateY(-1px);
  border-color: rgba(217, 232, 228, 0.46);
  background: rgba(248, 247, 242, 0.11);
}

.primary-button {
  border-color: rgba(181, 139, 91, 0.72);
  background: var(--bronze);
  color: #17120d;
}

.primary-button:hover {
  transform: translateY(-1px);
  background: #c49a69;
}

.secondary-button {
  background: rgba(15, 47, 45, 0.72);
}

main {
  padding-bottom: 52px;
}

.tool-shell {
  width: min(1420px, calc(100% - 32px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
}

.input-panel,
.output-panel,
.table-section,
.notes-section {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.input-panel {
  background: rgba(23, 61, 59, 0.76);
  padding: 18px;
}

.output-panel {
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(69, 124, 119, 0.52), rgba(15, 47, 45, 0.96)),
    linear-gradient(90deg, rgba(181, 139, 91, 0.12), transparent 42%);
  padding: 20px;
  min-width: 0;
}

.panel-heading,
.map-heading,
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-heading,
.map-heading {
  margin-bottom: 18px;
}

.panel-heading h2,
.map-heading h2,
.section-heading h2 {
  font-size: clamp(1.15rem, 1.8vw, 1.6rem);
}

.input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.input-grid + .input-grid {
  margin-top: 14px;
}

.input-grid-compact {
  grid-template-columns: 1fr 1fr;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field span,
.field legend {
  color: var(--paper);
  font-size: 0.86rem;
  font-weight: 800;
}

.field small {
  color: rgba(217, 232, 228, 0.74);
  font-size: 0.72rem;
}

.field input,
.field select {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(217, 232, 228, 0.24);
  border-radius: var(--radius);
  background: rgba(5, 22, 21, 0.45);
  color: var(--paper);
  padding: 9px 10px;
  outline: none;
}

.field input:focus,
.field select:focus {
  border-color: var(--bronze);
  box-shadow: 0 0 0 3px rgba(181, 139, 91, 0.18);
}

.segmented {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0;
  border: 0;
}

.segmented legend {
  margin-bottom: 8px;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.segmented label {
  position: relative;
  min-height: 40px;
  border: 1px solid rgba(217, 232, 228, 0.22);
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mint);
  background: rgba(5, 22, 21, 0.32);
  font-weight: 780;
}

.segmented input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}

.segmented label:has(input:checked) {
  border-color: rgba(181, 139, 91, 0.84);
  background: rgba(181, 139, 91, 0.18);
  color: var(--paper);
}

.form-actions {
  margin-top: 16px;
}

.form-actions button {
  flex: 1 1 auto;
}

.validation {
  margin-top: 14px;
  min-height: 24px;
  color: #f3c6b9;
  font-size: 0.86rem;
}

.validation ul {
  margin: 0;
  padding-left: 18px;
}

.summary-pill {
  border: 1px solid rgba(181, 139, 91, 0.54);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--paper);
  background: rgba(181, 139, 91, 0.16);
  font-size: 0.84rem;
  font-weight: 820;
  white-space: nowrap;
}

.map-stage {
  margin: 2px 0 20px;
  padding: 18px;
  border: 1px solid rgba(217, 232, 228, 0.2);
  border-radius: var(--radius);
  background:
    linear-gradient(180deg, rgba(248, 247, 242, 0.1), rgba(248, 247, 242, 0.04)),
    rgba(15, 47, 45, 0.42);
}

.domain-map {
  position: relative;
  height: 190px;
  min-width: 0;
}

.domain-band {
  position: absolute;
  top: 42px;
  bottom: 42px;
  border: 1px solid rgba(248, 247, 242, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  overflow: hidden;
}

.domain-band:first-child {
  border-top-left-radius: var(--radius);
  border-bottom-left-radius: var(--radius);
}

.domain-band:last-child {
  border-top-right-radius: var(--radius);
  border-bottom-right-radius: var(--radius);
}

.domain-band span {
  padding: 0 8px;
  color: var(--paper);
  font-size: clamp(0.72rem, 1vw, 0.95rem);
  font-weight: 870;
  text-align: center;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.4);
}

.domain-band.moderate {
  background: linear-gradient(90deg, rgba(111, 162, 154, 0.5), rgba(111, 162, 154, 0.72));
}

.domain-band.heavy {
  background: linear-gradient(90deg, rgba(181, 139, 91, 0.55), rgba(181, 139, 91, 0.78));
}

.domain-band.severe {
  background: linear-gradient(90deg, rgba(154, 94, 78, 0.64), rgba(170, 84, 72, 0.84));
}

.domain-band.extreme {
  background: linear-gradient(90deg, rgba(65, 32, 45, 0.78), rgba(117, 54, 63, 0.9));
}

.threshold-marker {
  position: absolute;
  top: 16px;
  bottom: 18px;
  width: 2px;
  background: var(--paper);
  box-shadow: 0 0 0 1px rgba(15, 47, 45, 0.42), 0 0 18px rgba(248, 247, 242, 0.5);
}

.threshold-marker::before {
  content: attr(data-label);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -13px;
  color: var(--paper);
  background: rgba(15, 47, 45, 0.88);
  border: 1px solid rgba(217, 232, 228, 0.26);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.72rem;
  font-weight: 850;
  white-space: nowrap;
}

.threshold-marker::after {
  content: attr(data-speed);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: -12px;
  color: var(--mint);
  font-size: 0.7rem;
  font-weight: 760;
  white-space: nowrap;
}

.map-axis {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: rgba(217, 232, 228, 0.78);
  font-size: 0.78rem;
  font-weight: 720;
}

.threshold-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.threshold-card,
.note-block {
  border: 1px solid rgba(217, 232, 228, 0.16);
  border-radius: var(--radius);
  background: rgba(15, 47, 45, 0.54);
}

.threshold-card {
  padding: 14px;
  min-width: 0;
}

.threshold-card .label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  color: var(--mint);
  font-size: 0.75rem;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.threshold-card strong {
  display: block;
  margin-top: 6px;
  color: var(--paper);
  font-size: clamp(1.1rem, 2vw, 1.55rem);
  line-height: 1;
}

.threshold-card p {
  margin: 8px 0 0;
  color: rgba(248, 247, 242, 0.78);
  font-size: 0.82rem;
}

.table-section,
.notes-section {
  width: min(1420px, calc(100% - 32px));
  margin: 18px auto 0;
  background: var(--paper);
  color: var(--ink);
}

.table-section {
  padding: 18px;
}

.table-section .eyebrow,
.notes-section .eyebrow {
  color: var(--teal);
}

.table-section h2,
.notes-section h2 {
  color: var(--ink);
}

.tabs {
  padding: 3px;
  border: 1px solid rgba(30, 38, 37, 0.12);
  border-radius: var(--radius);
  background: #ebe4d7;
}

.tab {
  min-height: 34px;
  border-color: transparent;
  background: transparent;
  color: rgba(30, 38, 37, 0.68);
  padding: 7px 10px;
}

.tab.is-active {
  background: var(--teal);
  color: var(--paper);
  box-shadow: 0 6px 18px rgba(69, 124, 119, 0.24);
}

.table-wrap {
  margin-top: 16px;
  overflow-x: auto;
  border: 1px solid rgba(30, 38, 37, 0.12);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 880px;
  background: #fffcf6;
}

th,
td {
  padding: 11px 12px;
  border-bottom: 1px solid rgba(30, 38, 37, 0.1);
  text-align: left;
  vertical-align: top;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #efe7da;
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 870;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

td {
  color: rgba(30, 38, 37, 0.86);
  font-size: 0.9rem;
}

tbody tr:hover {
  background: rgba(217, 232, 228, 0.42);
}

.method-cell {
  min-width: 190px;
  font-weight: 850;
  color: var(--ink);
}

.tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75rem;
  font-weight: 850;
  color: var(--paper);
  white-space: nowrap;
}

.tag.moderate {
  background: var(--teal);
}

.tag.heavy {
  background: var(--bronze);
  color: #1d1710;
}

.tag.severe {
  background: var(--clay);
}

.tag.extreme {
  background: #6a2f3d;
}

.notes-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.note-block {
  background: var(--paper);
  color: var(--ink);
  border-color: rgba(30, 38, 37, 0.1);
  padding: 18px;
  box-shadow: 0 14px 35px rgba(5, 22, 21, 0.18);
}

.note-block p:last-child {
  margin-bottom: 0;
}

.toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  max-width: min(360px, calc(100vw - 36px));
  border: 1px solid rgba(217, 232, 228, 0.28);
  border-radius: var(--radius);
  background: rgba(15, 47, 45, 0.96);
  color: var(--paper);
  padding: 12px 14px;
  box-shadow: var(--shadow);
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 1100px) {
  .tool-shell {
    grid-template-columns: 1fr;
  }

  .threshold-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions button {
    flex: 1 1 0;
  }

  .tool-shell,
  .table-section,
  .notes-section,
  .site-header {
    width: min(100% - 20px, 1420px);
  }

  .panel-heading,
  .map-heading,
  .section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .input-grid {
    grid-template-columns: 1fr;
  }

  .threshold-grid,
  .notes-section {
    grid-template-columns: 1fr;
  }

  .domain-map {
    height: 220px;
  }

  .domain-band span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }

  .tabs {
    width: 100%;
  }

  .tab {
    flex: 1 1 0;
  }
}

@media print {
  body {
    background: #fff;
    color: #111;
  }

  .site-header,
  .input-panel,
  .header-actions,
  .tabs,
  .toast,
  .form-actions {
    display: none !important;
  }

  .tool-shell,
  .table-section,
  .notes-section {
    width: 100%;
    margin: 0 0 16px;
    box-shadow: none;
  }

  .tool-shell {
    display: block;
  }

  .output-panel,
  .table-section,
  .note-block {
    box-shadow: none;
    break-inside: avoid;
  }

  .table-wrap {
    overflow: visible;
  }

  table {
    min-width: 0;
    font-size: 10px;
  }
}
