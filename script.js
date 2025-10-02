/* script.js - extracted from your original single-file app
   VectorSimulator class and instantiation
*/

class VectorSimulator {
    constructor() {
        this.leftCanvas = document.getElementById('leftCanvas');
        this.rightCanvas = document.getElementById('rightCanvas');
        this.leftCtx = this.leftCanvas.getContext('2d');
        this.rightCtx = this.rightCanvas.getContext('2d');
        
        this.leftVectors = [];
        this.rightVectors = [];
        this.showComponents = false;
        
        this.leftCenter = { x: 200, y: 200 };
        this.isDrawing = false;
        this.dragging = null;
        this.dragOffset = { x: 0, y: 0 };
        
        this.colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        this.colorIndex = 0;
        
        this.setupEventListeners();
        this.draw();
    }
    
    setupEventListeners() {
        // Left canvas - drawing (pointer events for touch support)
        this.leftCanvas.addEventListener('pointerdown', (e) => this.handleLeftPointerDown(e));
        this.leftCanvas.addEventListener('pointermove', (e) => this.handleLeftPointerMove(e));
        this.leftCanvas.addEventListener('pointerup', (e) => this.handleLeftPointerUp(e));
        
        // Right canvas - dragging (pointer events for touch support)
        this.rightCanvas.addEventListener('pointerdown', (e) => this.handleRightPointerDown(e));
        this.rightCanvas.addEventListener('pointermove', (e) => this.handleRightPointerMove(e));
        this.rightCanvas.addEventListener('pointerup', (e) => this.handleRightPointerUp(e));
        this.rightCanvas.addEventListener('pointerleave', (e) => this.handleRightPointerUp(e));
        
        // Prevent default touch behaviors
        this.leftCanvas.style.touchAction = 'none';
        this.rightCanvas.style.touchAction = 'none';
    }
    
    getPointerPos(canvas, e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    distanceToLine(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        
        let param = dot / lenSq;
        
        if (param < 0) {
            return Math.sqrt(A * A + B * B);
        } else if (param > 1) {
            const dx = point.x - lineEnd.x;
            const dy = point.y - lineEnd.y;
            return Math.sqrt(dx * dx + dy * dy);
        } else {
            const projX = lineStart.x + param * C;
            const projY = lineStart.y + param * D;
            const dx = point.x - projX;
            const dy = point.y - projY;
            return Math.sqrt(dx * dx + dy * dy);
        }
    }
    
    handleLeftPointerDown(e) {
        e.preventDefault();
        const pos = this.getPointerPos(this.leftCanvas, e);
        const distance = Math.sqrt(
            Math.pow(pos.x - this.leftCenter.x, 2) + 
            Math.pow(pos.y - this.leftCenter.y, 2)
        );
        
        if (distance < 20) {
            this.isDrawing = true;
            this.startPos = this.leftCenter;
            this.leftCanvas.setPointerCapture(e.pointerId);
        }
    }
    
    handleLeftPointerMove(e) {
        if (!this.isDrawing) return;
        e.preventDefault();
        
        const pos = this.getPointerPos(this.leftCanvas, e);
        
        // Snap to nearest degree and N
        const dx = pos.x - this.startPos.x;
        const dy = pos.y - this.startPos.y;
        const rawMagnitude = Math.sqrt(dx*dx + dy*dy);
        const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI; // From top, clockwise
        
        // Snap values
        const snappedMagnitude = Math.round(rawMagnitude / 3) * 3; // Snap to nearest N (scaled by 3)
        const snappedAngle = Math.round(rawAngle); // Snap to nearest degree
        
        // Calculate snapped position
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
            // Snap to nearest degree and N
            const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI; // From top, clockwise
            const snappedMagnitude = Math.round(rawMagnitude / 3); // Snap to nearest N
            const snappedAngle = Math.round(rawAngle); // Snap to nearest degree
            
            // Calculate snapped position
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
            
            // Add corresponding vector to right panel
            const rightDx = snappedPos.x - this.startPos.x;
            const rightDy = snappedPos.y - this.startPos.y;
            this.rightVectors.push({
                start: { x: 50 + this.rightVectors.length * 30, y: 350 },
                end: { x: 50 + this.rightVectors.length * 30 + rightDx, y: 350 + rightDy },
                color: color,
                magnitude: snappedMagnitude,
                angle: snappedAngle,
                originalIndex: this.leftVectors.length - 1
            });
            
            this.updateVectorInfo();
        }
        
        this.isDrawing = false;
        this.leftCanvas.releasePointerCapture(e.pointerId);
        this.draw();
    }
    
    handleRightPointerDown(e) {
        e.preventDefault();
        const pos = this.getPointerPos(this.rightCanvas, e);
        
        for (let i = this.rightVectors.length - 1; i >= 0; i--) {
            const vector = this.rightVectors[i];
            // Check both arrow head and vector body for easier dragging
            const distanceToEnd = Math.sqrt(
                Math.pow(pos.x - vector.end.x, 2) + 
                Math.pow(pos.y - vector.end.y, 2)
            );
            const distanceToStart = Math.sqrt(
                Math.pow(pos.x - vector.start.x, 2) + 
                Math.pow(pos.y - vector.start.y, 2)
            );
            
            // Check if click is near the vector line
            const lineDistance = this.distanceToLine(pos, vector.start, vector.end);
            
            if (distanceToEnd < 25 || distanceToStart < 25 || lineDistance < 15) {
                this.dragging = i;
                this.dragOffset = {
                    x: pos.x - vector.start.x,
                    y: pos.y - vector.start.y
                };
                this.rightCanvas.style.cursor = 'grabbing';
                this.rightCanvas.setPointerCapture(e.pointerId);
                break;
            }
        }
    }
    
    handleRightPointerMove(e) {
        if (this.dragging === null) return;
        e.preventDefault();
        
        const pos = this.getPointerPos(this.rightCanvas, e);
        const vector = this.rightVectors[this.dragging];
        const dx = vector.end.x - vector.start.x;
        const dy = vector.end.y - vector.start.y;
        
        vector.start = {
            x: pos.x - this.dragOffset.x,
            y: pos.y - this.dragOffset.y
        };
        vector.end = {
            x: vector.start.x + dx,
            y: vector.start.y + dy
        };
        
        this.drawRight();
        this.updateResultant();
    }
    
    handleRightPointerUp(e) {
        if (this.dragging !== null) {
            this.rightCanvas.releasePointerCapture(e.pointerId);
        }
        this.dragging = null;
        this.rightCanvas.style.cursor = 'default';
    }
    
    drawVector(ctx, start, end, color, width = 2, temporary = false, isResultant = false) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx*dx + dy*dy);
        
        if (length < 1) return;
        
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        
        // Set dash pattern for resultant vector
        if (isResultant) {
            ctx.setLineDash([8, 4]);
        } else {
            ctx.setLineDash([]);
        }
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Reset dash pattern for arrowhead
        ctx.setLineDash([]);
        
        // Draw arrowhead
        const angle = Math.atan2(dy, dx);
        const arrowLength = isResultant ? 15 : 12;
        const arrowAngle = Math.PI / 6;
        
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
            end.x - arrowLength * Math.cos(angle - arrowAngle),
            end.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.lineTo(
            end.x - arrowLength * Math.cos(angle + arrowAngle),
            end.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.closePath();
        ctx.fill();
        
        if (!temporary) {
            // Draw magnitude label
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
        const angle = Math.atan2(dx, -dy) * 180 / Math.PI; // From top, clockwise
        const magnitude = Math.sqrt(dx*dx + dy*dy) / 3;
        
        // Draw angle arc from vertical (top) to vector direction
        ctx.strokeStyle = '#7f8c8d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const startAngle = -Math.PI / 2; // Start from top (vertical)
        const endAngle = Math.atan2(dy, dx); // End at vector direction
        ctx.arc(start.x, start.y, 30, startAngle, endAngle, false);
        ctx.stroke();
        
        // Angle text
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
        
        // Horizontal component
        ctx.beginPath();
        ctx.moveTo(vector.start.x, vector.start.y);
        ctx.lineTo(vector.start.x + dx, vector.start.y);
        ctx.stroke();
        
        // Vertical component
        ctx.beginPath();
        ctx.moveTo(vector.start.x + dx, vector.start.y);
        ctx.lineTo(vector.start.x + dx, vector.start.y + dy);
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // Component labels
        ctx.fillStyle = vector.color;
        ctx.font = '10px Arial';
        const hComp = (dx / 3).toFixed(1);
        const vComp = (-dy / 3).toFixed(1);
        ctx.fillText(`${hComp}N`, vector.start.x + dx/2, vector.start.y - 5);
        ctx.fillText(`${vComp}N`, vector.start.x + dx + 5, vector.start.y + dy/2);
    }
    
    drawLeft() {
        this.leftCtx.clearRect(0, 0, this.leftCanvas.width, this.leftCanvas.height);
        
        // Draw grid
        this.drawGrid(this.leftCtx);
        
        // Draw center point
        this.leftCtx.fillStyle = '#2c3e50';
        this.leftCtx.beginPath();
        this.leftCtx.arc(this.leftCenter.x, this.leftCenter.y, 8, 0, 2 * Math.PI);
        this.leftCtx.fill();
        
        this.leftCtx.fillStyle = '#2c3e50';
        this.leftCtx.font = '12px Arial';
        this.leftCtx.fillText('Object', this.leftCenter.x - 20, this.leftCenter.y + 25);
        
        // Draw vectors
        this.leftVectors.forEach((vector, index) => {
            this.drawVector(this.leftCtx, vector.start, vector.end, vector.color, 3);
            if (this.showComponents) {
                this.drawComponents(this.leftCtx, vector);
            }
        });
    }
    
    drawRight() {
        this.rightCtx.clearRect(0, 0, this.rightCanvas.width, this.rightCanvas.height);
        
        // Draw grid
        this.drawGrid(this.rightCtx);
        
        // Draw vectors
        this.rightVectors.forEach((vector, index) => {
            this.drawVector(this.rightCtx, vector.start, vector.end, vector.color, 3);
            if (this.showComponents) {
                this.drawComponents(this.rightCtx, vector);
            }
        });
        
        // Draw connection lines for triangle
        if (this.rightVectors.length > 1) {
            this.rightCtx.strokeStyle = '#95a5a6';
            this.rightCtx.setLineDash([2, 2]);
            this.rightCtx.lineWidth = 1;
            
            for (let i = 0; i < this.rightVectors.length - 1; i++) {
                this.rightCtx.beginPath();
                this.rightCtx.moveTo(this.rightVectors[i].end.x, this.rightVectors[i].end.y);
                this.rightCtx.lineTo(this.rightVectors[i + 1].start.x, this.rightVectors[i + 1].start.y);
                this.rightCtx.stroke();
            }
            
            this.rightCtx.setLineDash([]);
        }
    }
    
    drawGrid(ctx) {
        ctx.strokeStyle = '#ecf0f1';
        ctx.lineWidth = 1;
        
        for (let x = 0; x <= 400; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 400);
            ctx.stroke();
        }
        
        for (let y = 0; y <= 400; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(400, y);
            ctx.stroke();
        }
    }
    
    draw() {
        this.drawLeft();
        this.drawRight();
        this.updateResultant();
    }
    
    updateVectorInfo() {
        const leftInfo = document.getElementById('leftVectorInfo');
        const rightInfo = document.getElementById('rightVectorInfo');
        
        if (this.leftVectors.length === 0) {
            leftInfo.innerHTML = `
                <div class="vector-card">
                    <p>Click and drag from the center to draw force vectors. Angles and magnitudes are automatically calculated.</p>
                </div>
            `;
            rightInfo.innerHTML = `
                <div class="vector-card">
                    <p>Vectors from the left appear here. Drag them to form a vector triangle and see the resultant.</p>
                </div>
            `;
            return;
        }
        
        let leftHtml = '';
        let rightHtml = '';
        
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
                    ${this.showComponents ? `
                        <div class="components-display">
                            Fx = ${(vector.magnitude * Math.sin(vector.angle * Math.PI / 180)).toFixed(1)}N<br>
                            Fy = ${(vector.magnitude * Math.cos(vector.angle * Math.PI / 180)).toFixed(1)}N
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        rightHtml = `
            <div class="vector-card">
                <p><strong>Instructions:</strong> Drag vectors by their arrow heads to arrange them tip-to-tail for vector addition.</p>
            </div>
        `;
        
        leftInfo.innerHTML = leftHtml;
        rightInfo.innerHTML = rightHtml;
    }
    
    updateResultant() {
        if (this.rightVectors.length < 2) {
            document.getElementById('resultantInfo').style.display = 'none';
            return;
        }
        
        // Use vector sum approach
        let sumX = 0, sumY = 0;
        this.rightVectors.forEach(vector => {
            const dx = vector.end.x - vector.start.x;
            const dy = vector.end.y - vector.start.y;
            sumX += dx;
            sumY += dy;
        });
        
        // Use the first vector's start as the resultant start
        const firstStart = this.rightVectors[0].start;
        const calculatedEnd = {
            x: firstStart.x + sumX,
            y: firstStart.y + sumY
        };
        
        const magnitude = Math.sqrt(sumX*sumX + sumY*sumY) / 3;
        const angle = Math.atan2(sumX, -sumY) * 180 / Math.PI; // From top, clockwise
        
        // Draw resultant vector
        this.drawVector(this.rightCtx, firstStart, calculatedEnd, '#2c3e50', 4, false, true);
        
        document.getElementById('resultantInfo').style.display = 'block';
        document.getElementById('resultantText').innerHTML = `
            <strong>Magnitude:</strong> ${magnitude.toFixed(1)}N<br>
            <strong>Direction:</strong> ${angle.toFixed(1)}°<br>
            <strong>Components:</strong> Rx = ${(sumX/3).toFixed(1)}N, Ry = ${(-sumY/3).toFixed(1)}N
        `;
    }
    
    toggleComponents() {
        this.showComponents = !this.showComponents;
        const btn = document.getElementById('componentsBtn');
        if (this.showComponents) {
            btn.classList.add('active');
            btn.textContent = 'Hide Components';
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Show Components';
        }
        this.draw();
        this.updateVectorInfo();
    }
    
    autoArrangeTriangle() {
        if (this.rightVectors.length < 2) return;
        
        let currentEnd = { x: 100, y: 200 };
        
        this.rightVectors.forEach((vector, index) => {
            const dx = vector.end.x - vector.start.x;
            const dy = vector.end.y - vector.start.y;
            
            vector.start = { ...currentEnd };
            vector.end = {
                x: currentEnd.x + dx,
                y: currentEnd.y + dy
            };
            
            currentEnd = vector.end;
        });
        
        this.draw();
    }
    
    loadScenario(scenario) {
        this.clearAll();
        
        const scenarios = {
            equilibrium: [
                { magnitude: 50, angle: 0 },   // Up
                { magnitude: 50, angle: 120 }, // Down-left
                { magnitude: 50, angle: 240 }  // Down-right
            ],
            incline: [
                { magnitude: 60, angle: 180 }, // Weight (down)
                { magnitude: 36, angle: 150 }, // Component down slope
                { magnitude: 48, angle: 330 }  // Normal force
            ],
            tension: [
                { magnitude: 40, angle: 45 },  // Up-right
                { magnitude: 40, angle: 135 }, // Down-right
                { magnitude: 56, angle: 180 }  // Down
            ],
            projectile: [
                { magnitude: 50, angle: 45 },  // Up-right
                { magnitude: 35, angle: 90 },  // Right
                { magnitude: 35, angle: 0 }    // Up
            ]
        };
        
        const vectors = scenarios[scenario];
        vectors.forEach((v, index) => {
            const radians = v.angle * Math.PI / 180;
            const length = v.magnitude * 3; // Scale up for display
            const color = this.colors[index % this.colors.length];
            
            // Use new angle system: 0° at top, clockwise
            const end = {
                x: this.leftCenter.x + length * Math.sin(radians),
                y: this.leftCenter.y - length * Math.cos(radians)
            };
            
            this.leftVectors.push({
                start: { ...this.leftCenter },
                end: end,
                color: color,
                magnitude: v.magnitude,
                angle: v.angle
            });
            
            this.rightVectors.push({
                start: { x: 50 + index * 30, y: 350 },
                end: { 
                    x: 50 + index * 30 + length * Math.sin(radians), 
                    y: 350 - length * Math.cos(radians) 
                },
                color: color,
                magnitude: v.magnitude,
                angle: v.angle,
                originalIndex: index
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
        
        if (magnitude < 1 || magnitude > 200) {
            alert('Magnitude must be between 1 and 200 N');
            return;
        }
        
        const color = this.colors[this.colorIndex % this.colors.length];
        this.colorIndex++;
        
        const radians = angle * Math.PI / 180;
        const length = magnitude * 3; // Scale up for display
        
        // Use new angle system: 0° at top, clockwise
        const end = {
            x: this.leftCenter.x + length * Math.sin(radians),
            y: this.leftCenter.y - length * Math.cos(radians)
        };
        
        const vector = {
            start: { ...this.leftCenter },
            end: end,
            color: color,
            magnitude: magnitude,
            angle: angle
        };
        
        this.leftVectors.push(vector);
        
        // Add corresponding vector to right panel
        this.rightVectors.push({
            start: { x: 50 + this.rightVectors.length * 30, y: 350 },
            end: { 
                x: 50 + this.rightVectors.length * 30 + length * Math.sin(radians), 
                y: 350 - length * Math.cos(radians) 
            },
            color: color,
            magnitude: magnitude,
            angle: angle,
            originalIndex: this.leftVectors.length - 1
        });
        
        // Clear inputs
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
        
        if (isNaN(magnitude) || magnitude < 1 || magnitude > 200) {
            alert('Magnitude must be between 1 and 200 N');
            return;
        }
        
        if (isNaN(angle)) {
            alert('Please enter a valid angle');
            return;
        }
        
        // Update left vector
        const radians = angle * Math.PI / 180;
        const length = magnitude * 3;
        
        this.leftVectors[index].magnitude = magnitude;
        this.leftVectors[index].angle = angle;
        this.leftVectors[index].end = {
            x: this.leftCenter.x + length * Math.sin(radians),
            y: this.leftCenter.y - length * Math.cos(radians)
        };
        
        // Update corresponding right vector
        const rightIndex = this.rightVectors.findIndex(v => v.originalIndex === index);
        if (rightIndex !== -1) {
            const rightVector = this.rightVectors[rightIndex];
            
            rightVector.magnitude = magnitude;
            rightVector.angle = angle;
            rightVector.end = {
                x: rightVector.start.x + length * Math.sin(radians),
                y: rightVector.start.y - length * Math.cos(radians)
            };
        }
        
        this.draw();
        this.updateVectorInfo();
    }
    
    deleteVector(index) {
        if (index < 0 || index >= this.leftVectors.length) return;
        
        // Remove from left vectors
        this.leftVectors.splice(index, 1);
        
        // Remove corresponding right vector
        const rightIndex = this.rightVectors.findIndex(v => v.originalIndex === index);
        if (rightIndex !== -1) {
            this.rightVectors.splice(rightIndex, 1);
        }
        
        // Update original indices for remaining vectors
        this.rightVectors.forEach(vector => {
            if (vector.originalIndex > index) {
                vector.originalIndex--;
            }
        });
        
        this.draw();
        this.updateVectorInfo();
    }
    
    clearAll() {
        this.leftVectors = [];
        this.rightVectors = [];
        this.colorIndex = 0;
        this.showComponents = false;
        
        document.getElementById('componentsBtn').classList.remove('active');
        document.getElementById('componentsBtn').textContent = '📊 Show Components';
        document.getElementById('resultantInfo').style.display = 'none';
        
        // Clear input fields
        document.getElementById('magnitudeInput').value = '';
        document.getElementById('angleInput').value = '';
        
        this.draw();
        this.updateVectorInfo();
    }
}

// instantiate simulator
const simulator = new VectorSimulator();
