        // 게임 상수
        const BOARD_SIZE = 9;
        
        // 게임 상태 변수 선언 부분 수정
        let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false));
        let score = 0;
        let draggedBlock = null;
        let dragOffset = { x: 0, y: 0 };
        let previewCells = [];
        let currentLevel = 'intermediate'; // 전역 변수로 이동

        // 성능 최적화를 위한 변수 추가
        let lastValidPosition = null;
        const boardCells = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));

        // 점수 관련 전역 변수 추가
        let comboCount = 0;
        let lastClearTurn = 0;
        let currentTurn = 0;

        // 전역 변수 추가
        let isValidDrag = false;
        let hintPreviewCells = [];

        // 전역 변수에 힌트 비용 추가
        const HINT_COSTS = {
            refresh: 10,
            rotate: 5,
            placement: 1
        };

        // 레벨 시스템 구현 (수정 버전)
        const BLOCK_CATEGORIES = {
            beginner: [ 
                [[1]],
                [[1,1]],
                [[1],[1]],
                [[1,1,1]],
                [[1,1],[1,0]],  // L 모양
                [[1,0],[1,1]],  // J 모양
                [[0,1],[1,1]],  // ㄱ 모양
                [[1,1],[0,1]]  // ㄴ 모양
            ],
            intermediate: [
                // 테트리스 블록 + 기타 블록 (문제 패턴 제외)
                [[1,1,1,1]],           // I
                [[1,1],[1,1]],         // O
                [[1,1,1],[0,1,0]],     // T
                [[1,1,0],[0,1,1]],     // S 
                [[0,1,1],[1,1,0]],     // Z
                [[1,1,1],[1,0,0]],     // L
                [[1,1,1],[0,0,1]],     // J
                [[0,1,0],[1,1,1]],     // ㅗ
                [[1,0],[1,1],[1,0]]    // ㅓ
                // [[1,1],[1,0],[0,1]] 패턴 제거됨
            ],
            advanced: [ 
                [[1,1,1,1,1]], 
                [[1,1,1],[1,0,0],[1,0,0]],
                [[1,1,1],[0,1,0],[0,1,0]],
                [[1,1],[1,1],[1,0]],
                [[1,1,1,1],[0,0,0,1]],
                [[1,1,1],[1,1,1]],
                [[1,1,1,1],[1,1,0,0]],
                [[1,1,1],[1,0,1],[1,0,1]],
                [[1,0,1],[1,1,1],[1,0,1]]
            ],
            chaos: [] // 초기 빈 배열
        };

        // 카오스 배열 별도 초기화
        BLOCK_CATEGORIES.chaos = [
            ...BLOCK_CATEGORIES.beginner,
            ...BLOCK_CATEGORIES.intermediate,
            ...BLOCK_CATEGORIES.advanced,
            [[1,1,1,1],[1,1,1,1]],       
            [[1,1],[1,1],[1,1],[1,1]],   
            [[1,1,1],[1,0,1],[1,1,1]]     
        ];

        // 게임 상태 변수에 gameOver 추가
        let gameOver = false;

        // 게임 상태 변수 추가
        let gameStartTime = null;
        let currentTime = 0;
        let timerInterval = null;
        let gameClear = false;
        let isGameRunning = false;

        // 전역 변수 추가
        let isAutoPlaying = false;
        let autoPlayInterval = null;

        // 게임 종료 조건 검사 함수
        function checkGameOver() {
            const availableBlocks = document.querySelectorAll('.block-wrapper');
            let hasPossibleMoves = false;
            
            // 1. 현재 블록의 배치 가능성 확인
            for (const block of availableBlocks) {
                const pattern = JSON.parse(block.dataset.pattern);
                if(hasPlacementForPattern(pattern)) {
                    hasPossibleMoves = true;
                    break;
                }
            }
            if(hasPossibleMoves) return false;

            // 2. 모든 힌트 사용 가능 여부 확인 (실제 사용 가능한지)
            const canUseAnyHint = Object.values(HINT_COSTS).some(cost => score >= cost);
            
            // 3. 최종 판단
            return !canUseAnyHint;
        }

        // 패턴 배치 가능 여부 확인 함수
        function hasPlacementForPattern(pattern) {
            for (let y = -pattern.length + 1; y < BOARD_SIZE; y++) {
                for (let x = -pattern[0].length + 1; x < BOARD_SIZE; x++) {
                    if (isValidPosition(y, x, pattern)) {
                        return true;
                    }
                }
            }
            return false;
        }

        // 수정된 setDifficulty 함수
        function setDifficulty(level) {
            currentLevel = level;
            document.querySelectorAll('.difficulty-btn').forEach(btn => {
                btn.classList.remove('active'); // 모든 버튼에서 active 제거
                if(btn.dataset.level === level) {
                    btn.classList.add('active'); // 선택된 버튼에만 active 추가
                }
            });
            resetGame(); // 게임 초기화 추가
            generateNewBlocks();
            
            // 스코어보드 업데이트
            const records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            updateScoreboard(records[level] || []);
        }

        // 수정된 이벤트 리스너 (이벤트 위임 방식으로 변경)
        document.querySelector('.difficulty-picker').addEventListener('click', function(e) {
            if(e.target.classList.contains('difficulty-btn')) {
                setDifficulty(e.target.dataset.level);
                // 버튼 애니메이션 효과
                e.target.animate([
                    { transform: 'scale(1.2)', opacity: 0.8 },
                    { transform: 'scale(1)', opacity: 1 }
                ], { duration: 300 });
            }
        });

        // 수정된 initGame 함수
        function initGame() {
            createBoard();
            currentLevel = 'intermediate';
            setDifficulty(currentLevel); // 초기 설정도 setDifficulty 사용
            updateScore();
            createHintPanel();
            updateButtonStates();
            
            // 타이머 초기화
            gameStartTime = Date.now();
            currentTime = 0;
            gameClear = false;
            if(timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 1000);
        }

        // 보드 생성
        function createBoard() {
            const boardElement = document.getElementById('board');
            boardElement.innerHTML = '';
            
            for (let i = 0; i < BOARD_SIZE; i++) {
                for (let j = 0; j < BOARD_SIZE; j++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.row = i;
                    cell.dataset.col = j;
                    boardElement.appendChild(cell);
                    boardCells[i][j] = cell; // 캐시 저장
                }
            }
        }

        // 힌트 시스템 변수
        let hintActive = false;

        // 블록 생성 로직 수정
        function generateNewBlocks(force = false) {
            const container = document.getElementById('block-container');
            if(!force && container.children.length > 0) return;
            
            container.innerHTML = '';
            const cellSize = document.querySelector('.cell').offsetWidth;
            const patterns = BLOCK_CATEGORIES[currentLevel];
            
            // 필터링 로직 추가
            const filteredPatterns = patterns.filter(p => 
                JSON.stringify(p) !== JSON.stringify([[1,1],[1,0],[0,1]])
            );

            for (let i = 0; i < 2; i++) {  // 3 -> 2로 수정
                let pattern = filteredPatterns[Math.floor(Math.random() * filteredPatterns.length)];
                
                // 기존 회전 로직 유지
                if(Math.random() < 0.25) {
                    pattern = rotatePattern(pattern);
                }
                
                const blockWrapper = createBlockElement(pattern, cellSize);
                initDragEvents(blockWrapper);
                container.appendChild(blockWrapper);
            }
        }

        // 블록 엘리먼트 생성
        function createBlockElement(pattern, cellSize) {
            const blockWrapper = document.createElement('div');
            blockWrapper.className = 'block-wrapper';
            blockWrapper.dataset.pattern = JSON.stringify(pattern);
            
            const container = document.createElement('div');
            container.style.display = 'inline-block';
            container.style.margin = '8px';
            
            const blockGrid = document.createElement('div');
            blockGrid.className = 'block-grid';
            blockGrid.style.setProperty('--cols', pattern[0].length); /* CSS 변수 사용 */
            
            // 패턴에 따라 셀 크기 동적 조정
            const baseSize = Math.min(cellSize * 0.9, 40); // 최대 40px 제한
            pattern.forEach(row => {
                row.forEach(cell => {
                    const blockCell = document.createElement('div');
                    if (cell === 1) {
                        blockCell.className = 'block-cell';
                        blockCell.style.width = `${baseSize}px`;
                        blockCell.style.height = `${baseSize}px`;
                    }
                    // 빈 셀도 동일한 크기 유지
                    blockCell.style.width = `${baseSize}px`; 
                    blockCell.style.height = `${baseSize}px`;
                    blockGrid.appendChild(blockCell);
                });
            });
            
            container.appendChild(blockGrid);
            blockWrapper.appendChild(container);
            return blockWrapper;
        }

        // 드래그 이벤트 초기화
        function initDragEvents(blockWrapper) {
            blockWrapper.addEventListener('mousedown', startDragging);
            blockWrapper.addEventListener('touchstart', startDragging, { passive: false });
            
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('touchmove', handleDrag, { passive: false });
            
            document.addEventListener('mouseup', endDragging);
            document.addEventListener('touchend', endDragging);
        }

        // 드래그 시작
        function startDragging(e) {
            e.preventDefault();
            draggedBlock = e.currentTarget;
            
            const rect = draggedBlock.getBoundingClientRect();
            const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
            const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
            
            // 오른쪽 하단 기준 오프셋 계산
            const pattern = JSON.parse(draggedBlock.dataset.pattern);
            dragOffset.x = clientX - (rect.left + rect.width - pattern[0].length * rect.width/pattern[0].length);
            dragOffset.y = clientY - (rect.top + rect.height - pattern.length * rect.height/pattern.length);
            
            draggedBlock.style.position = 'fixed';
            draggedBlock.style.zIndex = '1000';
            
            updateBlockPosition(clientX, clientY);
        }

        // 드래그 중
        function handleDrag(e) {
            if (!draggedBlock) return;
            
            try {
                e.preventDefault();
                const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
                const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
                
                updateBlockPosition(clientX, clientY);
                isValidDrag = checkValidDragPosition(clientX, clientY); // 유효 위치 확인
                showPreview(clientX, clientY);
            } catch (error) {
                console.error('Drag error:', error);
                safeResetDraggedBlock();
            }
        }

        function checkValidDragPosition(x, y) {
            const board = document.getElementById('board');
            if (!board) return false;
            
            const rect = board.getBoundingClientRect();
            return x >= rect.left && x <= rect.right &&
                   y >= rect.top && y <= rect.bottom;
        }

        // 블록 위치 업데이트
        function updateBlockPosition(clientX, clientY) {
            draggedBlock.style.left = `${clientX - dragOffset.x}px`;
            draggedBlock.style.top = `${clientY - dragOffset.y}px`;
        }

        function isValidPosition(row, col, pattern) {
            for (let i = 0; i < pattern.length; i++) {
                for (let j = 0; j < pattern[0].length; j++) {
                    if (pattern[i][j] === 1) {
                        const x = col + j;
                        const y = row + i;
                        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || board[y][x]) {
                            return false;
                        }
                    }
                }
            }
            return true;
        }

        // 미리보기 성능 개선 버전
        function showPreview(x, y) {
            if (!draggedBlock) return;

            const pattern = JSON.parse(draggedBlock.dataset.pattern);
            const boardRect = document.getElementById('board').getBoundingClientRect();
            const cellSize = boardRect.width / BOARD_SIZE;

            const row = Math.floor((y - boardRect.top) / cellSize);
            const col = Math.floor((x - boardRect.left) / cellSize);
            const adjustRow = row - Math.floor(pattern.length/2);
            const adjustCol = col - Math.floor(pattern[0].length/2);

            // 위치 변경 없으면 업데이트 생략
            if (lastValidPosition?.row === adjustRow && lastValidPosition?.col === adjustCol) return;
            lastValidPosition = {row: adjustRow, col: adjustCol};

            clearPreview();

            // 유효성 검사 최적화
            let isValid = true;
            outer: for (let i = 0; i < pattern.length; i++) {
                for (let j = 0; j < pattern[0].length; j++) {
                    if (pattern[i][j] === 1) {
                        const y = adjustRow + i;
                        const x = adjustCol + j;
                        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || board[y][x]) {
                            isValid = false;
                            break outer;
                        }
                    }
                }
            }

            if (!isValid) return;

            // 일괄 업데이트
            const updates = [];
            pattern.forEach((row, i) => {
                row.forEach((cell, j) => {
                    if (cell === 1) {
                        const y = adjustRow + i;
                        const x = adjustCol + j;
                        if (boardCells[y]?.[x]) {
                            updates.push(boardCells[y][x]);
                        }
                    }
                });
            });

            updates.forEach(cell => cell.classList.add('preview'));
            previewCells = updates;
        }

        function clearPreview() {
            previewCells.forEach(cell => cell.classList.remove('preview'));
            previewCells = [];
            clearHintPreview(); // 힌트도 함께 제거
        }

        // 드래그 종료
        function endDragging(e) {
            if (!draggedBlock) return;
            
            try {
                clearPreview();
                const board = document.getElementById('board');
                if (!board) return;

                const boardRect = board.getBoundingClientRect();
                const clientX = e.type === 'mouseup' ? e.clientX : (e.changedTouches?.[0]?.clientX || 0);
                const clientY = e.type === 'mouseup' ? e.clientY : (e.changedTouches?.[0]?.clientY || 0);
                
                if (isOverBoard(clientX, clientY, boardRect) && isValidDrag) {
                    const pattern = JSON.parse(draggedBlock.dataset.pattern);
                    const cellSize = boardRect.width / BOARD_SIZE;
                    const row = Math.round((clientY - boardRect.top - cellSize/2) / cellSize);
                    const col = Math.round((clientX - boardRect.left - cellSize/2) / cellSize);
                    const adjustRow = row - Math.floor(pattern.length/2);
                    const adjustCol = col - Math.floor(pattern[0].length/2);
                    
                    tryPlaceBlock(adjustRow, adjustCol);
                }
            } catch (error) {
                console.error('Drag end error:', error);
            } finally {
                safeResetDraggedBlock();
            }
        }

        function safeResetDraggedBlock() {
            if (draggedBlock) {
                // 안전한 스타일 복구
                if (draggedBlock.style) {
                    draggedBlock.style.position = '';
                    draggedBlock.style.left = '';
                    draggedBlock.style.top = '';
                    draggedBlock.style.zIndex = '';
                }
                // 부모 노드가 존재하면 원래 위치로 복구
                if (draggedBlock.parentNode) {
                    const container = document.getElementById('block-container');
                    if (container) container.appendChild(draggedBlock);
                }
                draggedBlock = null;
            }
            isValidDrag = false;
        }

        // 보드 위에 있는지 확인
        function isOverBoard(x, y, boardRect) {
            return x >= boardRect.left && x <= boardRect.right &&
                   y >= boardRect.top && y <= boardRect.bottom;
        }

        // 블록 배치 시도
        function tryPlaceBlock(row, col) {
            const pattern = JSON.parse(draggedBlock.dataset.pattern);
            if (canPlaceBlock(row, col, pattern)) {
                placeBlock(row, col, pattern);
                draggedBlock.remove();
                generateNewBlocks();
            }
        }

        // 블록 배치 가능 확인
        function canPlaceBlock(row, col, pattern) {
            // 버퍼 영역 내에서만 체크
            const buffer = 1;
            if (row < -buffer || col < -buffer) return false;
            
            for (let i = 0; i < pattern.length; i++) {
                for (let j = 0; j < pattern[0].length; j++) {
                    if (pattern[i][j] === 1) {
                        const newRow = row + i;
                        const newCol = col + j;
                        
                        if (newRow >= BOARD_SIZE + buffer || 
                            newCol >= BOARD_SIZE + buffer || 
                            (newRow >= 0 && newCol >= 0 && board[newRow][newCol])) {
                            return false;
                        }
                    }
                }
            }
            return true;
        }

        // 블록 배치
        function placeBlock(row, col, pattern) {
            if (!isGameRunning) {
                isGameRunning = true;
                gameStartTime = Date.now();
                timerInterval = setInterval(updateTimer, 1000);
            }
            currentTurn++;  // 블록 배치 시 무조건 턴 증가
            pattern.forEach((patternRow, i) => {
                patternRow.forEach((cell, j) => {
                    if (cell === 1) {
                        const newRow = row + i;
                        const newCol = col + j;
                        board[newRow][newCol] = true;
                        const cellElement = document.querySelector(`[data-row="${newRow}"][data-col="${newCol}"]`);
                        cellElement.classList.add('filled');
                    }
                });
            });
            score += pattern.flat().filter(cell => cell === 1).length;
            updateScore();
            
            const linesCleared = checkLines();  // 라인 클리어 결과 저장
            
            if (!linesCleared) {
                // 라인 클리어 실패 시 콤보 리셋
                comboCount = 0;
            }
            
            // Clean 보너스 체크 (보드 전체가 비어있는지 확인)
            const isBoardEmpty = board.flat().every(cell => !cell);
            if(isBoardEmpty) {
                score += 1000;
                showEffect({
                    text: 'Clean! +1000',
                    color: '#2ecc71',
                    position: { x: '50%', y: '50%' },
                    fontSize: '3em'
                });
                updateScore();
            }

            if (checkGameOver()) {
                handleGameOver();
            } else {
                generateNewBlocks();
            }
        }

        // 수정된 checkLines 함수
        function checkLines() {
            let linesCleared = 0;
            const rows = [];
            const cols = [];

            // 가로줄 확인
            for (let row = 0; row < BOARD_SIZE; row++) {
                if (board[row].every(cell => cell)) {
                    rows.push(row);
                    linesCleared++;
                }
            }
            
            // 세로줄 확인
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (board.every(row => row[col])) {
                    cols.push(col);
                    linesCleared++;
                }
            }

            // 크로스 계산 (가로+세로 동시 클리어)
            let crossCount = 0;
            rows.forEach(r => {
                cols.forEach(c => {
                    if (board[r][c]) { // 교차점이 실제 채워져 있었는지 확인
                        crossCount++;
                    }
                });
            });

            // 클리어 애니메이션 처리
            rows.forEach(row => clearLine(row, 'row'));
            cols.forEach(col => clearLine(col, 'column'));

            if (linesCleared > 0) {
                // 콤보 계산 로직 개선 (클리어한 줄 수 누적)
                if(currentTurn - lastClearTurn === 1) {
                    comboCount += linesCleared; // 연속 턴 시 줄 수 누적
                } else {
                    comboCount = linesCleared; // 새 콤보 시작 시 초기화
                }
                lastClearTurn = currentTurn;

                const baseScore = 100 * linesCleared * comboCount; // 줄 수 × 누적 콤보
                const crossBonus = crossCount > 0 ? 2 : 1;
                const totalScore = baseScore * crossBonus;

                score += totalScore;
                updateScore();
                
                // 콤보 효과 표시
                showEffect({
                    text: `${comboCount} COMBO\n+${baseScore}`,
                    type: 'combo',
                    fontSize: '2.5em',
                    color: '#ffd54f'
                });
                
                // 크로스 효과 1초 지연 후 표시
                if(crossCount > 0) {
                    setTimeout(() => {
                        showEffect({
                            text: `X${crossBonus} CROSS!\n+${totalScore - baseScore}`,
                            type: 'cross',
                            fontSize: '3.2em',
                            color: '#2d98da',
                            duration: 1500
                        });
                    }, 1000);
                }
            } else {
                comboCount = 0; // 클리어 실패 시 콤보 리셋
            }

            return linesCleared > 0;
        }

        // 점수 업데이트
        function updateScore() {
            document.getElementById('score').innerHTML = `${score}`;
            updateButtonStates();
            
            // 변경된 부분: 10000점 달성 시 게임 오버 처리
            if(score >= 10000 && !gameClear) {
                handleGameOver(); // 강제로 게임 오버 처리
            }
        }

        // 게임 오버 처리
        function handleGameOver() {
            if(gameOver) return;
            gameOver = true;
            
            isGameRunning = false;
            clearInterval(timerInterval);
            
            const popup = document.getElementById('gameOverPopup');
            popup.style.display = 'block';
            document.getElementById('popupScore').textContent = score;
            document.getElementById('popupTime').textContent = currentTime;
            document.getElementById('popupLevel').textContent = currentLevel.toUpperCase();
            
            // 변경된 부분: 게임 클리어 조건 분리 및 게임 오버 처리 통일
            if(score >= 10000) {
                gameClear = true;
                document.getElementById('popupTitle').textContent = 'CLEAR!!';
                popup.style.background = '#6b4f40';
                updateClearRecords(score, currentTime);
            } else {
                document.getElementById('popupTitle').textContent = 'GAME OVER';
                popup.style.background = '#8b6b4d';
                document.body.classList.add('game-over');
            }
            
            const records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            updateScoreboard(records[currentLevel] || []);
        }

        // 게임 리셋
        function resetGame() {
            gameOver = false; // 게임 오버 상태 리셋
            gameClear = false;
            document.getElementById('gameOverPopup').style.display = 'none';
            document.body.classList.remove('game-over');
            board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false));
            score = 0;
            
            // 시간 관련 변수 완전 초기화
            currentTime = 0;
            gameStartTime = Date.now();
            isGameRunning = false;
            document.querySelector('.time-display').textContent = `⏰ 0s`;
            
            // 기존 타이머 완전히 제거
            if(timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            
            redrawBoard();
            generateNewBlocks(true);
            updateScore();
        }

        // initGame 호출로 게임 시작
        initGame();

        // 최종 수정된 showEffect 함수
        function showEffect(options) {
            const effectDiv = document.createElement('div');
            effectDiv.className = 'score-effect';
            effectDiv.textContent = options.text;
            
            effectDiv.style.left = options.position?.x || '15%';
            effectDiv.style.top = options.position?.y || '20%';
            effectDiv.style.color = options.color || '#ff0000';
            effectDiv.style.fontSize = options.fontSize || '1.5em';
            effectDiv.style.fontWeight = 'bold';
            effectDiv.style.textShadow = `0 0 8px ${options.color ? `${options.color}80` : 'rgba(255,0,0,0.8)'}`;
            effectDiv.style.zIndex = '9999';
            effectDiv.style.position = 'fixed';
            
            // 아래로 떨어지는 애니메이션으로 변경
            effectDiv.style.animation = 'fallDownEffect 1s ease-out forwards';
            
            document.body.appendChild(effectDiv);
            setTimeout(() => effectDiv.remove(), 1000);
        }

        // 테스트용 함수
        function testCombo() {
            const testCases = [
                { lines: 1, combo: 1 },
                { lines: 1, combo: 2 },
                { lines: 1, combo: 3 },
                { lines: 1, combo: 4 }
            ];
            
            testCases.forEach((tc, i) => {
                setTimeout(() => {
                    showEffect({
                        combo: tc.combo,
                        cross: tc.lines,
                        score: 10 * tc.lines * tc.combo
                    });
                }, i * 1000);
            });
        }

        function testCross() {
            const testCases = [
                { lines: 2, combo: 1 },
                { lines: 3, combo: 1 },
                { lines: 2, combo: 2 },
                { lines: 3, combo: 3 }
            ];
            
            testCases.forEach((tc, i) => {
                setTimeout(() => {
                    showEffect({
                        combo: tc.combo,
                        cross: tc.lines,
                        score: 10 * tc.lines * tc.combo
                    });
                }, i * 1000);
        
            });
        }

        // 테스트 패널 토글 기능 추가
        let testClickCount = 0;
        const testPanelHTML = `
            <button onclick="setupComboTest()">콤보 테스트</button>
            <button onclick="setupCrossTest()">크로스 테스트</button>
            <button onclick="setupGameClearTest()">클리어 테스트</button>
            <button onclick="toggleAutoPlay()">자동플레이 ${isAutoPlaying ? '중지' : '시작'}</button>
            <button onclick="resetScoreboard()">기록 초기화</button> <!-- 이 줄 추가 -->
        `;
        document.getElementById('score').addEventListener('click', function() {
            testClickCount++;
            if (testClickCount >= 5) {
                const panel = document.querySelector('.test-panel');
                panel.innerHTML = testPanelHTML; // 새로운 버튼 구성
                panel.style.display = 'block';
                setTimeout(() => {
                    panel.style.display = 'none';
                    testClickCount = 0;
                }, 5000);
            }
        });

        // 자동 배치 함수
        function autoPlaceBlock() {
            const blocks = [...document.querySelectorAll('.block-wrapper')];
            
            // 블록이 없는 경우 새로 생성
            if(blocks.length === 0) {
                generateNewBlocks(true); // 강제 생성
                return true;
            }

            for(const block of blocks) {
                const pattern = JSON.parse(block.dataset.pattern);
                for(let y = -pattern.length+1; y < BOARD_SIZE; y++) {
                    for(let x = -pattern[0].length+1; x < BOARD_SIZE; x++) {
                        if(isValidPosition(y, x, pattern)) {
                            placeBlock(y, x, pattern);
                            block.remove();
                            
                            // 블록 소진 시 새로 생성
                            if(document.querySelectorAll('.block-wrapper').length === 0) {
                                generateNewBlocks(true);
                            }
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        // 자동플레이 토글 함수
        function toggleAutoPlay() {
            isAutoPlaying = !isAutoPlaying;
            const btn = document.querySelector('.test-panel button:nth-child(4)');
            btn.textContent = `자동플레이 ${isAutoPlaying ? '중지' : '시작'}`;
            btn.style.background = isAutoPlaying ? '#27ae60' : '#e74c3c';
            
            if(isAutoPlaying) {
                autoPlayInterval = setInterval(() => {
                    if(!autoPlaceBlock() || checkGameOver()) {
                        toggleAutoPlay(); // 자동 중지
                    }
                }, 1000); // 1초 간격
            } else {
                clearInterval(autoPlayInterval);
            }
        }

        // 힌트 패널 생성
        function createHintPanel() {
            const panel = document.querySelector('.hint-panel');
            if (panel) return; // 이미 존재하면 생성하지 않음
            
            const newPanel = document.createElement('div');
            newPanel.className = 'hint-panel';
            newPanel.innerHTML = `
                <button onclick="refreshBlocks()">🔄</button>
                <button onclick="rotateCurrentBlocks()">↻</button>
                <button onclick="showPossiblePlacement()">💡</button>
            `;
            document.body.appendChild(newPanel);
        }

        // 버튼 상태 업데이트 함수
        function updateButtonStates() {
            const buttons = document.querySelectorAll('.hint-panel button');
            buttons.forEach(btn => {
                const cost = getButtonCost(btn);
                btn.disabled = score < cost;
                btn.style.opacity = score < cost ? 0.5 : 1;
            });
        }

        // 버튼별 비용 확인 함수
        function getButtonCost(button) {
            if(button.textContent.includes('🔄')) return HINT_COSTS.refresh;
            if(button.textContent.includes('↻')) return HINT_COSTS.rotate;
            if(button.textContent.includes('💡')) return HINT_COSTS.placement;
            return 0;
        }

        // 수정된 refreshBlocks 함수
        function refreshBlocks() {
            if(score < HINT_COSTS.refresh) return;
            const cost = HINT_COSTS.refresh;
            score -= cost;
            updateScore();
            
            showEffect({
                text: `-${cost}`,
                type: 'deduction',
                color: '#ff0000',
                position: { x: '37%', y: '17%' }
            });
            
            generateNewBlocks(true);
            if(checkGameOver()) handleGameOver();
        }

        // 수정된 rotateCurrentBlocks 함수
        function rotateCurrentBlocks() {
            if(score < HINT_COSTS.rotate) return;
            const cost = HINT_COSTS.rotate;
            score -= cost;
            updateScore();
            
            showEffect({
                text: `-${cost}`,
                type: 'deduction',
                color: '#ff0000',
                position: { x: '37%', y: '17%' }
            });

            // 기존 회전 로직 유지
            document.querySelectorAll('.block-wrapper').forEach(block => {
                const pattern = JSON.parse(block.dataset.pattern);
                const rotated = rotatePattern(pattern);
                const blockGrid = block.querySelector('.block-grid');
                
                // 애니메이션 시작
                blockGrid.style.transition = 'transform 0.3s ease';
                blockGrid.style.transform = 'rotate(90deg)';
                
                setTimeout(() => {
                    // 실제 패턴 업데이트
                    blockGrid.style.transition = 'none';
                    blockGrid.style.transform = 'rotate(0deg)';
                    
                    // 그리드 내용 업데이트
                    blockGrid.innerHTML = ''; // 기존 내용 제거
                    rotated.forEach(row => {
                        const rowDiv = document.createElement('div');
                        rowDiv.style.display = 'contents'; // 레이아웃 유지
                        row.forEach(cell => {
                            const cellDiv = document.createElement('div');
                            cellDiv.className = cell === 1 ? 'block-cell' : '';
                            rowDiv.appendChild(cellDiv);
                        });
                        blockGrid.appendChild(rowDiv);
                    });
                    
                    // 데이터 업데이트
                    block.dataset.pattern = JSON.stringify(rotated);
                    blockGrid.style.gridTemplateColumns = `repeat(${rotated[0].length}, 36px)`;
                }, 300);
            });
            
            // 힌트 사용 후 게임 오버 확인
            if(checkGameOver()) handleGameOver();
            updateButtonStates();
        }

        // 수정된 showPossiblePlacement 함수
        function showPossiblePlacement() {
            if(score < HINT_COSTS.placement) return;
            const cost = HINT_COSTS.placement;
            score -= cost;
            updateScore();
            
            showEffect({
                text: `-${cost}`,
                type: 'deduction',
                color: '#ff0000',
                position: { x: '37%', y: '17%' }
            });

            let found = false;
            const blocks = document.querySelectorAll('.block-wrapper');
            
            // 모든 블록에 대해 배치 가능 위치 검사
            blocks.forEach(block => {
                const pattern = JSON.parse(block.dataset.pattern);
                for(let y = -pattern.length + 1; y < BOARD_SIZE; y++) {
                    for(let x = -pattern[0].length + 1; x < BOARD_SIZE; x++) {
                        if(isValidPosition(y, x, pattern)) {
                            highlightPossibleArea(y, x, pattern);
                            found = true;
                            return;
                        }
                    }
                }
            });

            if(!found) {
                showEffect({  // 배치 가능 위치 없을 때 Nope!! 효과
                    text: 'Nope!!',
                    color: '#ff4757',
                    duration: 1500
                });
            } else {
                setTimeout(clearHintPreview, 5000);
            }
            
            // 힌트 사용 후 게임 오버 확인
            if(checkGameOver()) handleGameOver();
            updateButtonStates();
        }

        // 수정된 highlightPossibleArea 함수
        function highlightPossibleArea(row, col, pattern) {
            clearHintPreview();
            pattern.forEach((r, i) => {
                r.forEach((c, j) => {
                    if(c === 1) {
                        const y = row + i;
                        const x = col + j;
                        if(y >= 0 && y < BOARD_SIZE && x >= 0 && x < BOARD_SIZE) {
                            const cell = boardCells[y][x];
                            cell.classList.add('hint-preview');
                            hintPreviewCells.push(cell);
                        }
                    }
                });
            });
        }

        // 새로운 힌트 초기화 함수
        function clearHintPreview() {
            hintPreviewCells.forEach(cell => {
                cell.classList.remove('hint-preview');
            });
            hintPreviewCells = [];
        }

        // 회전 함수 수정 (4방향 회전 지원)
        function rotatePattern(pattern, times=1) {
            for(let t=0; t<times; t++){
                const N = pattern.length;
                const M = pattern[0].length;
                const rotated = Array(M).fill().map(() => Array(N).fill(0));
                
                for (let i = 0; i < N; i++) {
                    for (let j = 0; j < M; j++) {
                        rotated[j][N-1-i] = pattern[i][j];
                    }
                }
                pattern = rotated;
            }
            return pattern;
        }

        // 추가할 clearLine 함수
        function clearLine(index, type) {
            // 보드 데이터 업데이트
            if (type === 'row') {
                board[index].fill(false);
            } else {
                for (let row = 0; row < BOARD_SIZE; row++) {
                    board[row][index] = false;
                }
            }

            // 애니메이션 처리
            const selector = type === 'row' 
                ? `[data-row="${index}"]` 
                : `[data-col="${index}"]`;
            
            document.querySelectorAll(selector).forEach(cell => {
                cell.classList.add('clearing');
                setTimeout(() => {
                    cell.classList.remove('filled', 'clearing');
                }, 800);
            });
        }

        // 시간 업데이트 함수
        function updateTimer() {
            if (!isGameRunning) return;
            const current = Math.floor((Date.now() - gameStartTime) / 1000);
            currentTime = current;
            document.querySelector('.time-display').textContent = `⏰ ${current}s`;
        }

        // 로컬스토리지 관련 함수 추가
        function updateClearRecords(score, time) {
            const records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            if(!records[currentLevel]) records[currentLevel] = [];
            
            const newRecord = {
                date: new Date().toLocaleString('ko-KR', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: false
                }).replace(/(\d+)\. (\d+)\. (\d+)\. (\d+):(\d+):(\d+)/, '$1-$2-$3 $4:$5:$6'),
                time: time,
                score: score,
                level: currentLevel
            };
            
            records[currentLevel].unshift(newRecord);
            records[currentLevel] = records[currentLevel].slice(0, 3);
            localStorage.setItem('blockPuzzleRecords', JSON.stringify(records));
            updateScoreboard(records[currentLevel]);
        }

        function updateScoreboard(records) {
            const scoreList = document.getElementById('scoreList');
            
            if (!Array.isArray(records)) {
                records = [];
            }
            
            scoreList.innerHTML = records.map((record, index) => `
                <div style="margin: 8px 0; font-size: 0.9em;">
                    <span style="color: #ffd54f; font-weight: bold;">${record.level?.toUpperCase() || 'N/A'}</span>
                    ${['🥇','🥈','🥉'][index]} 
                    <span style="color: #d2b48c;">${record.date}</span><br>
                    ⏱${record.time}s | 🎯${record.score}
                </div>
            `).join('');
            
            // 스코어보드 표시 조건 개선
            const hasRecords = records.length > 0;
            document.getElementById('scoreboard').style.display = hasRecords ? 'block' : 'none';
        }

        // 스코어보드 초기화 함수 수정
        function resetScoreboard(all = false) {
            let records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            
            if(all) {
                records = {};
            } else {
                delete records[currentLevel];
            }
            
            localStorage.setItem('blockPuzzleRecords', JSON.stringify(records));
            updateScoreboard(Array.isArray(records[currentLevel]) ? records[currentLevel] : []);
        }

        // 레벨 변경 시 스코어보드 업데이트
        function setDifficulty(level) {
            currentLevel = level;
            document.querySelectorAll('.difficulty-btn').forEach(btn => {
                btn.classList.remove('active');
                if(btn.dataset.level === level) {
                    btn.classList.add('active');
                }
            });
            resetGame(); // 게임 전체 리셋 호출 복구
            generateNewBlocks();
            
            // 스코어보드 업데이트
            const records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            updateScoreboard(records[level] || []);
        }

        // 페이지 로드 시 스코어보드 초기화
        window.addEventListener('load', () => {
            const records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            updateScoreboard(records[currentLevel] || []);
        });

        // 콤보 테스트 셋업 함수 (오른쪽 2열 + 아래쪽 2줄 비우기)
        function setupComboTest() {
            // 전체 보드 초기화
            board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false));
            document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('filled'));

            // 7x7 영역 채우기 (오른쪽 2열, 아래쪽 2줄 제외)
            for(let y = 0; y < BOARD_SIZE - 2; y++) {
                for(let x = 0; x < BOARD_SIZE - 2; x++) {
                    board[y][x] = true;
                    boardCells[y][x].classList.add('filled');
                }
            }
        }

        // 크로스 테스트 셋업 함수 (우측 상단 6칸 비우기 + 오른쪽/아래쪽 채우기)
        function setupCrossTest() {
            // 전체 보드 초기화
            board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false));
            document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('filled'));

            // 1. 맨 위 가로 두 줄 채우기 (0-1행 전체)
            for(let y = 0; y < 2; y++) {
                for(let x = 0; x < BOARD_SIZE; x++) {
                    board[y][x] = true;
                    boardCells[y][x].classList.add('filled');
                }
            }

            // 2. 오른쪽 세로 두 줄 채우기 (7-8열 전체)
            for(let y = 0; y < BOARD_SIZE; y++) {
                for(let x = BOARD_SIZE - 2; x < BOARD_SIZE; x++) {
                    board[y][x] = true;
                    boardCells[y][x].classList.add('filled');
                }
            }

            // 3. 오른쪽 맨 위 네 칸 비우기 (0-1행, 7-8열)
            for(let y = 0; y < 2; y++) {
                for(let x = BOARD_SIZE - 2; x < BOARD_SIZE; x++) {
                    board[y][x] = false; // 1,2단계에서 채운 부분 덮어씀
                    boardCells[y][x].classList.remove('filled');
                }
            }
        }

        // 게임 클리어 테스트 셋업 함수 수정
        function setupGameClearTest() {
            score = 10000; // 최소 클리어 점수 설정
            updateScore();
            handleGameOver(); // 강제로 게임 오버 처리
        }

        // 자동 데모 관련 변수
        let isAutoDemoRunning = false;

        function startAutoDemo() {
            if(isAutoDemoRunning) return;
            
            const demoBtn = document.querySelector('.auto-demo-btn');
            demoBtn.disabled = true;
            demoBtn.classList.add('demo-active');
            
            isAutoDemoRunning = true;
            if(!isAutoPlaying) toggleAutoPlay();
            
            // 10초 후 자동 종료
            setTimeout(() => {
                if(isAutoPlaying) toggleAutoPlay();
                demoBtn.classList.remove('demo-active');
                demoBtn.disabled = false;
                isAutoDemoRunning = false;
            }, 10000);
        }

        // 보드 다시 그리기 함수 추가
        function redrawBoard() {
            board.forEach((row, y) => {
                row.forEach((filled, x) => {
                    boardCells[y][x].classList.toggle('filled', filled);
                });
            });
        }

        // 테스트 패널 이벤트 리스너 수정
        document.querySelector('.test-panel').addEventListener('click', function(e) {
            if(e.target.textContent === '기록 초기화') {
                if(confirm('모든 기록을 초기화할까요?')) {
                    resetScoreboard(true);
                }
            }
        });

        // resetScoreboard 함수 수정 (전체 삭제 옵션 제거)
        function resetScoreboard() {
            const records = JSON.parse(localStorage.getItem('blockPuzzleRecords') || '{}');
            delete records[currentLevel];
            localStorage.setItem('blockPuzzleRecords', JSON.stringify(records));
            updateScoreboard(records[currentLevel] || []);
        }