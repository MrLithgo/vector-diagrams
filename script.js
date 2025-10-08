class VectorSimulator {
  constructor() {
    // DOM & contexts
    this.leftCanvas = document.getElementById('leftCanvas');
    this.rightCanvas = document.getElementById('rightCanvas');
    this.leftCtx = this.leftCanvas.getContext('2d');
    this.rightCtx = this.rightCanvas.getContext('2d');

    // state
    this.leftVectors = [];
    this.rightVectors = [];
    this.showComponents = false;
    this.showAngles = false; 
    this.colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    this.colorIndex = 0;

    // drawing/interaction helpers
    this.isDrawing = false;      // drawing new left vector
    this.startPos = null;
    this.dragging = null;        // index when dragging whole right vector
    this.draggingMode = null;    // "move" | "editEnd"
    this.dragOffset = { x: 0, y: 0 };

    // cached client sizes
    this.leftClientW = 0;
    this.leftClientH = 0;
    this.rightClientW = 0;
    this.rightClientH = 0;

    // Zoom & pan state (per canvas)
    this.leftScale = 1;
    this.rightScale = 1;
    this.leftOffset = { x: 0, y: 0 };
    this.rightOffset = { x: 0, y: 0 };

    // pointer/touch tracking & pinch
    this._pointers = {}; // pointerId -> {x,y,canvas,prevX,prevY,time}
    this._pinch = null;  // pinch tracking object

    // inertia / smoothing
    this._animating = false;
    this._panInertia = { active: false, vx: 0, vy: 0, target: null, lastTime: 0 };

    // zoom constraints & params
    this.ZOOM_STEP = 1.2;
    this.MIN_SCALE = 0.25;
    this.MAX_SCALE = 6;

    // Setup UI hooks
   // Setup UI hooks
const btnIn = document.getElementById('zoomInBtn');
const btnOut = document.getElementById('zoomOutBtn');
const btnReset = document.getElementById('resetZoomBtn');
if (btnIn) btnIn.addEventListener('click', () => {
  this.animateZoomTo('left', this.leftScale * this.ZOOM_STEP, 300);
  this.animateZoomTo('right', this.rightScale * this.ZOOM_STEP, 300);
});
if (btnOut) btnOut.addEventListener('click', () => {
  this.animateZoomTo('left', this.leftScale / this.ZOOM_STEP, 300);
  this.animateZoomTo('right', this.rightScale / this.ZOOM_STEP, 300);
});
if (btnReset) btnReset.addEventListener('click', () => { 
  this.animateResetView('left', 300); 
  this.animateResetView('right', 300); 
});

    // Setup
    this.setupResponsiveCanvas();
    this.setupEventListeners();
    this.draw();
  }

  /*******************
   * Responsive setup
   *******************/
  setupResponsiveCanvas() {
    this.resizeCanvases();
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.resizeCanvases(), 120);
    });
  }

  resizeCanvases() {
    const leftRect = this.leftCanvas.getBoundingClientRect();
    const rightRect = this.rightCanvas.getBoundingClientRect();
    const MAX_CANVAS = 720;
    const sharedWidth = Math.min(leftRect.width || MAX_CANVAS, rightRect.width || MAX_CANVAS, MAX_CANVAS);
    const clientW = Math.max(120, Math.floor(sharedWidth));
    const clientH = clientW;

    const dpr = window.devicePixelRatio || 1;

    // store previous values for scaling if needed
    const prevLeftW = this.leftClientW || leftRect.width || clientW;
    const prevRightW = this.rightClientW || rightRect.width || clientW;
    const scaleLeft = prevLeftW ? (clientW / prevLeftW) : 1;
    const scaleRight = prevRightW ? (clientW / prevRightW) : 1;

    // apply to both canvases
    const applySize = (canvas, ctx) => {
      canvas.style.width = clientW + 'px';
      canvas.style.height = clientH + 'px';
      canvas.width = Math.max(1, Math.floor(clientW * dpr));
      canvas.height = Math.max(1, Math.floor(clientH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize(this.leftCanvas, this.leftCtx);
    applySize(this.rightCanvas, this.rightCtx);

    // Update left vectors
    this.leftVectors.forEach(v => {
      if (v.start && v.end) {
        const prevLeftCenter = { x: prevLeftW / 2, y: prevLeftW / 2 };
        if (Math.abs(v.start.x - prevLeftCenter.x) < 3 && Math.abs(v.start.y - prevLeftCenter.y) < 3) {
          const newLeftCenter = { x: clientW / 2, y: clientH / 2 };
          v.start = { ...newLeftCenter };
          const radians = (v.angle || 0) * Math.PI / 180;
          const length = (v.magnitude || 0) * 3;
          v.end = { x: v.start.x + length * Math.sin(radians), y: v.start.y - length * Math.cos(radians) };
        } else {
          v.start.x *= scaleLeft; v.start.y *= scaleLeft;
          v.end.x   *= scaleLeft; v.end.y   *= scaleLeft;
        }
      }
    });

    // Scale right vectors
    this.rightVectors.forEach(v => {
      v.start.x *= scaleRight; v.start.y *= scaleRight;
      v.end.x   *= scaleRight; v.end.y   *= scaleRight;
    });

    // update cached sizes and leftCenter
    this.leftClientW = clientW; this.leftClientH = clientH;
    this.rightClientW = clientW; this.rightClientH = clientH;
    this.leftCenter = { x: clientW / 2, y: clientH / 2 };

    this.draw();
  }

  /************************
   * Event listeners setup
   ************************/
  setupEventListeners() {
    // Left canvas (drawing)
    this.leftCanvas.addEventListener('pointerdown', (e) => this.handleLeftPointerDown(e));
    this.leftCanvas.addEventListener('pointermove', (e) => this.handleLeftPointerMove(e));
    this.leftCanvas.addEventListener('pointerup', (e) => this.handleLeftPointerUp(e));
    this.leftCanvas.addEventListener('pointerleave', (e) => this.handleLeftPointerUp(e));

    // Right canvas (drag/move/edit)
    this.rightCanvas.addEventListener('pointerdown', (e) => this.handleRightPointerDown(e));
    this.rightCanvas.addEventListener('pointermove', (e) => this.handleRightPointerMove(e));
    this.rightCanvas.addEventListener('pointerup', (e) => this.handleRightPointerUp(e));
    this.rightCanvas.addEventListener('pointerleave', (e) => this.handleRightPointerUp(e));

    // pointer tracking for pinch/pan on touch & pointer devices
    [this.leftCanvas, this.rightCanvas].forEach(c => {
      c.addEventListener('pointerdown', (e) => this.handlePointerTrackDown(e, c));
      c.addEventListener('pointermove', (e) => this.handlePointerTrackMove(e, c));
      c.addEventListener('pointerup',   (e) => this.handlePointerTrackUp(e, c));
      c.addEventListener('pointercancel',(e) => this.handlePointerTrackUp(e, c));
    });

    // Wheel -> zoom (Ctrl/Cmd + wheel)
    this.leftCanvas.addEventListener('wheel', (e) => this.handleWheel(e, this.leftCanvas), { passive: false });
    this.rightCanvas.addEventListener('wheel', (e) => this.handleWheel(e, this.rightCanvas), { passive: false });

    // Pan by middle-button or space + drag (mouse)
    [this.leftCanvas, this.rightCanvas].forEach(c => {
      c.addEventListener('pointerdown', (e) => this.handlePanPointerDown(e, c));
      c.addEventListener('pointermove', (e) => this.handlePanPointerMove(e, c));
      c.addEventListener('pointerup',   (e) => this.handlePanPointerUp(e, c));
      c.addEventListener('pointerleave',(e) => this.handlePanPointerUp(e, c));
    });

    // Spacebar to enable pan-by-drag
    this.spaceKeyDown = false;
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') { this.spaceKeyDown = true; document.body.style.cursor = 'grab'; e.preventDefault(); }});
    window.addEventListener('keyup',   (e) => { if (e.code === 'Space') { this.spaceKeyDown = false; document.body.style.cursor = ''; }});

    // Prevent default touch behaviors
    this.leftCanvas.style.touchAction = 'none';
    this.rightCanvas.style.touchAction = 'none';
  }

  /*********************
   * Pointer helpers
   *********************/
  getPointerPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const isLeft = (canvas === this.leftCanvas);
    const scale = isLeft ? this.leftScale : this.rightScale;
    const offset = isLeft ? this.leftOffset : this.rightOffset;
    const worldX = (cssX - offset.x) / (scale || 1);
    const worldY = (cssY - offset.y) / (scale || 1);
    return { x: worldX, y: worldY };
  }

  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  distanceToLine(point, start, end) {
    const A = point.x - start.x;
    const B = point.y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    if (lenSq === 0) return Math.sqrt(A * A + B * B);
    let param = dot / lenSq;
    if (param < 0) {
      return Math.sqrt(A * A + B * B);
    } else if (param > 1) {
      const dx = point.x - end.x;
      const dy = point.y - end.y;
      return Math.sqrt(dx * dx + dy * dy);
    } else {
      const projX = start.x + param * C;
      const projY = start.y + param * D;
      const dx = point.x - projX;
      const dy = point.y - projY;
      return Math.sqrt(dx * dx + dy * dy);
    }
  }

  /**************************
   * Left canvas interactions
   **************************/
  handleLeftPointerDown(e) {
    e.preventDefault();

    // Recompute leftCenter in world coordinates
    const rect = this.leftCanvas.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    this.leftCenter = {
      x: (cssW / 2 - (this.leftOffset?.x || 0)) / (this.leftScale || 1),
      y: (cssH / 2 - (this.leftOffset?.y || 0)) / (this.leftScale || 1)
    };

    const pos = this.getPointerPos(this.leftCanvas, e);
    const distance = this.distance(pos, this.leftCenter);

    if (distance < 20) {
      this.isDrawing = true;
      this.startPos = { ...this.leftCenter };
      try { this.leftCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }

  handleLeftPointerMove(e) {
    if (!this.isDrawing) return;
    e.preventDefault();

    const pos = this.getPointerPos(this.leftCanvas, e);
    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const rawMagnitude = Math.sqrt(dx*dx + dy*dy);
    const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI;

    // snapping
    const snappedMagnitude = Math.round(rawMagnitude / 0.3) * 0.3;
    const snappedAngle = Math.round(rawAngle * 10) / 10;
    const snappedRadians = snappedAngle * Math.PI / 180;

    const snappedPos = {
      x: this.startPos.x + snappedMagnitude * Math.sin(snappedRadians),
      y: this.startPos.y - snappedMagnitude * Math.cos(snappedRadians)
    };

    // redraw preview
    this.drawLeft();
    
    this.leftCtx.save();
    const dpr = window.devicePixelRatio || 1;
    this.leftCtx.setTransform(dpr * this.leftScale, 0, 0, dpr * this.leftScale, 
                             this.leftOffset.x * dpr, this.leftOffset.y * dpr);
    
    this.drawVector(this.leftCtx, this.startPos, snappedPos, '#3498db', 2, true);
    this.drawAngleIndicator(this.leftCtx, this.startPos, snappedPos);
    
    this.leftCtx.restore();
  }

  handleLeftPointerUp(e) {
    if (!this.isDrawing) return;
    e.preventDefault();

    const pos = this.getPointerPos(this.leftCanvas, e);
    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const rawMagnitude = Math.sqrt(dx*dx + dy*dy);

    if (rawMagnitude > 20) {
      const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI;
      const snappedMagnitude = Math.round(rawMagnitude / 0.3)/10;
      const snappedAngle = Math.round(rawAngle * 10) / 10;
      const snappedRadians = snappedAngle * Math.PI / 180;

      const snappedPos = {
        x: this.startPos.x + snappedMagnitude * 3 * Math.sin(snappedRadians),
        y: this.startPos.y - snappedMagnitude * 3 * Math.cos(snappedRadians)
      };

      const color = this.colors[this.colorIndex % this.colors.length];
      this.colorIndex++;

      // store left vector as magnitude/angle
      const leftVector = {
        magnitude: snappedMagnitude,
        angle: snappedAngle,
        color: color
      };
      this.leftVectors.push(leftVector);

      // create corresponding absolute right vector
      const rightRect = this.rightCanvas.getBoundingClientRect();
      const baselineY = rightRect.height / 2;
      const startX = 150 + this.rightVectors.length * 30;
     

     this.rightVectors.push({
      start: { x: startX, y: baselineY },
      end: { 
        x: startX + snappedMagnitude * 3 * Math.sin(snappedRadians), 
        y: baselineY - snappedMagnitude * 3 * Math.cos(snappedRadians) 
      },
      color: color,
      magnitude: snappedMagnitude, // FIXED: Use same decimal magnitude
      angle: snappedAngle, // FIXED: Use same decimal angle
      originalIndex: this.leftVectors.length - 1
      });

      this.updateVectorInfo();
    }

    this.isDrawing = false;
    try { this.leftCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
    this.draw();
  }

  /**************************
   * Right canvas interactions
   **************************/
  handleRightPointerDown(e) {
    e.preventDefault();
    const pos = this.getPointerPos(this.rightCanvas, e);

    for (let i = this.rightVectors.length - 1; i >= 0; i--) {
      const vector = this.rightVectors[i];
      const distToEnd = this.distance(pos, vector.end);
      const distToStart = this.distance(pos, vector.start);
      const distToLine = this.distanceToLine(pos, vector.start, vector.end);

      // near arrow head -> edit
      if (distToEnd < 20) {
        this.dragging = i;
        this.draggingMode = 'editEnd';
        try { this.rightCanvas.setPointerCapture(e.pointerId); } catch (err) {}
        this.rightCanvas.style.cursor = 'grabbing';
        return;
      }

      // near body or start -> move whole
      if (distToStart < 20 || distToLine < 12) {
        this.dragging = i;
        this.draggingMode = 'move';
        this.dragOffset = { x: pos.x - vector.start.x, y: pos.y - vector.start.y };
        try { this.rightCanvas.setPointerCapture(e.pointerId); } catch (err) {}
        this.rightCanvas.style.cursor = 'grabbing';
        return;
      }
    }
  }

  handleRightPointerMove(e) {
    if (this.dragging === null) return;
    e.preventDefault();

    const pos = this.getPointerPos(this.rightCanvas, e);
    const index = this.dragging;
    const vector = this.rightVectors[index];
    if (!vector) return;

    if (this.draggingMode === 'move') {
      const dx = vector.end.x - vector.start.x;
      const dy = vector.end.y - vector.start.y;
      vector.start = { x: pos.x - this.dragOffset.x, y: pos.y - this.dragOffset.y };
      vector.end = { x: vector.start.x + dx, y: vector.start.y + dy };

      this.drawRight();
      this.updateResultant();
      return;
    }

    if (this.draggingMode === 'editEnd') {
      const leftIndex = typeof vector.originalIndex === 'number' ? vector.originalIndex : -1;
      const linkedLeft = (leftIndex >= 0 && this.leftVectors[leftIndex]) ? this.leftVectors[leftIndex] : null;

      if (linkedLeft && linkedLeft.locked) {
        const lockedAngle = (linkedLeft.angle || 0) * Math.PI / 180;
        const dir = { x: Math.sin(lockedAngle), y: -Math.cos(lockedAngle) };

        const relX = pos.x - vector.start.x;
        const relY = pos.y - vector.start.y;
        const projectedLength = relX * dir.x + relY * dir.y;
        const clampedProj = Math.max(0, projectedLength);

        vector.end = {
          x: vector.start.x + dir.x * clampedProj,
          y: vector.start.y + dir.y * clampedProj
        };

        const len = Math.hypot(vector.end.x - vector.start.x, vector.end.y - vector.start.y);
        const magnitude = Math.round(len / 0.3)/10;

        vector.magnitude = magnitude;
        vector.angle = linkedLeft.angle;

        linkedLeft.magnitude = magnitude;

        this.draw();
        this.updateVectorInfo();
        this.updateResultant();
        return;
      }

      vector.end = { x: pos.x, y: pos.y };

  const dx = vector.end.x - vector.start.x;
  const dy = vector.end.y - vector.start.y;
  const length = Math.sqrt(dx*dx + dy*dy);
  const magnitude = Math.round(length / 0.3) / 10; // FIXED: Use 0.1 precision
  const angle = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI * 10) / 10; // FIXED: Use 0.1 precision

  vector.magnitude = magnitude;
  vector.angle = angle;

      if (leftIndex >= 0 && this.leftVectors[leftIndex]) {
        const leftVec = this.leftVectors[leftIndex];
        leftVec.magnitude = magnitude;
        leftVec.angle = angle;
        const radians = angle * Math.PI / 180;
        const leftLength = magnitude * 3;
        leftVec.end = {
          x: this.leftCenter.x + leftLength * Math.sin(radians),
          y: this.leftCenter.y - leftLength * Math.cos(radians)
        };
      }

      this.draw();
      this.updateVectorInfo();
      this.updateResultant();
      return;
    }
  }

  handleRightPointerUp(e) {
    if (this.dragging !== null) {
      try { this.rightCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    this.dragging = null;
    this.draggingMode = null;
    this.rightCanvas.style.cursor = 'default';
  }

  /*********************
   * Pointer-tracking + pinch/pan (touch)
   *********************/
  handlePointerTrackDown(e, canvas) {
    this._pointers[e.pointerId] = { id: e.pointerId, x: e.clientX, y: e.clientY, canvas, prevX: e.clientX, prevY: e.clientY, time: performance.now() };

    const pts = Object.values(this._pointers).filter(p => p.canvas === canvas);
    if (pts.length === 2) {
      const a = pts[0], b = pts[1];
      const startDist = Math.hypot(a.x - b.x, a.y - b.y);
      const centerScreen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = canvas.getBoundingClientRect();
      const cssX = centerScreen.x - rect.left;
      const cssY = centerScreen.y - rect.top;
      const isLeft = (canvas === this.leftCanvas);
      const scale = isLeft ? this.leftScale : this.rightScale;
      const offset = isLeft ? this.leftOffset : this.rightOffset;
      const centerWorld = { x: (cssX - offset.x) / (scale || 1), y: (cssY - offset.y) / (scale || 1) };
      this._pinch = {
        canvas,
        startDist,
        startScale: scale,
        centerWorld,
        startOffset: { x: offset.x, y: offset.y },
        lastTime: performance.now(),
        lastCenter: centerScreen,
        lastMoveVx: 0,
        lastMoveVy: 0
      };
      this._panInertia.active = false;
    }
  }

  handlePointerTrackMove(e, canvas) {
    const p = this._pointers[e.pointerId];
    if (!p) return;
    const now = performance.now();
    p.x = e.clientX; p.y = e.clientY; p.time = now;

    if (this._pinch && this._pinch.canvas === canvas) {
      const pts = Object.values(this._pointers).filter(q => q.canvas === canvas);
      if (pts.length < 2) return;
      const a = pts[0], b = pts[1];
      const curDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (curDist < 1) return;
      const scaleFactor = curDist / this._pinch.startDist;
      const newScale = Math.max(this.MIN_SCALE, Math.min(this._pinch.startScale * scaleFactor, this.MAX_SCALE));

      const centerScreen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = canvas.getBoundingClientRect();
      const cssX = centerScreen.x - rect.left;
      const cssY = centerScreen.y - rect.top;
      const world = this._pinch.centerWorld;

      const newOffsetX = cssX - world.x * newScale;
      const newOffsetY = cssY - world.y * newScale;

      if (canvas === this.leftCanvas) {
        this.leftScale = newScale;
        this.leftOffset = { x: newOffsetX, y: newOffsetY };
      } else {
        this.rightScale = newScale;
        this.rightOffset = { x: newOffsetX, y: newOffsetY };
      }

      const dt = Math.max(1, now - this._pinch.lastTime);
      const vx = (centerScreen.x - this._pinch.lastCenter.x) / dt;
      const vy = (centerScreen.y - this._pinch.lastCenter.y) / dt;
      this._pinch.lastCenter = centerScreen;
      this._pinch.lastTime = now;
      this._pinch.lastMoveVx = vx;
      this._pinch.lastMoveVy = vy;

      this.draw();
      return;
    }
  }

  handlePointerTrackUp(e, canvas) {
    delete this._pointers[e.pointerId];

    if (this._pinch && this._pinch.canvas === canvas) {
      const vx = (this._pinch.lastMoveVx || 0) * 1000;
      const vy = (this._pinch.lastMoveVy || 0) * 1000;
      if (Math.hypot(vx, vy) > 50) {
        this.startPanInertia(canvas === this.leftCanvas ? 'left' : 'right', vx, vy);
      }
      this._pinch = null;
    }

    Object.values(this._pointers).forEach(q => { q.prevX = q.x; q.prevY = q.y; q.time = performance.now(); });
  }

  /*********************
   * Wheel & mouse pan handlers
   *********************/
  handleWheel(e, canvas) {
    e.preventDefault();

    const isLeft = (canvas === this.leftCanvas);
    const prevScale = isLeft ? this.leftScale : this.rightScale;
    const offset = isLeft ? this.leftOffset : this.rightOffset;

    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    const zoomFactor = Math.exp(-e.deltaY * 0.0012);
    let newScale = prevScale * zoomFactor;

    newScale = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, newScale));

    const worldX = (cssX - offset.x) / prevScale;
    const worldY = (cssY - offset.y) / prevScale;

    const newOffsetX = cssX - worldX * newScale;
    const newOffsetY = cssY - worldY * newScale;

    if (isLeft) {
      this.leftScale = newScale;
      this.leftOffset = { x: newOffsetX, y: newOffsetY };
    } else {
      this.rightScale = newScale;
      this.rightOffset = { x: newOffsetX, y: newOffsetY };
    }

    this.draw();
  }

  handlePanPointerDown(e, canvas) {
    if (e.button === 1 || (this.spaceKeyDown && e.button === 0)) {
      this.isPanning = true;
      this.panTarget = (canvas === this.leftCanvas) ? 'left' : 'right';
      this.panStart = { x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  handlePanPointerMove(e, canvas) {
    if (!this.isPanning || !this.panTarget) return;
    const target = (canvas === this.leftCanvas) ? 'left' : 'right';
    if (target !== this.panTarget) return;
    const dx = e.clientX - this.panStart.x;
    const dy = e.clientY - this.panStart.y;
    this.panStart = { x: e.clientX, y: e.clientY };
    if (this.panTarget === 'left') { this.leftOffset.x += dx; this.leftOffset.y += dy; } 
    else { this.rightOffset.x += dx; this.rightOffset.y += dy; }
    this.draw();
  }

  handlePanPointerUp(e, canvas) {
    if (!this.isPanning) return;
    this.isPanning = false;
    this.panTarget = null;
    this.panStart = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    canvas.style.cursor = '';
  }

  // start inertia (px/s) for canvas pan; decays exponentially
  startPanInertia(side, vx, vy) {
    this._panInertia = { active: true, vx, vy, target: side, lastTime: performance.now(), decay: 0.0025 };
    if (!this._animating) this._panInertiaLoop();
  }

  _panInertiaLoop() {
    this._animating = true;
    const step = (t) => {
      if (!this._panInertia.active) { this._animating = false; return; }
      const now = performance.now();
      const dt = (now - this._panInertia.lastTime) / 1000;
      this._panInertia.lastTime = now;
      const dx = this._panInertia.vx * dt;
      const dy = this._panInertia.vy * dt;
      if (this._panInertia.target === 'left') { this.leftOffset.x += dx; this.leftOffset.y += dy; }
      else { this.rightOffset.x += dx; this.rightOffset.y += dy; }
      const decayFactor = Math.exp(-this._panInertia.decay * (dt * 1000));
      this._panInertia.vx *= decayFactor; this._panInertia.vy *= decayFactor;
      if (Math.hypot(this._panInertia.vx, this._panInertia.vy) < 10) this._panInertia.active = false;
      this.draw();
      if (this._panInertia.active) requestAnimationFrame(step); else this._animating = false;
    };
    this._panInertia.lastTime = performance.now();
    requestAnimationFrame(step);
  }

  // animate zoom to targetScale for a canvas ('left'|'right'), duration ms
  animateZoomTo(side, targetScale, duration = 300) {
    targetScale = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, targetScale));
    const isLeft = side === 'left';
    const startScale = isLeft ? this.leftScale : this.rightScale;
    const startOffset = isLeft ? { ...this.leftOffset } : { ...this.rightOffset };
    const canvas = isLeft ? this.leftCanvas : this.rightCanvas;
    const rect = canvas.getBoundingClientRect();
    const cssCenter = { x: rect.width / 2, y: rect.height / 2 };
    const worldCenterX = (cssCenter.x - startOffset.x) / startScale;
    const worldCenterY = (cssCenter.y - startOffset.y) / startScale;
    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const curScale = startScale + (targetScale - startScale) * eased;
      const newOffsetX = cssCenter.x - worldCenterX * curScale;
      const newOffsetY = cssCenter.y - worldCenterY * curScale;
      if (isLeft) { this.leftScale = curScale; this.leftOffset = { x: newOffsetX, y: newOffsetY }; }
      else { this.rightScale = curScale; this.rightOffset = { x: newOffsetX, y: newOffsetY }; }
      this.draw();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  animateResetView(side, duration = 250) {
    const isLeft = side === 'left';
    const startScale = isLeft ? this.leftScale : this.rightScale;
    const startOffset = isLeft ? { ...this.leftOffset } : { ...this.rightOffset };
    const targetScale = 1;
    const targetOffset = { x: 0, y: 0 };
    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const curScale = startScale + (targetScale - startScale) * eased;
      const curOffset = { x: startOffset.x + (targetOffset.x - startOffset.x) * eased, y: startOffset.y + (targetOffset.y - startOffset.y) * eased };
      if (isLeft) { this.leftScale = curScale; this.leftOffset = curOffset; } else { this.rightScale = curScale; this.rightOffset = curOffset; }
      this.draw();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /*********************
   * Drawing utilities
   *********************/
  drawTriangleAngles(ctx) {
     if (!this.showAngles) return;
    if (!this.rightVectors || this.rightVectors.length < 2) return;

    const verts = [];
    verts.push({...this.rightVectors[0].start});
    this.rightVectors.forEach(v => verts.push({...v.end}));

    for (let i = 1; i < verts.length - 1; i++) {
      const A = verts[i - 1];
      const B = verts[i];
      const C = verts[i + 1];

      const v1 = { x: A.x - B.x, y: A.y - B.y };
      const v2 = { x: C.x - B.x, y: C.y - B.y };

      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);

      if (len1 < 8 || len2 < 8) continue;

      let cosTheta = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
      cosTheta = Math.max(-1, Math.min(1, cosTheta));
      const theta = Math.acos(cosTheta);

      const ang1 = Math.atan2(v1.y, v1.x);
      const ang2 = Math.atan2(v2.y, v2.x);
      let a1 = ang1; let a2 = ang2;
      let delta = a2 - a1;
      while (delta <= -Math.PI) delta += 2 * Math.PI;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      const arcStart = a1;
      const arcEnd = a1 + delta;
      const radius = Math.max(12, Math.min(len1, len2) * 0.28);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(B.x, B.y);
      ctx.arc(B.x, B.y, radius, arcStart, arcEnd, delta < 0);
      ctx.closePath();
      ctx.fillStyle = "rgba(44, 62, 80, 0.08)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(B.x, B.y, radius, arcStart, arcEnd, delta < 0);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(44,62,80,0.6)";
      ctx.stroke();

      const bisector = a1 + delta / 2;
      const textRadius = radius * 0.6;
      const textX = B.x + Math.cos(bisector) * textRadius;
      const textY = B.y + Math.sin(bisector) * textRadius;

      const angleDeg = theta * 180 / Math.PI;
      const angleText = Math.round(angleDeg) + "°";

      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const metrics = ctx.measureText(angleText);
      const textWidth = metrics.width;
      const paddingX = 6;
      const paddingY = 4;
      const rectW = textWidth + paddingX * 2;
      const rectH = 16 + paddingY;
      const rectX = textX - rectW / 2;
      const rectY = textY - rectH / 2;
      const radiusCorner = 6;
      ctx.beginPath();
      ctx.moveTo(rectX + radiusCorner, rectY);
      ctx.lineTo(rectX + rectW - radiusCorner, rectY);
      ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radiusCorner);
      ctx.lineTo(rectX + rectW, rectY + rectH - radiusCorner);
      ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radiusCorner, rectY + rectH);
      ctx.lineTo(rectX + radiusCorner, rectY + rectH);
      ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radiusCorner);
      ctx.lineTo(rectX, rectY + radiusCorner);
      ctx.quadraticCurveTo(rectX, rectY, rectX + radiusCorner, rectY);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(44,62,80,0.12)";
      ctx.stroke();
      ctx.fillStyle = "rgba(44,62,80,0.95)";
      ctx.fillText(angleText, textX, textY);
      ctx.restore();
    }
  }

  drawVector(ctx, start, end, color, width = 2, temporary = false, isResultant = false) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx*dx + dy*dy);
    if (length < 1) return;

    const angle = Math.atan2(dy, dx);
    const arrowLength = isResultant ? 15 : 12;
    const arrowAngle = Math.PI / 6;
    
    // Calculate the actual end point for the shaft (shortened by arrow length)
    const shaftEnd = {
      x: end.x - arrowLength * Math.cos(angle),
      y: end.y - arrowLength * Math.sin(angle)
    };

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (isResultant) ctx.setLineDash([8, 4]); else ctx.setLineDash([]);

    // Draw the shaft to the shortened end point
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(shaftEnd.x, shaftEnd.y);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw arrow head at the original end point (full length)
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - arrowLength * Math.cos(angle - arrowAngle), end.y - arrowLength * Math.sin(angle - arrowAngle));
    ctx.lineTo(end.x - arrowLength * Math.cos(angle + arrowAngle), end.y - arrowLength * Math.sin(angle + arrowAngle));
    ctx.closePath();
    ctx.fill();

    if (!temporary) {
      const magnitude = length / 3;
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      ctx.fillStyle = color;
      ctx.font = isResultant ? 'bold 12px Arial' : 'bold 11px Arial';
       const label = isResultant ? `R=${magnitude.toFixed(1)}N` : `${magnitude.toFixed(1)}N`; 
      ctx.fillText(label, midX + 8, midY - 8);
    }
  }

  drawAngleIndicator(ctx, start, end) {
     if (!this.showAngles) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
    const magnitude = Math.sqrt(dx*dx + dy*dy) / 3;

    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = Math.atan2(dy, dx);
    ctx.arc(start.x, start.y, 30, startAngle, endAngle, false);
    ctx.stroke();

    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(`${angle.toFixed(1)}°`, start.x + 35, start.y - 5);
    ctx.fillText(`${magnitude.toFixed(1)}N`, start.x + 35, start.y + 15);
  }

 drawComponents(ctx, vector) {
  const dx = vector.end.x - vector.start.x;
  const dy = vector.end.y - vector.start.y;

  ctx.strokeStyle = vector.color;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vector.start.x, vector.start.y);
  ctx.lineTo(vector.start.x + dx, vector.start.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(vector.start.x + dx, vector.start.y);
  ctx.lineTo(vector.start.x + dx, vector.start.y + dy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = vector.color;
  ctx.font = '10px Arial';
  
  // FIX: Use the same calculation as right panel (divide by 3 for N units)
  const hComp = (dx / 3).toFixed(1);
  const vComp = (dy / 3).toFixed(1); // Keep sign consistent
  
  ctx.fillText(`${hComp}N`, vector.start.x + dx/2, vector.start.y - 5);
  ctx.fillText(`${vComp}N`, vector.start.x + dx + 5, vector.start.y + dy/2);
}
  
  drawLeft() {
    const rect = this.leftCanvas.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const dpr = window.devicePixelRatio || 1;
    const pixW = this.leftCanvas.width;
    const pixH = this.leftCanvas.height;

    // Clear backing store
    this.leftCtx.save();
    this.leftCtx.setTransform(1,0,0,1,0,0);
    this.leftCtx.clearRect(0,0,pixW,pixH);
    this.leftCtx.restore();

    // Apply world transform
    this.leftCtx.save();
    this.leftCtx.setTransform(dpr * this.leftScale, 0, 0, dpr * this.leftScale, this.leftOffset.x * dpr, this.leftOffset.y * dpr);

    // draw grid (world coords)
    this.drawGrid(this.leftCtx, this.leftScale);

    // recompute leftCenter in world coords
    this.leftCenter = {
      x: (cssW / 2 - this.leftOffset.x) / (this.leftScale || 1),
      y: (cssH / 2 - this.leftOffset.y) / (this.leftScale || 1)
    };

    // draw center
    this.leftCtx.fillStyle = '#2c3e50';
    this.leftCtx.beginPath();
    this.leftCtx.arc(this.leftCenter.x, this.leftCenter.y, 8, 0, Math.PI * 2);
    this.leftCtx.fill();

    this.leftCtx.fillStyle = '#2c3e50';
    this.leftCtx.font = '12px Arial';
    this.leftCtx.fillText('Object', this.leftCenter.x - 20, this.leftCenter.y + 25);

    // draw vectors
    this.leftVectors.forEach((vec, index) => {
      if (vec.start && vec.end && (typeof vec.magnitude === 'undefined' || typeof vec.angle === 'undefined')) {
        const dx = vec.end.x - vec.start.x;
        const dy = vec.end.y - vec.start.y;
        vec.magnitude = Math.round(Math.sqrt(dx*dx + dy*dy) / 3);
        vec.angle = Math.atan2(dx, -dy) * 180 / Math.PI;
      }

      const start = { x: this.leftCenter.x, y: this.leftCenter.y };
      const radians = (vec.angle || 0) * Math.PI / 180;
      const length = (vec.magnitude || 0) * 3;
      const end = {
        x: start.x + length * Math.sin(radians),
        y: start.y - length * Math.cos(radians)
      };

      this.drawVector(this.leftCtx, start, end, vec.color, 3);
      if (this.showComponents) this.drawComponents(this.leftCtx, { start, end, color: vec.color });
    });

    this.leftCtx.restore();
  }

  drawRight() {
    const rw = this.rightClientW || this.rightCanvas.getBoundingClientRect().width;
    const rh = this.rightClientH || this.rightCanvas.getBoundingClientRect().height;
    this.rightCtx.clearRect(0, 0, rw, rh);

    this.rightCtx.save();
    const dpr = window.devicePixelRatio || 1;
    this.rightCtx.setTransform(dpr * this.rightScale, 0, 0, dpr * this.rightScale, this.rightOffset.x * dpr, this.rightOffset.y * dpr);

    this.drawGrid(this.rightCtx);

    // draw vectors
    this.rightVectors.forEach((vector) => {
      this.drawVector(this.rightCtx, vector.start, vector.end, vector.color, 3);
      if (this.showComponents) this.drawComponents(this.rightCtx, vector);
    });

    // draw angles for triangle joints
    this.drawTriangleAngles(this.rightCtx);

    // tip-to-tail connection lines
    if (this.rightVectors.length > 1) {
      this.rightCtx.strokeStyle = '#95a5a6';
      this.rightCtx.setLineDash([2,2]);
      this.rightCtx.lineWidth = 1;
      for (let i = 0; i < this.rightVectors.length - 1; i++) {
        this.rightCtx.beginPath();
        this.rightCtx.moveTo(this.rightVectors[i].end.x, this.rightVectors[i].end.y);
        this.rightCtx.lineTo(this.rightVectors[i+1].start.x, this.rightVectors[i+1].start.y);
        this.rightCtx.stroke();
      }
      this.rightCtx.setLineDash([]);
    }

    this.rightCtx.restore();
  }

  drawGrid(ctx) {
    const baseWorldStep = 20;
    const padScreenPx  = 120;

    const canvas = ctx.canvas;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const dpr = window.devicePixelRatio || 1;

    let scale = 1, offsetX = 0, offsetY = 0;
    if (ctx === this.leftCtx) {
      scale = this.leftScale || 1; offsetX = this.leftOffset.x || 0; offsetY = this.leftOffset.y || 0;
    } else if (ctx === this.rightCtx) {
      scale = this.rightScale || 1; offsetX = this.rightOffset.x || 0; offsetY = this.rightOffset.y || 0;
    }

    const worldLeft   = (-offsetX) / scale;
    const worldTop    = (-offsetY) / scale;
    const worldRight  = (cssW - offsetX) / scale;
    const worldBottom = (cssH - offsetY) / scale;

    const padWorld = padScreenPx / Math.max(1e-6, scale);

    const drawMinX = Math.floor((worldLeft - padWorld) / baseWorldStep) * baseWorldStep;
    const drawMaxX = Math.ceil ((worldRight + padWorld) / baseWorldStep) * baseWorldStep;
    const drawMinY = Math.floor((worldTop - padWorld) / baseWorldStep) * baseWorldStep;
    const drawMaxY = Math.ceil ((worldBottom + padWorld) / baseWorldStep) * baseWorldStep;

    ctx.save();

    ctx.lineWidth = Math.max(0.5, 1 / (dpr * Math.max(0.001, scale)));
    ctx.strokeStyle = '#ecf0f1';
    ctx.beginPath();

    // Vertical lines
    for (let x = drawMinX; x <= drawMaxX; x += baseWorldStep) {
      ctx.moveTo(x, drawMinY);
      ctx.lineTo(x, drawMaxY);
    }

    // Horizontal lines
    for (let y = drawMinY; y <= drawMaxY; y += baseWorldStep) {
      ctx.moveTo(drawMinX, y);
      ctx.lineTo(drawMaxX, y);
    }

    ctx.stroke();
    ctx.restore();
  }

  draw() {
    this.drawLeft();
    this.drawRight();
    this.updateResultant();
  }

  /***********************
   * Vector / Info updates
   ***********************/
  updateVectorInfo() {
    const leftInfo = document.getElementById('leftVectorInfo');
    const rightInfo = document.getElementById('rightVectorInfo');

    if (this.leftVectors.length === 0) {
      leftInfo.innerHTML = `<div class="vector-card"><p>Click and drag from the centre to draw force vectors. Angles and magnitudes automatically calculated.</p></div>`;
      rightInfo.innerHTML = `<div class="vector-card"><p><strong>Instructions:</strong> Drag arrow head on the right to edit magnitude & angle once triangle is built. Drag the body to reposition.</p></div>`;
      return;
    }

    let leftHtml = '';
    this.leftVectors.forEach((vector, index) => {
      const locked = !!vector.locked;
      const lockLabel = locked ? 'Unlock Angle' : 'Lock Angle';
      const lockClass = locked ? 'lock-active' : 'lock-inactive';

      leftHtml += `
        <div class="vector-card" style="border-left-color: ${vector.color}">
          <h5 style="color: ${vector.color}">Force ${index + 1}</h5>
          <div class="vector-controls">
            <div class="input-group">
              <label>Magnitude:</label>
              <input type="number" id="mag_${index}" value="${vector.magnitude}" min="1" max="200" onchange="simulator.updateVector(${index})">
              <span>N</span>
            </div>
            <div class="input-group">
              <label>Angle:</label>
              <input type="number" id="ang_${index}" value="${(vector.angle || 0).toFixed(1)}" min="-360" max="360" onchange="simulator.updateVector(${index})">
              <span>°</span>
            </div>
            <button class="vector-edit-btn" onclick="simulator.updateVector(${index})">Update</button>
            <button class="vector-delete-btn" onclick="simulator.deleteVector(${index})">Delete</button>
            <button class="lock-btn ${lockClass}" onclick="simulator.toggleLock(${index})" title="Prevent the angle from being changed by right-panel edits">${lockLabel}</button>
          </div>
         ${this.showComponents ? `<div class="components-display">Fx = ${(vector.magnitude * Math.sin((vector.angle||0) * Math.PI / 180)).toFixed(1)}N<br>Fy = ${(-vector.magnitude * Math.cos((vector.angle||0) * Math.PI / 180)).toFixed(1)}N</div>` : ''}
        </div>`;
    });

    rightInfo.innerHTML = `<div class="vector-card"><p><strong>Instructions:</strong> Drag arrow head on the right to edit magnitude & angle once triangle is built. Drag the body to reposition.</p></div>`;

    leftInfo.innerHTML = leftHtml;
  }

  updateResultant() {
    if (this.rightVectors.length < 2) {
      document.getElementById('resultantText').innerHTML = `
        <strong>Magnitude:</strong> 0 N<br>
        <strong>Direction:</strong> 0°<br>
        <strong>Components:</strong> Rx = 0 N, Ry = 0 N
      `;
      return;
    }

    let sumX = 0, sumY = 0;
    this.rightVectors.forEach(v => {
      const dx = v.end.x - v.start.x;
      const dy = v.end.y - v.start.y;
      sumX += dx; sumY += dy;
    });

    const firstStart = this.rightVectors[0].start;
    const calculatedEnd = { x: firstStart.x + sumX, y: firstStart.y + sumY };

    const magnitude = Math.sqrt(sumX*sumX + sumY*sumY) / 3;
    const angle = Math.atan2(sumX, -sumY) * 180 / Math.PI;

    // re-draw right (resultant drawn on top)
    this.drawRight();
    // draw resultant (world coords)
    this.rightCtx.save();
    const dpr = window.devicePixelRatio || 1;
    this.rightCtx.setTransform(dpr * this.rightScale, 0, 0, dpr * this.rightScale, this.rightOffset.x * dpr, this.rightOffset.y * dpr);
    this.drawVector(this.rightCtx, firstStart, calculatedEnd, '#2c3e50', 4, false, true);
    this.rightCtx.restore();

    const ri = document.getElementById('resultantInfo');
    if (ri) ri.style.display = 'block';
    const rt = document.getElementById('resultantText');
    if (rt) rt.innerHTML = `<strong>Magnitude:</strong> ${magnitude.toFixed(1)}N<br><strong>Direction:</strong> ${angle.toFixed(1)}°<br><strong>Components:</strong> Rx = ${(sumX/3).toFixed(1)}N, Ry = ${(-sumY/3).toFixed(1)}N`;
  }

  toggleComponents() {
    this.showComponents = !this.showComponents;
    const btn = document.getElementById('componentsBtn');
    if (this.showComponents) { btn.classList.add('active'); btn.textContent = 'Hide Components'; }
    else { btn.classList.remove('active'); btn.textContent = 'Show Components'; }
    this.draw();
    this.updateVectorInfo();
  }

  autoArrangeTriangle() {
    if (this.rightVectors.length < 1) return;
    const rightRect = this.rightCanvas.getBoundingClientRect();
    let currentEnd = { x: 60, y: Math.max(120, rightRect.height / 2) };
    this.rightVectors.forEach((vector) => {
      const dx = vector.end.x - vector.start.x;
      const dy = vector.end.y - vector.start.y;
      vector.start = { ...currentEnd };
      vector.end = { x: currentEnd.x + dx, y: currentEnd.y + dy };
      currentEnd = { ...vector.end };
    });
    this.draw();
    this.updateResultant();
  }

  showScenarioBox(entry = {}) {
    const box = document.getElementById('scenarioBox');
    if (!box) return;
    const titleEl = document.getElementById('scenarioTitle');
    const textEl  = document.getElementById('scenarioText');
    if (titleEl) titleEl.textContent = entry.title || 'Scenario';
    if (textEl)  textEl.textContent  = entry.description || '';
    box.hidden = false;
    box.style.display = 'block';

    const closeBtn = document.getElementById('scenarioCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  hideScenarioBox() {
    const box = document.getElementById('scenarioBox');
    if (!box) return;
    box.hidden = true;
    box.style.display = 'none';
  }
toggleAngles() {
  this.showAngles = !this.showAngles;
  const btn = document.getElementById('anglesBtn');
  if (this.showAngles) { 
    btn.classList.add('active'); 
    btn.textContent = 'Hide Angles'; 
  } else { 
    btn.classList.remove('active'); 
    btn.textContent = 'Show Angles'; 
  }
  this.draw();
}
  loadScenario(scenario) {
    this.clearAll();
    const scenarios = {
      resultant: {
        vectors: [
          { magnitude: 75, angle: 35 },
          { magnitude: 107, angle: 125 },
        ],
        title: "Resultant Force",
        description: "A ship is being pulled by two tug-boats. One pulls with a force of 75 kN at an angle of 55° to the direction of travel of the ship. The other pulls with a force of 107 kN at an angle of 35° to the other side of the direction of travel. Draw a vector triangle and determine the resultant force."
      },
      incline: {
        vectors: [
            { magnitude: 65, angle: -24 },
        { magnitude: 29, angle: 66 },
        { magnitude: 71, angle: 180 }
        ],
        title: "Inclined Plane",
        description: "A box with weight, W, is at rest on an inclined plane. The normal reaction force is 65 N and the frictional force is 29 N up the slope. What is the angle of the plane?"
      },
      tension: {
        vectors: [
          { magnitude: 75, angle: 180 },
          { magnitude: 30, angle: -30 },
          { magnitude: 30, angle: 45 }
        ],
        title: "Tension Forces",
        description: "A circus performer is standing on a high wire. Their weight is 750N. One side of the wire has tension T1 and is at an angle of 30° to the horizontal and the other side has a tension of T2 and is at an agle of 45° to the horizontal. Find T1 and T2. The force diagram is drawn to a scale. Lock the angles of the tension forces and adjust the magnitude until the correct values are found."
      },
      projectile: {
        vectors: [
          { magnitude: 25, angle: 180 },
          { magnitude: 30, angle: -120 },
          { magnitude: 38, angle: 26 }
        ],
        title: "Components",
        description: "The diagram shows the forces acting on a kite. The weight is 25 N, the wind is blowing upwards on the kite with a force of 38N at an angle of 26° to the vertical. If the string is pulling back down at an angle of 30° to the vertical, what must the tension in the string be? Use the vertical and horizontal components of the tension to help."
      }
    };

    const entry = scenarios[scenario];
    if (!entry) {
      console.warn(`loadScenario: unknown scenario "${scenario}"`);
      return;
    }

    const vectors = Array.isArray(entry.vectors) ? entry.vectors : [];

    const rightRect = this.rightCanvas.getBoundingClientRect();
    const baselineY = rightRect.height / 2;

    vectors.forEach((v, i) => {
      const radians = (v.angle || 0) * Math.PI / 180;
      const length = (v.magnitude || 0) * 3;
      const color = this.colors[i % this.colors.length] || this.colors[0];

      this.leftVectors.push({
        magnitude: v.magnitude || 0,
        angle: v.angle || 0,
        color: color,
        locked: false
      });

      const startX = 50 + i * 30;
      this.rightVectors.push({
        start: { x: startX, y: baselineY },
        end:   { x: startX + length * Math.sin(radians), y: baselineY - length * Math.cos(radians) },
        color: color,
        magnitude: v.magnitude || 0,
        angle: v.angle || 0,
        originalIndex: this.leftVectors.length - 1
      });
    });

    this.colorIndex = (this.colorIndex + vectors.length) % this.colors.length;

    this.showScenarioBox(entry);

    this.draw();
    this.updateVectorInfo();
  }

  toggleLock(index) {
    if (index < 0 || index >= this.leftVectors.length) return;
    const vec = this.leftVectors[index];
    vec.locked = !vec.locked;
    this.updateVectorInfo();
    this.draw();
  }

  addVectorNumerically() {
    const magInput = document.getElementById('magnitudeInput');
    const angInput = document.getElementById('angleInput');
    
     const magnitude = parseFloat(magInput.value) || 0; 
  const angle = parseFloat(angInput.value) || 0;
    
    if (magnitude < 0.1 || magnitude > 200) {
      alert('Please enter a magnitude between 0.1 and 200 N');
      return;
    }

    const color = this.colors[this.colorIndex % this.colors.length];
    this.colorIndex++;

    this.leftVectors.push({
      magnitude: magnitude,
      angle: angle,
      color: color,
      locked: false
    });

    const rightRect = this.rightCanvas.getBoundingClientRect();
    const baselineY = rightRect.height / 2;
    const startX = 150 + this.rightVectors.length * 30;
    const radians = angle * Math.PI / 180;
    const length = magnitude * 3;

    this.rightVectors.push({
      start: { x: startX, y: baselineY },
      end: {
        x: startX + length * Math.sin(radians),
        y: baselineY - length * Math.cos(radians)
      },
      color: color,
      magnitude: magnitude,
      angle: angle,
      originalIndex: this.leftVectors.length - 1
    });

    magInput.value = '';
    angInput.value = '';

    this.draw();
    this.updateVectorInfo();
  }

  updateVector(index) {
    if (index < 0 || index >= this.leftVectors.length) return;
    
    const magInput = document.getElementById(`mag_${index}`);
    const angInput = document.getElementById(`ang_${index}`);
    
    const newMagnitude = parseInt(magInput.value) || 0;
    const newAngle = parseFloat(angInput.value) || 0;

    if (newMagnitude < 1 || newMagnitude > 200) {
      alert('Magnitude must be between 1 and 200 N');
      return;
    }

    const leftVec = this.leftVectors[index];
    leftVec.magnitude = newMagnitude;
    if (!leftVec.locked) {
      leftVec.angle = newAngle;
    }

    const rightIndex = this.rightVectors.findIndex(v => v.originalIndex === index);
    if (rightIndex !== -1) {
      const rightVec = this.rightVectors[rightIndex];
      const radians = leftVec.angle * Math.PI / 180;
      const length = newMagnitude * 3;
      
      const dx = length * Math.sin(radians);
      const dy = -length * Math.cos(radians);
      
      rightVec.end = {
        x: rightVec.start.x + dx,
        y: rightVec.start.y + dy
      };
      rightVec.magnitude = newMagnitude;
      rightVec.angle = leftVec.angle;
    }

    this.draw();
    this.updateResultant();
  }

  deleteVector(index) {
    if (index < 0 || index >= this.leftVectors.length) return;
    this.leftVectors.splice(index, 1);
    const rightIndex = this.rightVectors.findIndex(v => v.originalIndex === index);
    if (rightIndex !== -1) this.rightVectors.splice(rightIndex, 1);
    this.rightVectors.forEach(v => { if (typeof v.originalIndex === 'number' && v.originalIndex > index) v.originalIndex--; });
    this.draw();
    this.updateVectorInfo();
  }

  clearAll() {
    this.leftVectors = [];
    this.rightVectors = [];
    this.colorIndex = 0;
    this.showComponents = false;
    const compBtn = document.getElementById('componentsBtn');
    if (compBtn) { compBtn.classList.remove('active'); compBtn.textContent = 'Show Components'; }
    const mag = document.getElementById('magnitudeInput'); const ang = document.getElementById('angleInput');
    if (mag) mag.value = ''; if (ang) ang.value = '';

    const box = document.getElementById('scenarioBox');
    if (box) box.hidden = true;
 
    this.animateResetView('left', 150);
    this.animateResetView('right', 150);
 this.hideScenarioBox();
    this.draw();
    this.updateVectorInfo();
  }
}

// instantiate and expose
const simulator = new VectorSimulator();
window.simulator = simulator;

// Add event listener for scenario close button
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('scenarioCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => simulator.hideScenarioBox());
  }
});
