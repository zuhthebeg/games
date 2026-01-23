class SnakeGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.overlay = document.getElementById('gameOverlay');
        this.overlayTitle = document.getElementById('overlayTitle');
        this.overlayMessage = document.getElementById('overlayMessage');

        this.gridSize = 20;
        this.tileCount = 20;
        this.tileSize = this.canvas.width / this.tileCount;

        this.snake = [];
        this.snakeLength = 3;
        this.headX = 10;
        this.headY = 10;
        this.velocityX = 0;
        this.velocityY = 0;

        this.foodX = 15;
        this.foodY = 15;
        this.foodType = 'normal';

        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
        this.level = 1;
        this.gameSpeed = 100;

        this.gameRunning = false;
        this.gamePaused = false;
        this.gameLoop = null;

        this.init();
    }

    init() {
        this.updateDisplay();
        this.attachEventListeners();
        this.showOverlay('스네이크 게임', '화살표 키 또는 WASD로 조종하세요');
    }

    attachEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('restartBtn').addEventListener('click', () => this.restart());

        document.addEventListener('keydown', (e) => this.handleKeyPress(e));

        const dpadButtons = document.querySelectorAll('.dpad-btn[data-direction]');
        dpadButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const direction = btn.dataset.direction;
                this.handleDirectionInput(direction);
            });
        });
    }

    handleKeyPress(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (!this.gameRunning) {
                this.start();
            } else if (this.gamePaused) {
                this.togglePause();
            }
            return;
        }

        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            if (this.gameRunning) {
                this.togglePause();
            }
            return;
        }

        if (!this.gameRunning || this.gamePaused) return;

        const key = e.key.toLowerCase();
        if (key === 'arrowup' || key === 'w') {
            this.handleDirectionInput('up');
        } else if (key === 'arrowdown' || key === 's') {
            this.handleDirectionInput('down');
        } else if (key === 'arrowleft' || key === 'a') {
            this.handleDirectionInput('left');
        } else if (key === 'arrowright' || key === 'd') {
            this.handleDirectionInput('right');
        }
    }

    handleDirectionInput(direction) {
        if (direction === 'up' && this.velocityY === 0) {
            this.velocityX = 0;
            this.velocityY = -1;
        } else if (direction === 'down' && this.velocityY === 0) {
            this.velocityX = 0;
            this.velocityY = 1;
        } else if (direction === 'left' && this.velocityX === 0) {
            this.velocityX = -1;
            this.velocityY = 0;
        } else if (direction === 'right' && this.velocityX === 0) {
            this.velocityX = 1;
            this.velocityY = 0;
        }
    }

    start() {
        if (this.gameRunning) return;

        this.snake = [];
        this.snakeLength = 3;
        this.headX = 10;
        this.headY = 10;
        this.velocityX = 1;
        this.velocityY = 0;
        this.score = 0;
        this.level = 1;
        this.gameSpeed = 100;
        this.gameRunning = true;
        this.gamePaused = false;

        this.placeFood();
        this.hideOverlay();
        this.updateDisplay();
        this.enableButtons();
        this.gameLoop = setInterval(() => this.update(), this.gameSpeed);
    }

    togglePause() {
        if (!this.gameRunning) return;

        this.gamePaused = !this.gamePaused;
        const pauseBtn = document.getElementById('pauseBtn');

        if (this.gamePaused) {
            clearInterval(this.gameLoop);
            pauseBtn.textContent = '계속하기';
            this.showOverlay('일시정지', '계속하려면 P 키를 누르세요');
        } else {
            this.gameLoop = setInterval(() => this.update(), this.gameSpeed);
            pauseBtn.textContent = '일시정지';
            this.hideOverlay();
        }
    }

    restart() {
        clearInterval(this.gameLoop);
        this.gameRunning = false;
        this.gamePaused = false;
        this.disableButtons();
        this.start();
    }

    update() {
        this.move();

        if (this.checkCollision()) {
            this.gameOver();
            return;
        }

        if (this.checkFoodCollision()) {
            this.eatFood();
        }

        this.draw();
    }

    move() {
        this.headX += this.velocityX;
        this.headY += this.velocityY;

        this.snake.push({ x: this.headX, y: this.headY });

        while (this.snake.length > this.snakeLength) {
            this.snake.shift();
        }
    }

    checkCollision() {
        if (this.headX < 0 || this.headX >= this.tileCount ||
            this.headY < 0 || this.headY >= this.tileCount) {
            return true;
        }

        for (let i = 0; i < this.snake.length - 1; i++) {
            if (this.snake[i].x === this.headX && this.snake[i].y === this.headY) {
                return true;
            }
        }

        return false;
    }

    checkFoodCollision() {
        return this.headX === this.foodX && this.headY === this.foodY;
    }

    eatFood() {
        this.snakeLength++;

        if (this.foodType === 'golden') {
            this.score += 5;
        } else {
            this.score += 1;
        }

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snakeHighScore', this.highScore);
        }

        this.level = Math.floor(this.score / 10) + 1;

        if (this.score % 10 === 0 && this.gameSpeed > 40) {
            this.gameSpeed -= 10;
            clearInterval(this.gameLoop);
            this.gameLoop = setInterval(() => this.update(), this.gameSpeed);
        }

        this.placeFood();
        this.updateDisplay();
    }

    placeFood() {
        this.foodType = (this.score > 0 && this.score % 5 === 0) ? 'golden' : 'normal';

        do {
            this.foodX = Math.floor(Math.random() * this.tileCount);
            this.foodY = Math.floor(Math.random() * this.tileCount);
        } while (this.isFoodOnSnake());
    }

    isFoodOnSnake() {
        for (let segment of this.snake) {
            if (segment.x === this.foodX && segment.y === this.foodY) {
                return true;
            }
        }
        return false;
    }

    draw() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawGrid();
        this.drawFood();
        this.drawSnake();
    }

    drawGrid() {
        this.ctx.strokeStyle = '#2a2a3e';
        this.ctx.lineWidth = 1;

        for (let i = 0; i <= this.tileCount; i++) {
            const pos = i * this.tileSize;

            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
    }

    drawFood() {
        const x = this.foodX * this.tileSize;
        const y = this.foodY * this.tileSize;
        const padding = 3;

        if (this.foodType === 'golden') {
            const gradient = this.ctx.createRadialGradient(
                x + this.tileSize / 2, y + this.tileSize / 2, 0,
                x + this.tileSize / 2, y + this.tileSize / 2, this.tileSize / 2
            );
            gradient.addColorStop(0, '#fbbf24');
            gradient.addColorStop(1, '#f59e0b');
            this.ctx.fillStyle = gradient;
        } else {
            this.ctx.fillStyle = '#ef4444';
        }

        this.ctx.beginPath();
        this.ctx.arc(
            x + this.tileSize / 2,
            y + this.tileSize / 2,
            (this.tileSize - padding * 2) / 2,
            0,
            Math.PI * 2
        );
        this.ctx.fill();

        if (this.foodType === 'golden') {
            this.ctx.fillStyle = '#fef3c7';
            this.ctx.beginPath();
            this.ctx.arc(
                x + this.tileSize / 2 - 2,
                y + this.tileSize / 2 - 2,
                3,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        }
    }

    drawSnake() {
        for (let i = 0; i < this.snake.length; i++) {
            const segment = this.snake[i];
            const x = segment.x * this.tileSize;
            const y = segment.y * this.tileSize;
            const padding = 2;

            const isHead = i === this.snake.length - 1;

            if (isHead) {
                const gradient = this.ctx.createLinearGradient(x, y, x + this.tileSize, y + this.tileSize);
                gradient.addColorStop(0, '#10b981');
                gradient.addColorStop(1, '#059669');
                this.ctx.fillStyle = gradient;
            } else {
                const intensity = i / this.snake.length;
                this.ctx.fillStyle = `rgba(16, 185, 129, ${0.4 + intensity * 0.6})`;
            }

            this.ctx.fillRect(
                x + padding,
                y + padding,
                this.tileSize - padding * 2,
                this.tileSize - padding * 2
            );

            if (isHead) {
                this.ctx.fillStyle = '#d1fae5';
                this.ctx.beginPath();
                this.ctx.arc(
                    x + this.tileSize / 2 - 3,
                    y + this.tileSize / 2 - 3,
                    2,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
            }
        }
    }

    gameOver() {
        clearInterval(this.gameLoop);
        this.gameRunning = false;
        this.gamePaused = false;
        this.disableButtons();

        this.showOverlay(
            '게임 오버!',
            `점수: ${this.score} | 최고점수: ${this.highScore}\n다시 시작하려면 버튼을 클릭하세요`
        );
    }

    showOverlay(title, message) {
        this.overlayTitle.textContent = title;
        this.overlayMessage.textContent = message;
        this.overlay.classList.remove('hidden');
    }

    hideOverlay() {
        this.overlay.classList.add('hidden');
    }

    updateDisplay() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('highScore').textContent = this.highScore;
        document.getElementById('level').textContent = this.level;
    }

    enableButtons() {
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('restartBtn').disabled = false;
    }

    disableButtons() {
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('pauseBtn').textContent = '일시정지';
        document.getElementById('restartBtn').disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SnakeGame();
});
