/**
 * AlabJS dev toolbar — injected into every page in `alab dev`.
 *
 * Reads the meta tags already emitted by the SSR HTML shell and renders
 * a floating panel at the bottom of the screen showing:
 *   - Current route file + render mode (SSR / CSR / PPR)
 *   - Server/client boundary tree (page + layout chain with their modes)
 *   - Route params and search params
 *   - Build ID
 *
 * Zero runtime dependencies. Never injected in production builds.
 */

export function devToolbarScript(): string {
  return `<script type="module" id="__alabjs_devtools__">
(function () {
  if (document.getElementById('__alab_toolbar')) return;

  const meta = (n) =>
    document.querySelector('meta[name="' + n + '"]')?.getAttribute('content') ?? '';

  const routeFile  = meta('alabjs-route') || '(unknown)';
  const isSSR      = meta('alabjs-ssr') === 'true';
  const isPPR      = document.querySelector('meta[name="alabjs-ppr"]') !== null;
  const buildId    = meta('alabjs-build-id') || 'dev';
  const paramsRaw  = meta('alabjs-params');
  const searchRaw  = meta('alabjs-search-params');
  const layoutsRaw = meta('alabjs-layouts');

  let params = {}, searchParams = {}, layouts = [];
  try { params = JSON.parse(paramsRaw || '{}'); } catch {}
  try { searchParams = JSON.parse(searchRaw || '{}'); } catch {}
  try { layouts = JSON.parse(layoutsRaw || '[]'); } catch {}

  const mode = isPPR ? 'PPR' : isSSR ? 'SSR' : 'CSR';
  const modeColor = { SSR: '#3b82f6', CSR: '#10b981', PPR: '#8b5cf6' }[mode];

  const hasParams = Object.keys(params).length > 0;
  const hasSearch = Object.keys(searchParams).length > 0;

  // Open file in editor via Vite's built-in click-to-source.
  const editorBase = window.location.origin + '/__open-in-editor?file=';

  // ── Styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = \`
    #__alab_toolbar {
      position: fixed; bottom: 14px; left: 14px; z-index: 999999;
      font-family: ui-monospace,'Cascadia Code','Source Code Pro',Menlo,monospace;
      font-size: 12px; line-height: 1.4;
      display: flex; flex-direction: column; gap: 4px;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,.5));
      user-select: none;
    }
    #__alab_bar {
      display: flex; align-items: center; gap: 8px;
      background: #18181b; color: #e4e4e7;
      border-radius: 8px; padding: 6px 10px;
      cursor: pointer; white-space: nowrap;
      border: 1px solid #3f3f46; transition: background .1s;
    }
    #__alab_bar:hover { background: #27272a; }
    .alab-logo { color: #f97316; font-weight: 700; }
    .alab-route { color: #a1a1aa; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
    .alab-route b { color: #e4e4e7; font-weight: normal; }
    .alab-badge {
      font-size: 10px; font-weight: 700; letter-spacing: .05em;
      padding: 2px 6px; border-radius: 4px; color: #fff;
    }
    .alab-chev { color: #52525b; font-size: 9px; margin-left: 2px; }
    #__alab_panel {
      background: #18181b; color: #e4e4e7;
      border: 1px solid #3f3f46; border-radius: 8px; overflow: hidden;
      display: none; flex-direction: column;
      width: 340px;
    }
    #__alab_panel.open { display: flex; }
    .alab-section { padding: 8px 12px; display: flex; flex-direction: column; gap: 5px; }
    .alab-section + .alab-section { border-top: 1px solid #27272a; }
    .alab-section-title {
      font-size: 10px; font-weight: 700; letter-spacing: .08em;
      text-transform: uppercase; color: #52525b; margin-bottom: 2px;
    }
    .alab-row { display: flex; gap: 8px; align-items: flex-start; }
    .alab-lbl { color: #52525b; min-width: 64px; flex-shrink: 0; }
    .alab-val { color: #d4d4d8; word-break: break-all; }
    .alab-val a { color: #60a5fa; text-decoration: none; }
    .alab-val a:hover { text-decoration: underline; }
    .alab-tree { display: flex; flex-direction: column; gap: 3px; }
    .alab-tree-node {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px;
    }
    .alab-tree-node .alab-indent { color: #3f3f46; }
    .alab-tree-node .alab-file { color: #a1a1aa; }
    .alab-tree-node .alab-file a { color: #a1a1aa; text-decoration: none; }
    .alab-tree-node .alab-file a:hover { color: #60a5fa; }
    .alab-tree-node.is-server .alab-file a { color: #93c5fd; }
    .alab-tree-node.is-page .alab-file a  { color: #e4e4e7; }
    .alab-pill {
      font-size: 9px; font-weight: 700; letter-spacing: .06em;
      padding: 1px 5px; border-radius: 3px;
    }
    .pill-server  { background: #1e3a5f; color: #93c5fd; }
    .pill-client  { background: #064e3b; color: #6ee7b7; }
    .pill-ppr     { background: #3b0764; color: #d8b4fe; }
    .alab-kv { display: flex; flex-wrap: wrap; gap: 4px; }
    .alab-kv-item {
      background: #27272a; border-radius: 4px; padding: 1px 6px;
    }
    .alab-kv-key { color: #71717a; }
    .alab-kv-val { color: #d4d4d8; }
  \`;
  document.head.appendChild(style);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function fileLink(f) {
    return '<a href="' + editorBase + encodeURIComponent(f) + '" target="_blank" title="Open in editor">' + f.replace(/^app\\//, '') + '</a>';
  }

  function kvPills(obj) {
    return '<div class="alab-kv">' + Object.entries(obj).map(function([k,v]) {
      return '<span class="alab-kv-item"><span class="alab-kv-key">' + k + '=</span>'
           + '<span class="alab-kv-val">' + v + '</span></span>';
    }).join('') + '</div>';
  }

  // ── Build boundary tree ───────────────────────────────────────────────────
  // Shows layouts (outermost→innermost) + page, each with SERVER/CLIENT badge.
  // A layout/page is "server" if the page exports ssr:true or is a layout file
  // (layouts run on the server as wrappers). For CSR pages the page node is CLIENT.
  function buildBoundaryTree() {
    const nodes = [];
    const allFiles = [...layouts, routeFile];
    allFiles.forEach(function(f, i) {
      const isPage = i === allFiles.length - 1;
      const isServer = isPage ? isSSR || isPPR : true; // layouts always server
      const indent = '  '.repeat(i);
      const connector = i === 0 ? '' : (i < allFiles.length - 1 ? '├─ ' : '└─ ');
      const pill = isPPR && isPage
        ? '<span class="alab-pill pill-ppr">PPR</span>'
        : isServer
          ? '<span class="alab-pill pill-server">SERVER</span>'
          : '<span class="alab-pill pill-client">CLIENT</span>';
      nodes.push(
        '<div class="alab-tree-node ' + (isPage ? 'is-page' : 'is-server') + '">' +
        '<span class="alab-indent">' + indent + connector + '</span>' +
        '<span class="alab-file">' + fileLink(f) + '</span>' +
        pill +
        '</div>'
      );
    });
    return '<div class="alab-tree">' + nodes.join('') + '</div>';
  }

  // ── Assemble panel ────────────────────────────────────────────────────────
  let panelHtml = '';

  // Route section
  panelHtml += '<div class="alab-section">'
    + '<div class="alab-section-title">Route</div>'
    + '<div class="alab-row"><span class="alab-lbl">file</span>'
    + '<span class="alab-val">' + fileLink(routeFile) + '</span></div>'
    + '<div class="alab-row"><span class="alab-lbl">mode</span>'
    + '<span class="alab-val"><span class="alab-badge" style="background:' + modeColor + '">' + mode + '</span></span></div>'
    + '</div>';

  // Boundary tree section
  panelHtml += '<div class="alab-section">'
    + '<div class="alab-section-title">Server / Client boundaries</div>'
    + buildBoundaryTree()
    + '</div>';

  // Params section
  if (hasParams || hasSearch) {
    panelHtml += '<div class="alab-section">'
      + '<div class="alab-section-title">Params</div>';
    if (hasParams) panelHtml += '<div class="alab-row"><span class="alab-lbl">route</span><span class="alab-val">' + kvPills(params) + '</span></div>';
    if (hasSearch) panelHtml += '<div class="alab-row"><span class="alab-lbl">search</span><span class="alab-val">' + kvPills(searchParams) + '</span></div>';
    panelHtml += '</div>';
  }

  // Build section
  panelHtml += '<div class="alab-section" style="padding-bottom:10px">'
    + '<div class="alab-section-title">Build</div>'
    + '<div class="alab-row"><span class="alab-lbl">id</span>'
    + '<span class="alab-val" style="color:#52525b">' + buildId + '</span></div>'
    + '</div>';

  // ── Toolbar bar ───────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.id = '__alab_toolbar';
  toolbar.innerHTML =
    '<div id="__alab_panel">' + panelHtml + '</div>' +
    '<div id="__alab_bar">' +
      '<span class="alab-logo">🔥</span>' +
      '<span class="alab-route"><b>' + routeFile.replace(/^app\\//, '') + '</b></span>' +
      '<span class="alab-badge" style="background:' + modeColor + '">' + mode + '</span>' +
      '<span class="alab-chev" id="__alab_chev">▲</span>' +
    '</div>';

  document.body.appendChild(toolbar);

  let open = false;
  document.getElementById('__alab_bar').addEventListener('click', function () {
    open = !open;
    document.getElementById('__alab_panel').classList.toggle('open', open);
    document.getElementById('__alab_chev').textContent = open ? '▼' : '▲';
  });
})();
</script>`;
}
