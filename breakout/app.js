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
    }

    if (ball.y - ball.radius < 0) {
        ball.dy = -ball.dy;
        ball.y = ball.radius;
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
        gameWin();
        return;
    }

    // Ball out of bounds
    if (ball.y > height + ball.radius) {
        lives--;
        livesEl.textContent = lives;

        if (lives <= 0) {
            gameOver();
        } else {
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
