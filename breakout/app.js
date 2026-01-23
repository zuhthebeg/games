const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMessage = document.getElementById('overlayMessage');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');

let width, height, scale;
let gameRunning = false;
let score = 0;
let lives = 3;

// Game objects
let paddle, ball, bricks;

// Colors
const colors = ['#ec4899', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

// Audio
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type, pitch = 1) {
    if (!audioCtx) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'paddle':
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(220, now);
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.exponentialDecayToValueAtTime(0.01, now + 0.15);
            oscillator.start(now);
            oscillator.stop(now + 0.15);
            break;

        case 'brick':
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(440 * pitch, now);
            oscillator.frequency.exponentialDecayToValueAtTime(880 * pitch, now + 0.05);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialDecayToValueAtTime(0.01, now + 0.1);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
            break;

        case 'wall':
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(150, now);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialDecayToValueAtTime(0.01, now + 0.08);
            oscillator.start(now);
            oscillator.stop(now + 0.08);
            break;

        case 'lose':
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(300, now);
            oscillator.frequency.exponentialDecayToValueAtTime(100, now + 0.3);
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.exponentialDecayToValueAtTime(0.01, now + 0.3);
            oscillator.start(now);
            oscillator.stop(now + 0.3);
            break;

        case 'gameover':
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(200, now);
            oscillator.frequency.exponentialDecayToValueAtTime(50, now + 0.5);
            gainNode.gain.setValueAtTime(0.25, now);
            gainNode.gain.exponentialDecayToValueAtTime(0.01, now + 0.5);
            oscillator.start(now);
            oscillator.stop(now + 0.5);
            break;

        case 'win':
            playWinSound();
            return;
    }
}

function playWinSound() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.1);
        gain.gain.exponentialDecayToValueAtTime(0.01, audioCtx.currentTime + i * 0.1 + 0.3);

        osc.start(audioCtx.currentTime + i * 0.1);
        osc.stop(audioCtx.currentTime + i * 0.1 + 0.3);
    });
}

// Polyfill for exponentialDecayToValueAtTime
if (!AudioParam.prototype.exponentialDecayToValueAtTime) {
    AudioParam.prototype.exponentialDecayToValueAtTime = function(value, endTime) {
        this.exponentialRampToValueAtTime(Math.max(value, 0.0001), endTime);
    };
}

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    width = rect.width;
    height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    scale = width / 400;

    initGameObjects();
}

function initGameObjects() {
    // Paddle
    paddle = {
        width: 80 * scale,
        height: 12 * scale,
        x: width / 2 - (40 * scale),
        y: height - 30 * scale,
        speed: 8 * scale,
        targetX: width / 2 - (40 * scale)
    };

    // Ball
    resetBall();

    // Bricks
    initBricks();
}

function resetBall() {
    ball = {
        x: width / 2,
        y: height - 50 * scale,
        radius: 8 * scale,
        dx: 4 * scale * (Math.random() > 0.5 ? 1 : -1),
        dy: -4 * scale,
        speed: 4 * scale
    };
}

function initBricks() {
    bricks = [];
    const rows = 5;
    const cols = 8;
    const brickWidth = (width - 40 * scale) / cols;
    const brickHeight = 20 * scale;
    const padding = 4 * scale;
    const offsetTop = 50 * scale;
    const offsetLeft = 20 * scale;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            bricks.push({
                x: offsetLeft + col * brickWidth + padding / 2,
                y: offsetTop + row * brickHeight + padding / 2,
                width: brickWidth - padding,
                height: brickHeight - padding,
                color: colors[row % colors.length],
                visible: true,
                points: (rows - row) * 10
            });
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    // Draw bricks
    bricks.forEach(brick => {
        if (brick.visible) {
            ctx.fillStyle = brick.color;
            ctx.beginPath();
            ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4 * scale);
            ctx.fill();
        }
    });

    // Draw paddle
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    gradient.addColorStop(0, '#ec4899');
    gradient.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6 * scale);
    ctx.fill();

    // Draw ball
    const ballGradient = ctx.createRadialGradient(
        ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
        ball.x, ball.y, ball.radius
    );
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
}

function update() {
    if (!gameRunning) return;

    // Smooth paddle movement
    const diff = paddle.targetX - paddle.x;
    paddle.x += diff * 0.15;

    // Clamp paddle position
    paddle.x = Math.max(0, Math.min(width - paddle.width, paddle.x));

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collision
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > width) {
        ball.dx = -ball.dx;
        ball.x = Math.max(ball.radius, Math.min(width - ball.radius, ball.x));
        playSound('wall');
    }

    if (ball.y - ball.radius < 0) {
        ball.dy = -ball.dy;
        ball.y = ball.radius;
        playSound('wall');
    }

    // Paddle collision
    if (ball.dy > 0 &&
        ball.y + ball.radius > paddle.y &&
        ball.y - ball.radius < paddle.y + paddle.height &&
        ball.x > paddle.x &&
        ball.x < paddle.x + paddle.width) {

        const hitPos = (ball.x - paddle.x) / paddle.width;
        const angle = (hitPos - 0.5) * Math.PI * 0.7;
        const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy) * 1.02;

        ball.dx = Math.sin(angle) * speed;
        ball.dy = -Math.abs(Math.cos(angle) * speed);
        ball.y = paddle.y - ball.radius;

        // Cap speed
        const maxSpeed = 10 * scale;
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        if (currentSpeed > maxSpeed) {
            ball.dx = (ball.dx / currentSpeed) * maxSpeed;
            ball.dy = (ball.dy / currentSpeed) * maxSpeed;
        }

        playSound('paddle');
    }

    // Brick collision
    bricks.forEach(brick => {
        if (!brick.visible) return;

        if (ball.x + ball.radius > brick.x &&
            ball.x - ball.radius < brick.x + brick.width &&
            ball.y + ball.radius > brick.y &&
            ball.y - ball.radius < brick.y + brick.height) {

            brick.visible = false;
            score += brick.points;
            scoreEl.textContent = score;
            playSound('brick', 0.8 + (brick.points / 50) * 0.6);

            // Determine collision side
            const overlapLeft = ball.x + ball.radius - brick.x;
            const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
            const overlapTop = ball.y + ball.radius - brick.y;
            const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);

            const minOverlapX = Math.min(overlapLeft, overlapRight);
            const minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
                ball.dx = -ball.dx;
            } else {
                ball.dy = -ball.dy;
            }
        }
    });

    // Check win
    if (bricks.every(b => !b.visible)) {
        playSound('win');
        gameWin();
        return;
    }

    // Ball out of bounds
    if (ball.y > height + ball.radius) {
        lives--;
        livesEl.textContent = lives;

        if (lives <= 0) {
            playSound('gameover');
            gameOver();
        } else {
            playSound('lose');
            resetBall();
        }
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    initAudio();
    score = 0;
    lives = 3;
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    initGameObjects();
    gameRunning = true;
    overlay.classList.add('hidden');
}

function gameOver() {
    gameRunning = false;
    overlayTitle.textContent = '게임 오버';
    overlayMessage.textContent = `최종 점수: ${score}점`;
    startBtn.textContent = '다시 시작';
    overlay.classList.remove('hidden');
}

function gameWin() {
    gameRunning = false;
    overlayTitle.textContent = '축하합니다!';
    overlayMessage.textContent = `모든 벽돌을 깼습니다! 점수: ${score}점`;
    startBtn.textContent = '다시 시작';
    overlay.classList.remove('hidden');
}

// Event listeners
function handlePointerMove(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    paddle.targetX = x - paddle.width / 2;
}

canvas.addEventListener('mousemove', (e) => {
    handlePointerMove(e.clientX);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handlePointerMove(e.touches[0].clientX);
}, { passive: false });

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePointerMove(e.touches[0].clientX);
}, { passive: false });

startBtn.addEventListener('click', startGame);

window.addEventListener('resize', resizeCanvas);

// Initialize
resizeCanvas();
gameLoop();
