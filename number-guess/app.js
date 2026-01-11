class NumberGuessGame {
    constructor() {
        this.targetNumber = 0;
        this.attempts = 0;
        this.history = [];
        this.bestScore = this.loadBestScore();

        this.elements = {
            guessInput: document.getElementById('guessInput'),
            guessBtn: document.getElementById('guessBtn'),
            resetBtn: document.getElementById('resetBtn'),
            message: document.getElementById('message'),
            attemptsDisplay: document.getElementById('attempts'),
            bestScoreDisplay: document.getElementById('bestScore'),
            historyList: document.getElementById('historyList')
        };

        this.init();
    }

    init() {
        this.startNewGame();
        this.attachEventListeners();
        this.updateBestScoreDisplay();
    }

    attachEventListeners() {
        this.elements.guessBtn.addEventListener('click', () => this.makeGuess());
        this.elements.resetBtn.addEventListener('click', () => this.startNewGame());
        this.elements.guessInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.makeGuess();
        });
    }

    startNewGame() {
        this.targetNumber = Math.floor(Math.random() * 100) + 1;
        this.attempts = 0;
        this.history = [];
        this.elements.guessInput.value = '';
        this.elements.guessInput.disabled = false;
        this.elements.guessBtn.disabled = false;
        this.elements.guessInput.focus();
        this.updateDisplay();
        this.showMessage('숫자를 입력하고 추측 버튼을 누르세요!', 'info');
        this.updateHistory();
    }

    makeGuess() {
        const guess = parseInt(this.elements.guessInput.value);

        if (isNaN(guess)) {
            this.showMessage('숫자를 입력해주세요!', 'error');
            return;
        }

        if (guess < 1 || guess > 100) {
            this.showMessage('1부터 100 사이의 숫자를 입력해주세요!', 'error');
            return;
        }

        if (this.history.includes(guess)) {
            this.showMessage(`${guess}는 이미 시도한 숫자입니다!`, 'warning');
            return;
        }

        this.attempts++;
        this.history.push(guess);
        this.elements.guessInput.value = '';

        if (guess === this.targetNumber) {
            this.handleWin();
        } else if (guess < this.targetNumber) {
            this.showMessage(`${guess}보다 큽니다! ⬆️`, 'hint-up');
        } else {
            this.showMessage(`${guess}보다 작습니다! ⬇️`, 'hint-down');
        }

        this.updateDisplay();
        this.updateHistory();
    }

    handleWin() {
        this.showMessage(`🎉 정답입니다! ${this.attempts}번 만에 맞추셨습니다!`, 'success');
        this.elements.guessInput.disabled = true;
        this.elements.guessBtn.disabled = true;

        if (this.bestScore === null || this.attempts < this.bestScore) {
            this.bestScore = this.attempts;
            this.saveBestScore(this.bestScore);
            this.updateBestScoreDisplay();
            setTimeout(() => {
                this.showMessage(`🏆 새로운 최고 기록입니다! (${this.attempts}번)`, 'success');
            }, 1000);
        }
    }

    showMessage(text, type) {
        this.elements.message.textContent = text;
        this.elements.message.className = `message ${type}`;
    }

    updateDisplay() {
        this.elements.attemptsDisplay.textContent = this.attempts;
    }

    updateHistory() {
        if (this.history.length === 0) {
            this.elements.historyList.innerHTML = '<p class="empty">아직 시도한 숫자가 없습니다.</p>';
            return;
        }

        const sortedHistory = [...this.history].sort((a, b) => a - b);
        this.elements.historyList.innerHTML = sortedHistory
            .map(num => {
                let className = 'history-item';
                if (num === this.targetNumber) className += ' correct';
                else if (num < this.targetNumber) className += ' low';
                else className += ' high';
                return `<span class="${className}">${num}</span>`;
            })
            .join('');
    }

    loadBestScore() {
        const saved = localStorage.getItem('numberGuess_bestScore');
        return saved ? parseInt(saved) : null;
    }

    saveBestScore(score) {
        localStorage.setItem('numberGuess_bestScore', score.toString());
    }

    updateBestScoreDisplay() {
        this.elements.bestScoreDisplay.textContent = this.bestScore !== null ? `${this.bestScore}번` : '-';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NumberGuessGame();
});
