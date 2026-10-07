const CANVAS_W = 295;
const CANVAS_H = 150;
const STORAGE_KEY = 'dot_canvas_config';
const SCENE_KEY   = 'dot_canvas_scene';

const GUIDE_TOL = 1;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

/* ================= 运行时状态 ================= */
let userScale = 1;
let scale = 1;

let apiKey   = '';
let deviceId = '';

let layers = [];
let selectedId = null;
let nextId = 1;
let propInputs = {};
let codeRafId = 0;

const nodeMap = new Map();

let layoutEl, pcOnly, paneCenter, canvasEl, previewWrap;
let guideV, guideH, zoomLabel;
let layerListEl, layerCountEl, propPanelEl, codePreviewEl;
let sendBtn, clearBtn, statusEl, deviceBtn;
let modalMask, modalError, keyInput, deviceInput, saveBtn, cancelBtn;

/* ================= 入口 ================= */
document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheDom();
  bindZoomGuards();
  bindConfigEvents();
  bindToolbarEvents();
  bindCanvasEvents();

  checkScreen();

  if (!loadScene()) {
    layers = defaultScene();
    selectedId = null;
  }

  renderCanvas();
  renderLayerList();
  renderProps();
  updateCode();
  fitPreview();

  const savedConfig = loadConfig();
  if (savedConfig) {
    applyConfig(savedConfig);
  } else {
    deviceBtn.textContent = '未配置';
    openModal(true);
  }
}

function cacheDom() {
  layoutEl      = document.getElementById('layout');
  pcOnly        = document.getElementById('pcOnly');
  paneCenter    = document.getElementById('paneCenter');
  canvasEl      = document.getElementById('canvas');
  previewWrap   = document.getElementById('previewWrap');
  guideV        = document.getElementById('guideV');
  guideH        = document.getElementById('guideH');
  zoomLabel     = document.getElementById('zoomLabel');
  layerListEl   = document.getElementById('layerList');
  layerCountEl  = document.getElementById('layerCount');
  propPanelEl   = document.getElementById('propPanel');
  codePreviewEl = document.getElementById('codePreview');
  sendBtn       = document.getElementById('sendBtn');
  clearBtn      = document.getElementById('clearBtn');
  statusEl      = document.getElementById('status');
  deviceBtn     = document.getElementById('deviceBtn');

  modalMask   = document.getElementById('modalMask');
  modalError  = document.getElementById('modalError');
  keyInput    = document.getElementById('keyInput');
  deviceInput = document.getElementById('deviceInput');
  saveBtn     = document.getElementById('saveBtn');
  cancelBtn   = document.getElementById('cancelBtn');
}

/* ================= 缩放与视图 ================= */
function fitPreview() {
  const availW = paneCenter.clientWidth - 48;
  const availH = paneCenter.clientHeight - 70;
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

function positionGuides() {
  guideV.style.left = (CANVAS_W / 2) * scale + 'px';
  guideH.style.top  = (CANVAS_H / 2) * scale + 'px';
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

  if (Math.abs(el.x - cx) <= GUIDE_TOL) guideV.classList.add('show');
  else guideV.classList.remove('show');

  if (Math.abs(el.y - cy) <= GUIDE_TOL) guideH.classList.add('show');
  else guideH.classList.remove('show');
}

function bindZoomGuards() {
  paneCenter.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -1 : 1;
    userScale = Math.max(0.3, Math.min(ZOOM_MAX, userScale + delta * ZOOM_STEP));
    fitPreview();
  }, { passive: false });

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturestart',  (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend',    (e) => e.preventDefault());

  window.addEventListener('resize', () => {
    checkScreen();
    fitPreview();
  });
}

/* ================= 元素工厂 ================= */
function makeId() {
  return 'el' + (nextId++);
}

function createText(opts) {
  return Object.assign({
    id: makeId(),
    type: 'text',
    text: '文本内容',
    x: 20, y: 20, w: 120, h: 24,
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
    x: 20, y: 20, w: 120, h: 80,
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
    x: 20, y: 60, w: 200, h: 18,
    percent: 60,
    bg: '#ffffff',
    fillColor: '#000000',
    borderColor: '#000000',
    borderWidth: 1,
    radius: 0
  }, opts || {});
}

function defaultScene() {
  return [
    createText({ x: 12, y: 10,  w: 260, h: 26, text: 'TODAY', fontSize: 20, fontWeight: 'bold', bg: '#ffffff' }),
    createBox ({ x: 12, y: 44,  w: 270, h: 1,  bg: '#000000', borderWidth: 0, borderColor: '#000000', radius: 0 }),
    createText({ x: 12, y: 56,  w: 260, h: 22, text: '✓ 整理本周的项目计划', fontSize: 16, fontWeight: 'normal', bg: '#ffffff' }),
    createText({ x: 12, y: 82,  w: 260, h: 22, text: '○ 回复设计稿的反馈意见', fontSize: 16, fontWeight: 'normal', bg: '#ffffff' }),
    createText({ x: 12, y: 108, w: 260, h: 22, text: '○ 阅读 30 分钟', fontSize: 16, fontWeight: 'normal', bg: '#ffffff' })
  ];
}

/* ================= 场景存取 ================= */
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

/* ================= 渲染画板 ================= */
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

    if (selectedId !== el.id) selectLayer(el.id);

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
      pendingX = Math.max(0, Math.min(CANVAS_W - el.w, Math.round(origX + dx)));
      pendingY = Math.max(0, Math.min(CANVAS_H - el.h, Math.round(origY + dy)));

      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        el.x = pendingX;
        el.y = pendingY;
        node.style.left = pendingX + 'px';
        node.style.top  = pendingY + 'px';
        if (propInputs.x) propInputs.x.value = pendingX;
        if (propInputs.y) propInputs.y.value = pendingY;
        updateGuides();
        scheduleCodeUpdate();
      });
    }

    function onUp() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
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

/* ================= 图层列表 ================= */
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
    if (el.type === 'text') label.textContent = el.text || '(空)';
    else if (el.type === 'box') label.textContent = el.w + '×' + el.h;
    else label.textContent = el.percent + '%';

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

/* ================= 属性面板 ================= */
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
    row.className = 'bw-row';

    const options = [
      { value: '#ffffff', labelText: '白', cls: 'white' },
      { value: '#000000', labelText: '黑', cls: 'black' }
    ];

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bw-btn' + (el[key] === opt.value ? ' active' : '');

      const swatch = document.createElement('span');
      swatch.className = 'swatch ' + opt.cls;

      const txt = document.createElement('span');
      txt.textContent = opt.labelText;

      btn.appendChild(swatch);
      btn.appendChild(txt);

      btn.addEventListener('click', () => {
        el[key] = opt.value;
        row.querySelectorAll('.bw-btn').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        renderCanvas();
        updateCode();
        saveScene();
      });

      row.appendChild(btn);
    });

    propInputs[key] = row;
    wrap.appendChild(row);
    propPanelEl.appendChild(wrap);
  }

  if (el.type === 'text') {
    addField('文本内容', 'text', 'text');
    addTwoCols([{ label: '宽 W', key: 'w' }, { label: '高 H', key: 'h' }]);
    addField('字号', 'fontSize', 'number', { min: 8, max: 72 });
    addSelect('字重', 'fontWeight', [
      { value: 'normal', label: '常规' },
      { value: 'bold', label: '加粗' }
    ]);
    addSelect('对齐', 'align', [
      { value: 'left', label: '左对齐' },
      { value: 'center', label: '居中' },
      { value: 'right', label: '右对齐' }
    ]);
    addBlackWhite('文字颜色', 'color');
    addBlackWhite('背景色', 'bg');
  } else if (el.type === 'box') {
    addTwoCols([{ label: '宽 W', key: 'w' }, { label: '高 H', key: 'h' }]);
    addField('边框粗细', 'borderWidth', 'number', { min: 0, max: 8 });
    addSlider('圆角', 'radius', 0, 60);
    addBlackWhite('背景色', 'bg');
    addBlackWhite('边框颜色', 'borderColor');
  } else if (el.type === 'bar') {
    addTwoCols([{ label: '宽 W', key: 'w' }, { label: '高 H', key: 'h' }]);
    addField('百分比', 'percent', 'range', { min: 0, max: 100 });
    addField('边框粗细', 'borderWidth', 'number', { min: 0, max: 8 });
    addSlider('圆角', 'radius', 0, 60);
    addBlackWhite('背景色', 'bg');
    addBlackWhite('填充色', 'fillColor');
    addBlackWhite('边框颜色', 'borderColor');
  }

  addTwoCols([{ label: 'X 坐标', key: 'x' }, { label: 'Y 坐标', key: 'y' }]);
}

/* ================= 选中 / 增删 ================= */
function selectLayer(id) {
  selectedId = id;
  renderCanvas();
  renderLayerList();
  renderProps();
}

function removeLayer(id) {
  layers = layers.filter((l) => l.id !== id);
  if (selectedId === id) selectedId = null;
  renderCanvas();
  renderLayerList();
  renderProps();
  updateCode();
  saveScene();
}

function addLayer(type) {
  let el;
  if (type === 'text') el = createText({ x: 20, y: 20 + layers.length * 6 });
  else if (type === 'box') el = createBox({ x: 20, y: 20 + layers.length * 6 });
  else el = createBar({ x: 20, y: 40 + layers.length * 6 });

  layers.push(el);
  selectLayer(el.id);
  updateCode();
  saveScene();
}

function bindToolbarEvents() {
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addLayer(btn.dataset.add));
  });

  clearBtn.addEventListener('click', () => {
    if (layers.length === 0) return;
    if (!confirm('清空所有元素？')) return;
    layers = [];
    selectedId = null;
    renderCanvas();
    renderLayerList();
    renderProps();
    updateCode();
    saveScene();
  });

  sendBtn.addEventListener('click', send);
}

function bindCanvasEvents() {
  canvasEl.addEventListener('pointerdown', (e) => {
    if (e.target === canvasEl) {
      selectedId = null;
      renderCanvas();
      renderLayerList();
      renderProps();
    }
  });
}

/* ================= JSON 生成 ================= */
function buildChildren() {
  if (layers.length === 0) {
    return [{
      type: 'span',
      props: { tw: 'text-14-chillduansans', children: '画板为空' }
    }];
  }

  return layers.map((el) => {
    const baseStyle = {
      position: 'absolute',
      left: el.x + 'px',
      top: el.y + 'px',
      width: el.w + 'px',
      height: el.h + 'px'
    };

    if (el.type === 'text') {
      const style = Object.assign({}, baseStyle, {
        fontSize: el.fontSize + 'px',
        fontWeight: el.fontWeight,
        color: el.color,
        textAlign: el.align,
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        backgroundColor: el.bg
      });
      return { type: 'div', props: { tw: 'flex', style, children: el.text || '' } };
    }

    if (el.type === 'box') {
      const style = Object.assign({}, baseStyle, {
        backgroundColor: el.bg,
        border: el.borderWidth + 'px solid ' + el.borderColor,
        borderRadius: el.radius + 'px'
      });
      return { type: 'div', props: { style, children: '' } };
    }

    const trackStyle = Object.assign({}, baseStyle, {
      backgroundColor: el.bg,
      border: el.borderWidth + 'px solid ' + el.borderColor,
      borderRadius: el.radius + 'px',
      overflow: 'hidden'
    });

    return {
      type: 'div',
      props: {
        style: trackStyle,
        children: [{
          type: 'div',
          props: {
            style: {
              width: Math.max(0, Math.min(100, el.percent)) + '%',
              height: '100%',
              backgroundColor: el.fillColor
            },
            children: ''
          }
        }]
      }
    };
  });
}

function buildBody() {
  return {
    refreshNow: true,
    taskAlias: '可视化画板',
    border: 0,
    data: {},
    windowData: {
      default: [{
        type: 'div',
        props: {
          tw: 'flex flex-col w-full h-full min-w-0 min-h-0',
          style: { backgroundColor: '#ffffff', color: '#000000', position: 'relative' },
          children: buildChildren()
        }
      }]
    },
    layoutFull: { tw: 'p-0' }
  };
}

function updateCode() {
  codePreviewEl.textContent = JSON.stringify(buildBody(), null, 2);
}

/* ================= 配置存取 ================= */
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg && typeof cfg.apiKey === 'string' && cfg.apiKey.trim() &&
        typeof cfg.deviceId === 'string' && cfg.deviceId.trim()) {
      return { apiKey: cfg.apiKey.trim(), deviceId: cfg.deviceId.trim() };
    }
  } catch (_) {}
  return null;
}

function saveConfig(key, device) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: key, deviceId: device }));
    return true;
  } catch (_) {
    return false;
  }
}

function applyConfig(cfg) {
  apiKey   = cfg.apiKey;
  deviceId = cfg.deviceId;
  deviceBtn.textContent = deviceId;
}

function openModal(isFirstTime) {
  modalError.classList.remove('show');
  keyInput.value    = apiKey || '';
  deviceInput.value = deviceId || '';
  cancelBtn.hidden  = !!isFirstTime;
  modalMask.hidden  = false;
  setTimeout(() => {
    (apiKey ? deviceInput : keyInput).focus();
  }, 30);
}

function closeModal() {
  modalMask.hidden = true;
}

function handleSave() {
  const key    = keyInput.value.trim();
  const device = deviceInput.value.trim();

  if (!key || !device) {
    modalError.textContent = '请把 API 密钥和设备序列号都填写完整。';
    modalError.classList.add('show');
    return;
  }

  if (!saveConfig(key, device)) {
    modalError.textContent = '保存失败：浏览器可能禁用了本地存储。';
    modalError.classList.add('show');
    return;
  }

  applyConfig({ apiKey: key, deviceId: device });
  closeModal();
  setStatus('success', '✓ 配置已保存到本机。');
}

function bindConfigEvents() {
  deviceBtn.addEventListener('click', () => openModal(false));
  saveBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', closeModal);

  [keyInput, deviceInput].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSave();
    });
  });
}

/* ================= 发送 ================= */
function setStatus(kind, message) {
  statusEl.hidden = false;
  statusEl.className = 'status ' + kind;
  statusEl.textContent = message;
}

async function send() {
  if (!apiKey || !deviceId) {
    openModal(true);
    return;
  }

  const endpoint = 'https://dot.mindreset.tech/api/authV2/open/device/'
                   + encodeURIComponent(deviceId) + '/canvas';

  sendBtn.disabled = true;
  sendBtn.textContent = '发送中…';
  setStatus('pending', '正在发送到设备 ' + deviceId + ' …');

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(buildBody())
    });

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}

    if (res.ok) {
      setStatus('success', '✓ ' + ((data && data.message) || '已发送。'));
    } else {
      setStatus('error',
        '✗ 请求失败（HTTP ' + res.status + '）：'
          + ((data && data.message) || text || res.statusText));
    }
  } catch (err) {
    setStatus('error', '✗ 网络错误：' + err.message);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '发送到设备';
  }
}

function checkScreen() {
  if (window.innerWidth < 900) {
    pcOnly.hidden = false;
    layoutEl.style.display = 'none';
  } else {
    pcOnly.hidden = true;
    layoutEl.style.display = 'flex';
  }
}
