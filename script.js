

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

    // Setup
    this.setupResponsiveCanvas(); // sizes canvases immediately
    this.setupEventListeners();
    this.draw();
  }

  /*******************
   * Responsive setup
   *******************/
  setupResponsiveCanvas() {
    // call once to size canvases immediately
    this.resizeCanvases();

    // debounce resize
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.resizeCanvases(), 120);
    });
  }

  resizeCanvases() {
    // helper to size and set backing store based on CSS pixels
    const fitAndScale = (canvas, ctx) => {
      const rect = canvas.getBoundingClientRect();
      // make square: width available inside container, but limit by rect.height to avoid overflow
      const clientW = Math.min(rect.width, rect.height || rect.width);
      const clientH = clientW;
      canvas.style.width = clientW + 'px';
      canvas.style.height = clientH + 'px';

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(clientW * dpr));
      canvas.height = Math.max(1, Math.floor(clientH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      return { clientW, clientH };
    };

    // record previous sizes for optional scaling (not used to avoid drift)
    const prevLeft = { w: this.leftClientW, h: this.leftClientH };
    const prevRight = { w: this.rightClientW, h: this.rightClientH };

    const leftResult = fitAndScale(this.leftCanvas, this.leftCtx);
    const rightResult = fitAndScale(this.rightCanvas, this.rightCtx);

    // update cached client sizes
    this.leftClientW = leftResult.clientW;
    this.leftClientH = leftResult.clientH;
    this.rightClientW = rightResult.clientW;
    this.rightClientH = rightResult.clientH;

    // recompute left center from real client size
    const leftRect = this.leftCanvas.getBoundingClientRect();
    this.leftCenter = { x: leftRect.width / 2, y: leftRect.height / 2 };

    // if there are no vectors yet, nothing to scale. If there are, we assume positions are in CSS pixels
    // (we avoid automatic scaling to keep user positions stable; you can implement scaling if desired)

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

    // prevent default touch behaviours
    this.leftCanvas.style.touchAction = 'none';
    this.rightCanvas.style.touchAction = 'none';
  }

  /*********************
   * Pointer helpers
   *********************/
  getPointerPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
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
    const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI; // top=0°, clockwise

    // snapping
    const snappedMagnitude = Math.round(rawMagnitude / 3) * 3;
    const snappedAngle = Math.round(rawAngle);
    const snappedRadians = snappedAngle * Math.PI / 180;
    const snappedPos = {
      x: this.startPos.x + snappedMagnitude * Math.sin(snappedRadians),
      y: this.startPos.y - snappedMagnitude * Math.cos(snappedRadians)
    };

    this.drawLeft();
    this.drawVector(this.leftCtx, this.startPos, snappedPos, '#3498db', 2, true);
    this.drawAngleIndicator(this.leftCtx, this.startPos, snappedPos);
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
      const snappedMagnitude = Math.round(rawMagnitude / 3);
      const snappedAngle = Math.round(rawAngle);
      const snappedRadians = snappedAngle * Math.PI / 180;
      const snappedPos = {
        x: this.startPos.x + snappedMagnitude * 3 * Math.sin(snappedRadians),
        y: this.startPos.y - snappedMagnitude * 3 * Math.cos(snappedRadians)
      };

      const color = this.colors[this.colorIndex % this.colors.length];
      this.colorIndex++;

      const vector = {
        start: { ...this.startPos },
        end: { ...snappedPos },
        color: color,
        magnitude: snappedMagnitude,
        angle: snappedAngle
      };

      this.leftVectors.push(vector);

      // create corresponding right vector using current right canvas size
      const rightRect = this.rightCanvas.getBoundingClientRect();
      const baselineY = rightRect.height / 2; // vertical center

      const startX = 150 + this.rightVectors.length * 30;

      const dxR = snappedPos.x - this.startPos.x;
      const dyR = snappedPos.y - this.startPos.y;

      this.rightVectors.push({
        start: { x: startX, y: baselineY },
        end: { x: startX + dxR, y: baselineY + dyR },
        color: color,
        magnitude: snappedMagnitude,
        angle: snappedAngle,
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
   *
   * Modes:
   *  - move whole vector (dragging)  [if pointer near body/start]
   *  - editEnd (drag arrow head)     [if pointer near end]
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

      // move only in right panel; left vector magnitude & angle remain unchanged in "move" mode
      this.drawRight();
      this.updateResultant();
      return;
    }

    if (this.draggingMode === 'editEnd') {
      // set end to pointer
      vector.end = { x: pos.x, y: pos.y };

      // recalc magnitude & angle (same scale: /3)
      const dx = vector.end.x - vector.start.x;
      const dy = vector.end.y - vector.start.y;
      const length = Math.sqrt(dx*dx + dy*dy);
      const magnitude = Math.round(length / 3);
      const angle = Math.atan2(dx, -dy) * 180 / Math.PI; // top=0° clockwise

      vector.magnitude = magnitude;
      vector.angle = angle;

      // update linked left vector (if mapped)
      if (typeof vector.originalIndex === 'number' && this.leftVectors[vector.originalIndex]) {
        const leftVec = this.leftVectors[vector.originalIndex];
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
   * Drawing utilities
   *********************/
  
  /**
 * Draw small internal angle arcs & labels for a tip-to-tail chain (triangle)
 * Expects rightVectors arranged in order (tip-to-tail).
 * Call this after drawing vectors & connection lines in drawRight().
 */
drawTriangleAngles(ctx) {
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

    // skip very short segments
    if (len1 < 8 || len2 < 8) continue;

    // compute internal angle
    let cosTheta = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    cosTheta = Math.max(-1, Math.min(1, cosTheta));
    const theta = Math.acos(cosTheta); // radians

    // directions of adjacent segments
    const ang1 = Math.atan2(v1.y, v1.x);
    const ang2 = Math.atan2(v2.y, v2.x);

    // normalize delta to -PI..PI
    let a1 = ang1;
    let a2 = ang2;
    let delta = a2 - a1;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;

    const arcStart = a1;
    const arcEnd = a1 + delta;

    // radius for arc (fraction of adjacent segment length)
    const radius = Math.max(12, Math.min(len1, len2) * 0.28);

    // draw filled translucent wedge for contrast
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.arc(B.x, B.y, radius, arcStart, arcEnd, delta < 0);
    ctx.closePath();
    ctx.fillStyle = "rgba(44, 62, 80, 0.08)";
    ctx.fill();

    // arc outline
    ctx.beginPath();
    ctx.arc(B.x, B.y, radius, arcStart, arcEnd, delta < 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(44,62,80,0.6)";
    ctx.stroke();

    // compute bisector and label position
    const bisector = a1 + delta / 2;
    const textRadius = radius * 0.6;
    const textX = B.x + Math.cos(bisector) * textRadius;
    const textY = B.y + Math.sin(bisector) * textRadius;

    // nearest-degree text
    const angleDeg = theta * 180 / Math.PI;
    const angleText = Math.round(angleDeg) + "°";

    // draw rounded background behind text for legibility
    ctx.font = "bold 14px Arial"; // larger, for visibility
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(angleText);
    const textWidth = metrics.width;
    const paddingX = 6;
    const paddingY = 4;
    const rectW = textWidth + paddingX * 2;
    const rectH = 16 + paddingY; // approximate height for 14px font
    const rectX = textX - rectW / 2;
    const rectY = textY - rectH / 2;

    // rounded rect (semi-opaque white) + subtle stroke
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

    ctx.fillStyle = "rgba(255,255,255,0.9)"; // almost opaque white
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(44,62,80,0.12)";
    ctx.stroke();

    // draw text on top
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

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (isResultant) ctx.setLineDash([8, 4]); else ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.setLineDash([]);

    // arrowhead
    const angle = Math.atan2(dy, dx);
    const arrowLength = isResultant ? 15 : 12;
    const arrowAngle = Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - arrowLength * Math.cos(angle - arrowAngle), end.y - arrowLength * Math.sin(angle - arrowAngle));
    ctx.lineTo(end.x - arrowLength * Math.cos(angle + arrowAngle), end.y - arrowLength * Math.sin(angle + arrowAngle));
    ctx.closePath();
    ctx.fill();

    if (!temporary) {
      const magnitude = Math.round(length / 3);
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      ctx.fillStyle = color;
      ctx.font = isResultant ? 'bold 12px Arial' : 'bold 11px Arial';
      const label = isResultant ? `R=${magnitude}N` : `${magnitude}N`;
      ctx.fillText(label, midX + 8, midY - 8);
    }
  }

  drawAngleIndicator(ctx, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dx, -dy) * 180 / Math.PI; // top=0° clockwise
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
    ctx.fillText(`${angle.toFixed(0)}°`, start.x + 35, start.y - 5);
    ctx.fillText(`${magnitude.toFixed(0)}N`, start.x + 35, start.y + 15);
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
    const hComp = (dx / 3).toFixed(1);
    const vComp = (-dy / 3).toFixed(1);
    ctx.fillText(`${hComp}N`, vector.start.x + dx/2, vector.start.y - 5);
    ctx.fillText(`${vComp}N`, vector.start.x + dx + 5, vector.start.y + dy/2);
  }

  drawLeft() {
    const lw = this.leftClientW || this.leftCanvas.getBoundingClientRect().width;
    const lh = this.leftClientH || this.leftCanvas.getBoundingClientRect().height;
    this.leftCtx.clearRect(0, 0, lw, lh);
    this.drawGrid(this.leftCtx, lw, lh);

    const leftRect = this.leftCanvas.getBoundingClientRect();
    this.leftCenter = { x: leftRect.width / 2, y: leftRect.height / 2 };

    // draw center
    this.leftCtx.fillStyle = '#2c3e50';
    this.leftCtx.beginPath();
    this.leftCtx.arc(this.leftCenter.x, this.leftCenter.y, 8, 0, 2 * Math.PI);
    this.leftCtx.fill();
    this.leftCtx.fillStyle = '#2c3e50';
    this.leftCtx.font = '12px Arial';
    this.leftCtx.fillText('Object', this.leftCenter.x - 20, this.leftCenter.y + 25);

    // vectors
    this.leftVectors.forEach((vector) => {
      this.drawVector(this.leftCtx, vector.start, vector.end, vector.color, 3);
      if (this.showComponents) this.drawComponents(this.leftCtx, vector);
    });
  }

  drawRight() {
    const rw = this.rightClientW || this.rightCanvas.getBoundingClientRect().width;
    const rh = this.rightClientH || this.rightCanvas.getBoundingClientRect().height;
    this.rightCtx.clearRect(0, 0, rw, rh);
    this.drawGrid(this.rightCtx, rw, rh);

    this.rightVectors.forEach((vector) => {
      this.drawVector(this.rightCtx, vector.start, vector.end, vector.color, 3);
      if (this.showComponents) this.drawComponents(this.rightCtx, vector);
    });
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
  }

  drawGrid(ctx, w = 400, h = 400) {
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 1;
    const step = 20;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
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
      leftInfo.innerHTML = `<div class="vector-card"><p>Click and drag from the center to draw force vectors. Angles and magnitudes automatically calculated.</p></div>`;
      rightInfo.innerHTML = `<div class="vector-card"><p><strong>Instructions:</strong> Drag arrow head on the right to edit magnitude & angle once triangle is built. Drag the body to reposition.</p></div>`;
      return;
    }

    let leftHtml = '';
    this.leftVectors.forEach((vector, index) => {
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
              <input type="number" id="ang_${index}" value="${vector.angle.toFixed(1)}" min="-360" max="360" onchange="simulator.updateVector(${index})">
              <span>°</span>
            </div>
            <button class="vector-edit-btn" onclick="simulator.updateVector(${index})">Update</button>
            <button class="vector-delete-btn" onclick="simulator.deleteVector(${index})">Delete</button>
          </div>
          ${this.showComponents ? `<div class="components-display">Fx = ${(vector.magnitude * Math.sin(vector.angle * Math.PI / 180)).toFixed(1)}N<br>Fy = ${(vector.magnitude * Math.cos(vector.angle * Math.PI / 180)).toFixed(1)}N</div>` : ''}
        </div>`;
    });

    rightInfo.innerHTML = `<div class="vector-card"><p><strong>Instructions:</strong> Drag arrow head on the right to edit magnitude & angle once triangle is built. Drag the body to reposition.</p></div>`;

    leftInfo.innerHTML = leftHtml;
  }

  updateResultant() {
    if (this.rightVectors.length < 2) {
    // Instead of hiding
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
    this.drawVector(this.rightCtx, firstStart, calculatedEnd, '#2c3e50', 4, false, true);

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
    // start near left of canvas vertically centered
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

  loadScenario(scenario) {
    this.clearAll();
    const scenarios = {
      equilibrium: [ { magnitude:50, angle:0 }, { magnitude:50, angle:120 }, { magnitude:50, angle:240 } ],
      incline:    [ { magnitude:60, angle:180 }, { magnitude:36, angle:150 }, { magnitude:48, angle:330 } ],
      tension:    [ { magnitude:40, angle:45 }, { magnitude:40, angle:135 }, { magnitude:56, angle:180 } ],
      projectile: [ { magnitude:50, angle:45 }, { magnitude:35, angle:90 }, { magnitude:35, angle:0 } ]
    };
    const vectors = scenarios[scenario] || [];
    const rightRect = this.rightCanvas.getBoundingClientRect();
    const baselineY = Math.max(80, rightRect.height - 50);

    vectors.forEach((v, i) => {
      const radians = v.angle * Math.PI / 180;
      const length = v.magnitude * 3;
      const color = this.colors[i % this.colors.length];

      const leftRect = this.leftCanvas.getBoundingClientRect();
      this.leftCenter = { x: leftRect.width / 2, y: leftRect.height / 2 };

      const endLeft = {
        x: this.leftCenter.x + length * Math.sin(radians),
        y: this.leftCenter.y - length * Math.cos(radians)
      };

      this.leftVectors.push({
        start: { ...this.leftCenter },
        end: endLeft,
        color,
        magnitude: v.magnitude,
        angle: v.angle
      });

      const startX = 50 + i * 30;
      this.rightVectors.push({
        start: { x: startX, y: baselineY },
        end: { x: startX + length * Math.sin(radians), y: baselineY - length * Math.cos(radians) },
        color,
        magnitude: v.magnitude,
        angle: v.angle,
        originalIndex: this.leftVectors.length - 1
      });
    });

    this.colorIndex = vectors.length;
    this.draw();
    this.updateVectorInfo();
  }

  addVectorNumerically() {
    const magnitudeInput = document.getElementById('magnitudeInput');
    const angleInput = document.getElementById('angleInput');
    const magnitude = parseFloat(magnitudeInput.value) || 50;
    const angle = parseFloat(angleInput.value) || 0;
    if (magnitude < 1 || magnitude > 200) { alert('Magnitude must be between 1 and 200 N'); return; }

    const color = this.colors[this.colorIndex % this.colors.length];
    this.colorIndex++;
    const radians = angle * Math.PI / 180;
    const length = magnitude * 3;

    const leftRect = this.leftCanvas.getBoundingClientRect();
    this.leftCenter = { x: leftRect.width / 2, y: leftRect.height / 2 };

    const end = {
      x: this.leftCenter.x + length * Math.sin(radians),
      y: this.leftCenter.y - length * Math.cos(radians)
    };

    const vector = { start: { ...this.leftCenter }, end, color, magnitude, angle };
    this.leftVectors.push(vector);

    const rightRect = this.rightCanvas.getBoundingClientRect();
    const baselineY = Math.max(80, rightRect.height - 50);
    const startX = 50 + this.rightVectors.length * 30;
    this.rightVectors.push({
      start: { x: startX, y: baselineY },
      end: { x: startX + length * Math.sin(radians), y: baselineY - length * Math.cos(radians) },
      color, magnitude, angle, originalIndex: this.leftVectors.length - 1
    });

    magnitudeInput.value = '';
    angleInput.value = '';
    this.draw();
    this.updateVectorInfo();
  }

  updateVector(index) {
    if (index < 0 || index >= this.leftVectors.length) return;
    const magnitudeInput = document.getElementById(`mag_${index}`);
    const angleInput = document.getElementById(`ang_${index}`);
    const magnitude = parseFloat(magnitudeInput.value);
    const angle = parseFloat(angleInput.value);
    if (isNaN(magnitude) || magnitude < 1 || magnitude > 200) { alert('Magnitude must be between 1 and 200 N'); return; }
    if (isNaN(angle)) { alert('Please enter a valid angle'); return; }

    const radians = angle * Math.PI / 180;
    const length = magnitude * 3;
    this.leftVectors[index].magnitude = magnitude;
    this.leftVectors[index].angle = angle;
    this.leftVectors[index].end = { x: this.leftCenter.x + length * Math.sin(radians), y: this.leftCenter.y - length * Math.cos(radians) };

    const rightIndex = this.rightVectors.findIndex(v => v.originalIndex === index);
    if (rightIndex !== -1) {
      const rv = this.rightVectors[rightIndex];
      rv.magnitude = magnitude;
      rv.angle = angle;
      rv.end = { x: rv.start.x + length * Math.sin(radians), y: rv.start.y - length * Math.cos(radians) };
    }

    this.draw();
    this.updateVectorInfo();
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
    //const ri = document.getElementById('resultantInfo'); if (ri) ri.style.display = 'none';
    const mag = document.getElementById('magnitudeInput'); const ang = document.getElementById('angleInput');
    if (mag) mag.value = ''; if (ang) ang.value = '';
    this.draw();
    this.updateVectorInfo();
  }
}

// instantiate and expose
const simulator = new VectorSimulator();
window.simulator = simulator;
