const canvas = new fabric.Canvas('c', { backgroundColor: '#fff', preserveObjectStacking: true });

function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    if (!container || !canvas) return;
    canvas.setDimensions({ width: container.clientWidth - 2, height: container.clientHeight - 2 });
    canvas.renderAll();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const socket = io();
const consoleOut = document.getElementById('console-output');
let curX = 0, curY = 0, homeX = 0, homeY = 0;

// --- Interactions ---
canvas.on('mouse:wheel', function(opt) {
    var zoom = canvas.getZoom() * (0.999 ** opt.e.deltaY); zoom = Math.min(Math.max(zoom, 0.01), 20);
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault(); opt.e.stopPropagation();
});
canvas.on('mouse:down', function(opt) { if (opt.e.altKey) { this.isDragging = true; this.selection = false; this.lastPosX = opt.e.clientX; this.lastPosY = opt.e.clientY; } });
canvas.on('mouse:move', function(opt) { if (this.isDragging) { var vpt = this.viewportTransform; vpt[4] += opt.e.clientX - this.lastPosX; vpt[5] += opt.e.clientY - this.lastPosY; this.requestRenderAll(); this.lastPosX = opt.e.clientX; this.lastPosY = opt.e.clientY; } });
canvas.on('mouse:up', function() { this.isDragging = false; this.selection = true; });

function changeZoom(m) { canvas.setZoom(canvas.getZoom() * m); }
function resetZoom() { canvas.setZoom(1); canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); }
function drawBed() { canvas.requestRenderAll(); }

canvas.on('after:render', function() {
    const ctx = canvas.getContext(); const vpt = canvas.viewportTransform; const zoom = canvas.getZoom();
    const stepsMmEl = document.getElementById('steps-mm');
    const stepsPerMm = stepsMmEl ? parseFloat(stepsMmEl.value) : 40;
    const maxXEl = document.getElementById('max-x');
    const maxYEl = document.getElementById('max-y');
    
    // REDSAIL Mapping: 
    // Horizontal Screen (X) -> Machine Carriage (HPGL Y, 0 to 630mm)
    // Vertical Screen (Y) -> Machine Roll (HPGL X, 0 to Depth)
    const maxX_mm = (maxXEl ? parseInt(maxXEl.value) : 25200) / stepsPerMm;
    const maxY_mm = (maxYEl ? parseInt(maxYEl.value) : 1000000) / stepsPerMm;
    
    ctx.save(); ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    
    // Draw Safe Zone (10mm margin for Redsail)
    ctx.setLineDash([2 / zoom, 2 / zoom]);
    ctx.strokeStyle = 'rgba(255, 168, 0, 0.3)'; ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(10, 10, maxX_mm - 20, maxY_mm - 20);
    ctx.setLineDash([]);
    
    // Draw Physical Limits (Carriage x Roll)
    ctx.strokeStyle = 'rgba(0, 168, 255, 0.5)'; ctx.lineWidth = 2 / zoom; 
    ctx.strokeRect(0, 0, maxX_mm, maxY_mm);
    
    // Axis labels
    ctx.fillStyle = 'rgba(0, 168, 255, 0.6)'; ctx.font = `${10/zoom}px Inter, sans-serif`;
    ctx.fillText('CARRIAGE (HPGL Y)', maxX_mm / 2 - (40/zoom), -5/zoom);
    ctx.save();
    ctx.translate(-5/zoom, maxY_mm / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('ROLL (HPGL X)', -30/zoom, 0);
    ctx.restore();

    // LIVE PLOTTER POSITION (CROSSHAIR)
    const machineX_mm = curX / stepsPerMm; // Carriage (Canvas X)
    const machineY_mm = curY / stepsPerMm; // Roll (Canvas Y)

    ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.moveTo(machineX_mm - (10/zoom), machineY_mm); ctx.lineTo(machineX_mm + (10/zoom), machineY_mm);
    ctx.moveTo(machineX_mm, machineY_mm - (10/zoom)); ctx.lineTo(machineX_mm, machineY_mm + (10/zoom));
    ctx.stroke();

    ctx.fillStyle = '#ff0000'; ctx.font = `${8/zoom}px JetBrains Mono`;
    ctx.fillText(`BLADE AT: ${Math.round(machineX_mm)}mm, ${Math.round(machineY_mm)}mm`, machineX_mm + (5/zoom), machineY_mm - (5/zoom));
    
    ctx.restore();
});

canvas.on('object:moving', (o) => { 
    const snapToGridEl = document.getElementById('snap-to-grid');
    if(snapToGridEl && snapToGridEl.checked) {
        const snapValueEl = document.getElementById('snap-value');
        const snap = snapValueEl ? parseFloat(snapValueEl.value) : 5;
        o.target.set({ left: Math.round(o.target.left/snap)*snap, top: Math.round(o.target.top/snap)*snap }); 
    }
});

function showNotice(msg, type='warning') {
    const toast = document.getElementById('alert-toast');
    const msgEl = document.getElementById('alert-msg');
    if (!toast || !msgEl) return;
    msgEl.innerText = msg;
    toast.className = 'alert-toast show ' + (type === 'danger' ? 'danger' : (type === 'success' ? 'success' : ''));
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- UI Sync ---
function showProps() {
    const obj = canvas.getActiveObject(); if(!obj) return;
    const props = document.getElementById('selection-props'); if(props) props.style.display = 'block';
    const noSel = document.getElementById('no-selection'); if(noSel) noSel.style.display = 'none';
    document.getElementById('obj-w').value = (obj.getScaledWidth()).toFixed(1);
    document.getElementById('obj-h').value = (obj.getScaledHeight()).toFixed(1);
    document.getElementById('obj-x').value = (obj.left).toFixed(1);
    document.getElementById('obj-y').value = (obj.top).toFixed(1);
    document.getElementById('obj-angle').value = (obj.angle || 0).toFixed(0);
    
    const steps = obj.curveSteps || 12;
    document.getElementById('curve-steps').value = steps;
    document.getElementById('curve-val').innerText = steps;
    
    updateLayers();
}

canvas.on('selection:created', showProps); canvas.on('selection:updated', showProps);
canvas.on('selection:cleared', () => { 
    const props = document.getElementById('selection-props'); if(props) props.style.display = 'none';
    const noSel = document.getElementById('no-selection'); if(noSel) noSel.style.display = 'block';
    updateLayers(); 
});
canvas.on('object:modified', showProps);

function applyPrecision() {
    const objs = canvas.getActiveObjects(); if(objs.length === 0) return;
    const steps = parseInt(document.getElementById('curve-steps').value);
    objs.forEach(o => {
        const targets = (o.type === 'activeSelection' || o.type === 'group') ? o.getObjects() : [o];
        targets.forEach(t => t.set('curveSteps', steps));
    });
    showNotice(`Set ${steps} segments precision`, 'success');
}

function updateLayers() {
    const list = document.getElementById('layer-list'); if (!list) return;
    list.innerHTML = '';
    const active = canvas.getActiveObjects();
    const allObjects = canvas.getObjects().filter(obj => !obj.isPreview);
    [...allObjects].reverse().forEach((obj, idx) => {
        const i = allObjects.length - 1 - idx;
        const item = document.createElement('div');
        const isActive = active.includes(obj);
        item.className = 'layer-item' + (isActive ? ' active' : '') + (obj.visible ? '' : ' hidden');
        const topLine = document.createElement('div'); topLine.className = 'layer-top';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'layer-checkbox'; cb.checked = isActive;
        cb.onclick = (e) => { e.stopPropagation(); toggleObjectSelection(obj); };
        topLine.appendChild(cb);
        const info = document.createElement('div'); info.className = 'layer-info';
        const name = document.createElement('div'); name.className = 'layer-name'; name.innerText = obj.name || `${obj.type.toUpperCase()} ${i + 1}`;
        info.appendChild(name); topLine.appendChild(info); item.appendChild(topLine);
        const actions = document.createElement('div'); actions.className = 'layer-actions';
        const visBtn = document.createElement('button'); visBtn.className = 'layer-action-btn' + (obj.visible ? ' active' : ''); visBtn.innerHTML = obj.visible ? '<i class="ph ph-eye"></i>' : '<i class="ph ph-eye-slash"></i>';
        visBtn.onclick = (e) => { e.stopPropagation(); obj.set('visible', !obj.visible); canvas.renderAll(); updateLayers(); saveState(); };
        const delBtn = document.createElement('button'); delBtn.className = 'layer-action-btn danger'; delBtn.innerHTML = '<i class="ph ph-trash"></i>';
        delBtn.onclick = (e) => { e.stopPropagation(); canvas.remove(obj); updateLayers(); saveState(); };
        actions.appendChild(visBtn); actions.appendChild(delBtn); item.appendChild(actions);
        item.onclick = (e) => { canvas.setActiveObject(obj); canvas.renderAll(); };
        list.appendChild(item);
    });
}

function toggleObjectSelection(obj) {
    const active = canvas.getActiveObjects();
    if (active.includes(obj)) {
        const next = active.filter(o => o !== obj); canvas.discardActiveObject();
        if (next.length > 1) { const sel = new fabric.ActiveSelection(next, { canvas: canvas }); canvas.setActiveObject(sel); } else if (next.length === 1) canvas.setActiveObject(next[0]);
    } else {
        const next = [...active, obj]; canvas.discardActiveObject(); const sel = new fabric.ActiveSelection(next, { canvas: canvas }); canvas.setActiveObject(sel);
    }
    canvas.renderAll();
}

function selectAllLayers(bool) { canvas.discardActiveObject(); if (bool) { const objs = canvas.getObjects().filter(o => !o.isPreview); const sel = new fabric.ActiveSelection(objs, { canvas: canvas }); canvas.setActiveObject(sel); } canvas.renderAll(); updateLayers(); }

// --- File Handling ---
document.getElementById('loader').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = (f) => {
        const svgText = f.target.result;
        const parser = new DOMParser(); 
        const doc = parser.parseFromString(svgText, "image/svg+xml"); 
        const svgEl = doc.documentElement;
        
        const widthAttr = svgEl.getAttribute('width');
        const heightAttr = svgEl.getAttribute('height');
        const viewBoxAttr = svgEl.getAttribute('viewBox');

        fabric.loadSVGFromString(svgText, (objs, opts) => {
            let scaleFactor = 1;
            
            const parseToMm = (val) => {
                if (!val) return null;
                if (val.includes('mm')) return parseFloat(val);
                if (val.includes('in')) return parseFloat(val) * 25.4;
                if (val.includes('pt')) return parseFloat(val) * (25.4/72);
                if (val.includes('cm')) return parseFloat(val) * 10;
                // Modern Web/Inkscape standard 96 DPI
                return parseFloat(val) * (25.4 / 96);
            };

            const physW = parseToMm(widthAttr);
            if (physW) scaleFactor = physW / opts.width;
            else if (viewBoxAttr) scaleFactor = 25.4 / 96;

            objs.forEach(obj => {
                if(!obj) return;
                if (scaleFactor !== 1) { obj.scaleX *= scaleFactor; obj.scaleY *= scaleFactor; obj.left *= scaleFactor; obj.top *= scaleFactor; }
                obj.set({ fill: 'transparent', stroke: '#00a8ff', strokeWidth: 0.5 / canvas.getZoom(), strokeUniform: true });
                canvas.add(obj);
            });
            
            canvas.renderAll(); 
            updateLayers();
            log(`Imported SVG. Scale: ${scaleFactor.toFixed(4)}`, 'rx');
        });
    }; r.readAsText(file);
};

// --- Device Control ---
async function refreshPorts() {
    try {
        const res = await fetch('/ports'); const ports = await res.json();
        const select = document.getElementById('port-select'); if(!select) return;
        select.innerHTML = '';
        ports.forEach(p => { const opt = document.createElement('option'); opt.value = p.path; opt.innerText = p.path; select.appendChild(opt); });
    } catch (err) { console.error(err); }
}

async function connectDevice() {
    const path = document.getElementById('port-select').value, baudRate = document.getElementById('baud-rate').value;
    if (!path) return alert("Select port");
    try {
        const res = await fetch('/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, baudRate, flowControl: 'hardware' }) });
        if (res.ok) { log("Connected (Hardware Flow Control)", 'tx'); showNotice("Connected to Redsail", 'success'); } else alert("Failed to connect");
    } catch (err) { alert("Connection error"); }
}

function updatePosDisplay() { 
    const px = document.getElementById('pos-x'), py = document.getElementById('pos-y');
    if(px) px.innerText = Math.round(curX); if(py) py.innerText = Math.round(curY); 
    const hx = document.getElementById('home-x-input'), hy = document.getElementById('home-y-input');
    if(hx) hx.value = curX; if(hy) hy.value = curY;
    canvas.requestRenderAll(); // Force redraw crosshair
}

function toggleCalibration() {
    const el = document.getElementById('cal-helper');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function applyCal() {
    const target = 100; // Expected 100mm
    const measured = parseFloat(document.getElementById('meas-val').value);
    if (!measured || measured <= 0) return alert("Enter measured length");
    const currentSteps = parseFloat(document.getElementById('steps-mm').value);
    // New Steps = (Target / Measured) * Current
    const newSteps = (target / measured) * currentSteps;
    document.getElementById('steps-mm').value = newSteps.toFixed(4);
    drawBed();
    saveState();
    showNotice(`Calibration Applied: ${newSteps.toFixed(4)} steps/mm`, 'success');
    toggleCalibration();
}

// --- Jogging ---
let jogInterval = null;
function startJog(dir) { if (jogInterval) return; doJog(dir); jogInterval = setInterval(() => doJog(dir), 150); }
function stopJog() { if (jogInterval) { clearInterval(jogInterval); jogInterval = null; } }

function doJog(d) {
    const s = parseInt(document.getElementById('stepSize').value || 400);
    let nX = curX, nY = curY;
    if(d==='up') nY -= s; if(d==='down') nY += s; if(d==='left') nX -= s; if(d==='right') nX += s;
    if (nX < 0 || nY < 0) { stopJog(); return showNotice("Boundary Limit (0,0)", 'warning'); }
    curX = nX; curY = nY; updatePosDisplay();
    // REDSAIL: Machine Y is Carriage (Canvas X), Machine X is Roll (Canvas Y)
    const cmd = `PU${curY},${curX};`;
    fetch('/jog', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command: cmd})});
    log(cmd.trim(), 'tx');
}

function setOrigin() { 
    curX = 0; curY = 0; homeX = 0; homeY = 0; 
    updatePosDisplay(); 
    log("Machine Zeroed", 'tx'); 
    saveState(); 
}
function goToOrigin() { 
    curX = 0; curY = 0; updatePosDisplay(); 
    const cmd = `PU0,0;`;
    fetch('/jog', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command: cmd})}); 
    log("Sent PU0,0", 'tx');
}

function manualSetOrigin() { 
    curX = parseInt(document.getElementById('home-x-input').value || 0); 
    curY = parseInt(document.getElementById('home-y-input').value || 0); 
    updatePosDisplay(); saveState(); 
}

// --- Tools ---
function rotateObj() { const o = canvas.getActiveObject(); if(o) { o.set('angle', parseFloat(document.getElementById('obj-angle').value)).setCoords(); canvas.renderAll(); saveState(); } }
function flipObj(d) { const o = canvas.getActiveObject(); if(o) { if(d==='h') o.set('flipX', !o.flipX); else o.set('flipY', !o.flipY); o.setCoords(); canvas.renderAll(); saveState(); } }
function moveObj() { const o = canvas.getActiveObject(); if(o) { o.set({left: parseFloat(document.getElementById('obj-x').value), top: parseFloat(document.getElementById('obj-y').value)}).setCoords(); canvas.renderAll(); saveState(); } }
function resizeObj(a) {
    const o = canvas.getActiveObject(); if (!o) return;
    const v = parseFloat(document.getElementById('obj-' + a).value); if (isNaN(v) || v <= 0) return;
    if (a === 'w') { const ratio = v / o.getScaledWidth(); o.set('scaleX', ratio * o.scaleX); if (document.getElementById('lock-ratio').checked) o.set('scaleY', ratio * o.scaleY); } 
    else { const ratio = v / o.getScaledHeight(); o.set('scaleY', ratio * o.scaleY); if (document.getElementById('lock-ratio').checked) o.set('scaleX', ratio * o.scaleX); }
    o.setCoords(); canvas.requestRenderAll(); saveState(); showProps();
}
function alignObj(dir) {
    const sel = canvas.getActiveObject(); if (!sel) return;
    const steps = parseFloat(document.getElementById('steps-mm').value || 40);
    const maxX = parseInt(document.getElementById('max-x').value || 25200), maxY = parseInt(document.getElementById('max-y').value || 1000000);
    const displayW = maxX / steps, displayH = maxY / steps;
    if (dir === 'left') sel.set({ left: 0, originX: 'left' }); if (dir === 'right') sel.set({ left: displayW, originX: 'right' });
    if (dir === 'top') sel.set({ top: 0, originY: 'top' }); if (dir === 'bottom') sel.set({ top: displayH, originY: 'bottom' });
    if (dir === 'centerX') sel.set({ left: displayW / 2, originX: 'center' }); if (dir === 'centerY') sel.set({ top: displayH / 2, originY: 'center' });
    sel.setCoords(); canvas.renderAll(); saveState(); showProps();
}

function deleteObj() {
    const active = canvas.getActiveObjects();
    if (active.length > 0) { active.forEach(obj => canvas.remove(obj)); canvas.discardActiveObject(); canvas.renderAll(); updateLayers(); saveState(); }
}

// --- Path Extraction ---
function extractPaths(objs, origin = { x: 0, y: 0 }) {
    const pathList = [];
    objs.forEach(o => {
        const targets = (o.type === 'activeSelection' || o.type === 'group') ? o.getObjects() : [o];
        targets.forEach(t => {
            if (!t.visible) return;
            let matrix = t.calcTransformMatrix();
            let parent = t.group;
            while (parent) { matrix = fabric.util.multiplyTransformMatrices(parent.calcTransformMatrix(), matrix); parent = parent.group; }
            
            let segments = [];
            let pOff = { x: 0, y: 0 };
            if (t.path) { segments = t.path; pOff = t.pathOffset || { x: 0, y: 0 }; } 
            else if (t.toPathObject) { const po = t.toPathObject(); segments = po.path; pOff = po.pathOffset || { x: 0, y: 0 }; }
            else if (t.type === 'rect') { const w = t.width, h = t.height; const x = -w/2, y = -h/2; segments = [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]; pOff = { x: 0, y: 0 }; }

            if (segments.length > 0) {
                const steps = t.curveSteps || 12;
                const tp = [];
                let startPos = null, currentPos = { x: 0, y: 0 };
                const transform = (rawX, rawY) => {
                    const pt = fabric.util.transformPoint({ x: rawX - pOff.x, y: rawY - pOff.y }, matrix);
                    return { x: pt.x - origin.x, y: pt.y - origin.y };
                };
                segments.forEach((seg) => {
                    const cmd = seg[0]; 
                    if (cmd === 'M') { const fPt = transform(seg[1], seg[2]); tp.push(['M', fPt.x, fPt.y]); currentPos = fPt; startPos = fPt; } 
                    else if (cmd === 'L') { const fPt = transform(seg[1], seg[2]); tp.push(['L', fPt.x, fPt.y]); currentPos = fPt; } 
                    else if (cmd === 'C') {
                        const p0 = { x: currentPos.x, y: currentPos.y };
                        const cp1 = transform(seg[1], seg[2]);
                        const cp2 = transform(seg[3], seg[4]);
                        const p3 = transform(seg[5], seg[6]);
                        for (let i = 1; i <= steps; i++) {
                            const t_v = i / steps; const invT = 1 - t_v;
                            const x = Math.pow(invT, 3) * p0.x + 3 * Math.pow(invT, 2) * t_v * cp1.x + 3 * invT * Math.pow(t_v, 2) * cp2.x + Math.pow(t_v, 3) * p3.x;
                            const y = Math.pow(invT, 3) * p0.y + 3 * Math.pow(invT, 2) * t_v * cp1.y + 3 * invT * Math.pow(t_v, 2) * cp2.y + Math.pow(t_v, 3) * p3.y;
                            tp.push(['L', x, y]);
                        }
                        currentPos = p3;
                    } 
                    else if (cmd === 'Q') {
                        const p0 = { x: currentPos.x, y: currentPos.y };
                        const cp1 = transform(seg[1], seg[2]);
                        const p2 = transform(seg[3], seg[4]);
                        for (let i = 1; i <= steps; i++) {
                            const t_v = i / steps; const invT = 1 - t_v;
                            const x = Math.pow(invT, 2) * p0.x + 2 * invT * t_v * cp1.x + Math.pow(t_v, 2) * p2.x;
                            const y = Math.pow(invT, 2) * p0.y + 2 * invT * t_v * cp1.y + Math.pow(t_v, 2) * p2.y;
                            tp.push(['L', x, y]);
                        }
                        currentPos = p2;
                    }
                    else if (cmd === 'Z' || cmd === 'z') { if (startPos) { tp.push(['L', startPos.x, startPos.y]); currentPos = startPos; } }
                });
                pathList.push({ segments: tp });
            }
        });
    });
    return pathList;
}

function startPlot() {
    const objs = canvas.getActiveObjects(); if(objs.length === 0) return alert("Select objects");
    const steps = parseFloat(document.getElementById('steps-mm').value || 40);
    const maxX = document.getElementById('max-x').value, maxY = document.getElementById('max-y').value;
    const paths = extractPaths(objs, {x:0, y:0});
    fetch('/plot', { 
        method:'POST', headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ paths, offsetX: 0, offsetY: 0, stepsPerMm: steps, maxX, maxY }) 
    }).then(async r => { if(!r.ok) { const txt = await r.text(); showNotice(txt || "Check Machine Limits", 'danger'); console.error(txt); } });
}

function checkBoundary() {
    const active = canvas.getActiveObject(); if(!active) return alert("Select objects");
    const steps = parseFloat(document.getElementById('steps-mm').value || 40);
    const maxX = document.getElementById('max-x').value, maxY = document.getElementById('max-y').value;
    
    // Get individual objects from a selection/group
    const targets = (active.type === 'activeSelection' || active.type === 'group') ? active.getObjects() : [active];
    
    const paths = [];
    targets.forEach(t => {
        // getBoundingRect(true) provides coordinates relative to the canvas origin
        const bounds = t.getBoundingRect(true);
        const segments = [ 
            ['M', bounds.left, bounds.top], 
            ['L', bounds.left + bounds.width, bounds.top], 
            ['L', bounds.left + bounds.width, bounds.top + bounds.height], 
            ['L', bounds.left, bounds.top + bounds.height], 
            ['L', bounds.left, bounds.top] 
        ];
        paths.push({ segments });
    });
    
    fetch('/plot', { 
        method:'POST', headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ paths, dryRun: true, offsetX: 0, offsetY: 0, stepsPerMm: steps, maxX, maxY }) 
    }).then(async r => { 
        if(!r.ok) { 
            const txt = await r.text(); 
            showNotice(txt || "Check Machine Limits", 'danger'); 
            console.error(txt); 
        } else {
            showNotice("Tracing boundary for " + targets.length + " object(s)...", 'success');
        }
    });
}

function previewPlot() {
    const objs = canvas.getActiveObjects(); if(objs.length === 0) return alert("Select objects");
    const steps = parseFloat(document.getElementById('steps-mm').value || 40);
    const maxX = document.getElementById('max-x').value, maxY = document.getElementById('max-y').value;
    const paths = extractPaths(objs, {x:0, y:0});
    fetch('/plot', { 
        method:'POST', headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ paths, dryRun: true, offsetX: 0, offsetY: 0, stepsPerMm: steps, maxX, maxY }) 
    }).then(async r => { if(!r.ok) { const txt = await r.text(); showNotice(txt || "Check Machine Limits", 'danger'); console.error(txt); } });
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function log(m, t='rx') { 
    const output = document.getElementById('console-output'); if (!output) return;
    const l = document.createElement('div'); l.className = 'log-line'; l.innerText = (t==='tx' ? '>> ' : '<< ') + m; l.style.color = t==='tx' ? '#00a8ff' : '#0f0'; 
    output.appendChild(l); requestAnimationFrame(() => output.scrollTop = output.scrollHeight); 
}
function toggleUILock(locked) { document.querySelectorAll('.ui-ctrl').forEach(el => { el.disabled = locked; }); }

function sendCmd() {
    const i = document.getElementById('cmdInput'), c = i ? i.value : null; if(!c) return;
    fetch('/jog', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command: c})});
    log(c, 'tx'); i.value = '';
}

function saveState() {
    const s = { curX, curY, homeX, homeY, stepsPerMm: document.getElementById('steps-mm').value, maxX: document.getElementById('max-x').value, maxY: document.getElementById('max-y').value, baudRate: document.getElementById('baud-rate').value };
    localStorage.setItem('plotter_state', JSON.stringify(s));
}
function loadState() {
    const saved = localStorage.getItem('plotter_state'); if (!saved) return;
    const s = JSON.parse(saved); curX = s.curX; curY = s.curY; homeX = s.homeX || 0; homeY = s.homeY || 0;
    
    // Auto-update to 630mm for RS720C if still on old 600mm limit
    if (s.maxX == 24000) s.maxX = 25200;

    if(document.getElementById('steps-mm')) document.getElementById('steps-mm').value = s.stepsPerMm;
    if(document.getElementById('max-x')) document.getElementById('max-x').value = s.maxX;
    if(document.getElementById('max-y')) document.getElementById('max-y').value = s.maxY;
    if(document.getElementById('baud-rate')) document.getElementById('baud-rate').value = s.baudRate;
    updatePosDisplay();
}

window.onload = () => { refreshPorts(); loadState(); };
socket.on('progress', d => { 
    const fill = document.getElementById('fill'); if(fill) fill.style.width = d.percent + '%'; 
    toggleUILock(d.percent < 100); if(d.currentCommand) log(d.currentCommand, 'tx');
});
socket.on('serial-data', m => log(m, 'rx'));
socket.on('execution-state', l => toggleUILock(l));
socket.on('connection-status', c => { 
    const dot = document.getElementById('status-dot'), text = document.getElementById('status-text');
    const dotM = document.getElementById('status-dot-mobile'), textM = document.getElementById('status-text-mobile');
    const color = c ? 'var(--success)' : 'var(--danger)'; const status = c ? "ONLINE" : "OFFLINE";
    if(dot) dot.style.background = color; if(text) { text.innerText = status; text.style.color = color; }
    if(dotM) dotM.style.background = color; if(textM) { textM.innerText = status; textM.style.color = color; }
});
