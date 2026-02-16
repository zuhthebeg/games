#!/bin/bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

cd /mnt/c/Users/user/games

codex --full-auto --model o3 "조커런(jokerrun/index.html) 라운드 시스템 전면 수정 작업:

## 현재 문제점
1. 첫 라운드(스몰 블라인드) 목표 300점 달성해도 다음 단계로 안 넘어감
2. 라운드 진행 플로우가 명확하지 않음
3. 승리/패배 조건 체크 타이밍 이슈

## 분석해야 할 부분
1. canContinue() 함수 - 언제 호출되는지, 조건 체크 정확한지
2. playSelected() 에서 점수 추가 후 canContinue() 호출 순서
3. activeTarget() 함수 - 모드별 목표값 반환 정확한지
4. winRound() → openShop() → nextRoundBtn → startRound(index+1) 플로우

## 수정 요청사항
1. **디버깅 먼저**: console.log 추가해서 실제 점수/목표값/모드 확인
2. **라운드 진행 조건**: state.score >= activeTarget() 체크가 정확히 동작하도록
3. **상점 스킵 옵션**: 테스트용으로 상점 없이 바로 다음 라운드 가는 버튼 추가
4. **HUD 명확화**: 현재 라운드, 목표 점수, 달성률(%) 표시
5. **자동 진행**: 목표 달성 시 1초 후 자동으로 상점/다음 단계 전환 (선택)

## 라운드 구조 확인
- Round 1: 스몰 블라인드 300점
- Round 2: 빅 블라인드 700점  
- Round 3: 보스 블라인드 1500점
- 각 라운드 클리어 시 보상 + 상점 + 다음 라운드

## 테스트 시나리오
1. 싱글 모드 시작 → 첫 핸드로 300점 이상 달성 → 승리 확인
2. 핸드 4번 다 써도 300점 미달 → 게임오버 확인
3. 3라운드 모두 클리어 → 런 클리어 확인

## 코드 품질
- 중복 startRound(0) 호출 정리
- state 초기화 순서 명확히
- 모드 전환 시 상태 완전 리셋

완료 후 git add, commit, push 해줘. 커밋 메시지: 'fix: jokerrun round system - proper progression and win condition'"
