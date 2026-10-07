const CANVAS_W = 295;
const CANVAS_H = 150;
const STORAGE_KEY = 'dot_canvas_config';
const SCENE_KEY   = 'dot_canvas_scene';

const GUIDE_TOL = 1;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

let userScale = 1;

let apiKey   = '';
let deviceId = '';

const layoutEl      = document.getElementById('layout');
const pcOnly        = document.getElementById('pcOnly');
const paneCenter    = document.getElementById('paneCenter');
const canvasEl      = document.getElementById('canvas');
const previewWrap   = document.getElementById('previewWrap');
const guideV        = document.getElementById('guideV');
const guideH        = document.getElementById('guideH');
const zoomLabel     = document.getElementById('zoomLabel');
const layerListEl   = document.getElementById('layerList');
const layerCountEl  = document.getElementById('layerCount');
const propPanelEl   = document.getElementById('propPanel');
const codePreviewEl = document.getElementById('codePreview');
const sendBtn       = document.getElementById('sendBtn');
const clearBtn      = document.getElementById('clearBtn');
const statusEl      = document.getElementById('status');
const deviceBtn     = document.getElementById('deviceBtn');

const modalMask   = document.getElementById('modalMask');
const modalError  = document.getElementById('modalError');
const keyInput    = document.getElementById('keyInput');
const deviceInput = document.getElementById('deviceInput');
const saveBtn     = document.getElementById('saveBtn');
const cancelBtn   = document.getElementById('cancelBtn');

let scale = 1;

function fitPreview() {
  const pane = paneCenter;
  const availW = pane.clientWidth - 48;
  const availH = pane.clientHeight - 70;
  const baseScale = Math.min(availW / CANVAS_W, availH / CANVAS_H, 2.2);
  scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, baseScale * userScale));

  previewWrap.style.width  = (CANVAS_W * scale) + 'px';
  previewWrap.style.height = (CANVAS_H * scale) + 'px';

  canvasEl.style.width  = CANVAS_W + 'px';
  canvasEl.style.height = CANVAS_H + 'px';
  canvasEl.style.transform = 'scale(' + scale + ')';
  canvasEl.style.transformOrigin = 'top left';

  positionGuides();

  zoomLabel.textContent = Math.round(scale * 100) + '%';
}

window.addEventListener('resize', fitPreview);

function positionGuides() {
  const cx = (CANVAS_W / 2) * scale;
  const cy = (CANVAS_H / 2) * scale;
  guideV.style.left = cx + 'px';
  guideH.style.top  = cy + 'px';
}

function updateGuides() {
  const el = getSelected();
  if (!el) {
    guideV.classList.remove('show');
    guideH.classList.remove('show');
    return;
  }

  const cx = (CANVAS_W - el.w) / 2;
  const cy = (CANVAS_H - el.h) / 2;

  const centeredX = Math.abs(el.x - cx) <= GUIDE_TOL;
  const centeredY = Math.abs(el.y - cy) <= GUIDE_TOL;

  if (centeredX) guideV.classList.add('show');
  else guideV.classList.remove('show');

  if (centeredY) guideH.classList.add('show');
  else guideH.classList.remove('show');
}

paneCenter.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();

  const delta = e.deltaY > 0 ? -1 : 1;
  const next = userScale + delta * ZOOM_STEP;
  userScale = Math.max(0.3, Math.min(ZOOM_MAX / 1, next));

  fitPreview();
}, { passive: false });

window.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

let layers = [];
let selectedId = null;
let nextId = 1;

function makeId() {
  return 'el' + (nextId++);
}

function createText(opts) {
  return Object.assign({
    id: makeId(),
    type: 'text',
    text: '文本内容',
    x: 20,
    y: 20,
    w: 120,
    h: 24,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    bg: '#ffffff',
    align: 'left'
  }, opts || {});
}

function createBox(opts) {
  return Object.assign({
    id: makeId(),
    type: 'box',
    x: 20,
    y: 20,
    w: 120,
    h: 80,
    bg: '#ffffff',
    borderColor: '#000000',
    borderWidth: 1,
    radius: 0
  }, opts || {});
}

function createBar(opts) {
  return Object.assign({
    id: makeId(),
    type: 'bar',
    x: 20,
    y: 60,
    w: 200,
    h: 18,
    percent: 60,
    bg: '#ffffff',
    fillColor: '#000000',
    borderColor: '#000000',
    borderWidth: 1,
    radius: 0
  }, opts || {});
}

function saveScene() {
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify({ layers, nextId }));
  } catch (_) {}
}

function loadScene() {
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.layers) || obj.layers.length === 0) return false;
    layers = obj.layers;
    nextId = parseInt(obj.nextId, 10) || (layers.length + 1);
    layers.forEach((el) => {
      if (el.type === 'bar' && el.radius === undefined) el.radius = 0;
      if (el.type === 'box' && el.radius === undefined) el.radius = 0;
    });
    return true;
  } catch (_) {
    return false;
  }
}

const nodeMap = new Map();

function renderCanvas() {
  canvasEl.innerHTML = '';
  nodeMap.clear();

  layers.forEach((el) => {
    const node = document.createElement('div');
    node.className = 'cv-el' + (el.id === selectedId ? ' selected' : '');
    node.dataset.id = el.id;
    node.style.left   = el.x + 'px';
    node.style.top    = el.y + 'px';
    node.style.width  = el.w + 'px';
    node.style.height = el.h + 'px';

    if (el.type === 'text') {
      node.classList.add('cv-text');
      node.textContent = el.text;
      node.style.fontSize = el.fontSize + 'px';
      node.style.fontWeight = el.fontWeight;
      node.style.color = el.color;
      node.style.justifyContent =
        el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start');
      node.style.textAlign = el.align;
      node.style.background = el.bg;
    } else if (el.type === 'box') {
      node.classList.add('cv-box');
      node.style.background = el.bg;
      node.style.border = el.borderWidth + 'px solid ' + el.borderColor;
      node.style.borderRadius = el.radius + 'px';
    } else if (el.type === 'bar') {
      node.classList.add('cv-bar-track');
      node.style.background = el.bg;
      node.style.border = el.borderWidth + 'px solid ' + el.borderColor;
      node.style.borderRadius = el.radius + 'px';
      const fill = document.createElement('div');
      fill.className = 'cv-bar-fill';
      fill.style.width = Math.max(0, Math.min(100, el.percent)) + '%';
      fill.style.background = el.fillColor;
      fill.style.borderRadius = Math.max(0, el.radius - el.borderWidth) + 'px';
      node.appendChild(fill);
    }

    attachDrag(node, el);
    canvasEl.appendChild(node);
    nodeMap.set(el.id, node);
  });

  updateGuides();
}

let codeRafId = 0;
function scheduleCodeUpdate() {
  if (codeRafId) return;
  codeRafId = requestAnimationFrame(() => {
    codeRafId = 0;
    updateCode();
  });
}

function attachDrag(node, el) {
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    node.setPointerCapture(e.pointerId);

    if (selectedId !== el.id) {
      selectLayer(el.id);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const origX  = el.x;
    const origY  = el.y;

    let rafId = 0;
    let pendingX = origX;
    let pendingY = origY;

    node.classList.add('dragging');

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let nx = Math.round(origX + dx);
      let ny = Math.round(origY + dy);
      nx = Math.max(0, Math.min(CANVAS_W - el.w, nx));
      ny = Math.max(0, Math.min(CANVAS_H - el.h, ny));
      pendingX = nx;
      pendingY = ny;

      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        el.x = pendingX;
        el.y = pendingY;
        node.style.left = pendingX + 'px';
        node.style.top  = pendingY + 'px';
        const inputX = propInputs.x;
        const inputY = propInputs.y;
        if (inputX) inputX.value = pendingX;
        if (inputY) inputY.value = pendingY;
        updateGuides();
        scheduleCodeUpdate();
      });
    }

    function onUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      el.x = pendingX;
      el.y = pendingY;
      node.style.left = pendingX + 'px';
      node.style.top  = pendingY + 'px';

      node.classList.remove('dragging');
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);

      updateGuides();
      saveScene();
      updateCode();
    }

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  });
}

function renderLayerList() {
  layerListEl.innerHTML = '';
  layerCountEl.textContent = layers.length;

  if (layers.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = '暂无元素，请用上方按钮添加。';
    layerListEl.appendChild(hint);
    return;
  }

  layers.forEach((el) => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (el.id === selectedId ? ' active' : '');

    const type = document.createElement('span');
    type.className = 'layer-type';
    type.textContent = el.type === 'text' ? '文本' : (el.type === 'box' ? '容器' : '滚动条');

    const label = document.createElement('span');
    label.className = 'layer-text';
    if (el.type === 'text') {
      label.textContent = el.text || '(空)';
    } else if (el.type === 'box') {
      label.textContent = el.w + '×' + el.h;
    } else {
      label.textContent = el.percent + '%';
    }

    const del = document.createElement('button');
    del.className = 'layer-del';
    del.type = 'button';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeLayer(el.id);
    });

    item.appendChild(type);
    item.appendChild(label);
    item.appendChild(del);
    item.addEventListener('click', () => selectLayer(el.id));

    layerListEl.appendChild(item);
  });
}

function getSelected() {
  return layers.find((l) => l.id === selectedId) || null;
}

let propInputs = {};

function renderProps() {
  propPanelEl.innerHTML = '';
  propInputs = {};

  const el = getSelected();
  if (!el) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = '选择图层或添加元素后，可在此编辑属性。';
    propPanelEl.appendChild(hint);
    return;
  }

  function addField(labelText, key, type, extra) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    let input;
    if (type === 'range') {
      const row = document.createElement('div');
      row.className = 'slider-row';
      input = document.createElement('input');
      input.type = 'range';
      input.min = extra.min;
      input.max = extra.max;
      input.step = 1;
      input.value = el[key];
      const valEl = document.createElement('span');
      valEl.className = 'slider-val';
      valEl.textContent = el[key];
      row.appendChild(input);
      row.appendChild(valEl);
      wrap.appendChild(row);
    } else {
      input = document.createElement('input');
      input.type = type;
      input.value = el[key];
      if (extra) {
        if (extra.min !== undefined) input.min = extra.min;
        if (extra.max !== undefined) input.max = extra.max;
      }
      wrap.appendChild(input);
    }

    input.addEventListener('input', () => {
      let v = input.value;
      if (type === 'number' || type === 'range') v = parseInt(v, 10) || 0;
      el[key] = v;
      if (type === 'range') {
        const valEl = input.nextElementSibling;
        if (valEl) valEl.textContent = v;
      }
      renderCanvas();
      renderLayerList();
      updateCode();
      saveScene();
    });

    propInputs[key] = input;
    propPanelEl.appendChild(wrap);
  }

  function addSlider(labelText, key, min, max) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.className = 'slider-row';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = 1;
    input.value = el[key];

    const valEl = document.createElement('span');
    valEl.className = 'slider-val';
    valEl.textContent = el[key];

    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10) || 0;
      el[key] = v;
      valEl.textContent = v;
      renderCanvas();
      updateCode();
      saveScene();
    });

    row.appendChild(input);
    row.appendChild(valEl);
    wrap.appendChild(row);
    propInputs[key] = input;
    propPanelEl.appendChild(wrap);
  }

  function addTwoCols(defs) {
    const row = document.createElement('div');
    row.className = 'field-row-2';

    defs.forEach((d) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const label = document.createElement('label');
      label.textContent = d.label;
      wrap.appendChild(label);

      const input = document.createElement('input');
      input.type = 'number';
      input.min = 0;
      input.value = el[d.key];
      wrap.appendChild(input);

      input.addEventListener('input', () => {
        el[d.key] = Math.max(0, parseInt(input.value, 10) || 0);
        renderCanvas();
        renderLayerList();
        updateCode();
        saveScene();
      });

      propInputs[d.key] = input;
      row.appendChild(wrap);
    });

    propPanelEl.appendChild(row);
  }

  function addSelect(labelText, key, options) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    const sel = document.createElement('select');
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (el[key] === opt.value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      el[key] = sel.value;
      renderCanvas();
      updateCode();
      saveScene();
    });

    propInputs[key] = sel;
    wrap.appendChild(sel);
    propPanelEl.appendChild(wrap);
  }

  function addBlackWhite(labelText, key) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    const row = document.createElement('div');
