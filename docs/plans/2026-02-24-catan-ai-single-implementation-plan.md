# Catan Rule-based AI Single Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 카탄 싱글 모드에서 AI 2명이 전략적으로 턴을 수행하도록 구현한다.

**Architecture:** 기존 `index.html` 룰 엔진은 유지하고, AI 판단만 `ai.js` 모듈로 분리한다. 브라우저에서는 `window.CatanAI`로 사용하고, Node 테스트에서 같은 로직을 검증한다.

**Tech Stack:** Vanilla JS, node:test

---

### Task 1: AI 모듈 스캐폴드

**Files:**
- Create: `catan/ai.js`

**Step 1: Write the failing test**
- `pickBestVertex` 기대값 테스트 작성

**Step 2: Run test to verify it fails**
- Run: `node --test catan/ai.test.cjs`

**Step 3: Write minimal implementation**
- 점수 함수 + 정점 선택 함수 구현

**Step 4: Run test to verify it passes**
- 동일 명령으로 통과 확인

**Step 5: Commit**
- AI 모듈 추가 커밋

### Task 2: 강도/도로/빌드 우선순위 구현

**Files:**
- Modify: `catan/ai.js`
- Modify: `catan/ai.test.cjs`

**Step 1: Write failing tests**
- 강도 타겟 선택
- setup 도로 선택
- city > settlement > road 우선순위

**Step 2: Run test to verify it fails**
- `node --test catan/ai.test.cjs`

**Step 3: Write minimal implementation**
- `pickRobberTarget`, `pickBestRoadFromVertex`, `chooseBuildAction`

**Step 4: Run test to verify it passes**
- `node --test catan/ai.test.cjs`

**Step 5: Commit**
- AI 의사결정 강화 커밋

### Task 3: 게임 본체 연결

**Files:**
- Modify: `catan/index.html`

**Step 1: Write failing behavior check**
- 기존 랜덤 AI 동작으로 판단 일관성 부족 확인

**Step 2: Implement minimal integration**
- `ai.js` 로드
- `aiTakeSetupTurn`, `aiMainTurn`에서 CatanAI 호출
- 싱글 인원 구성 `나 + AI2`로 조정

**Step 3: Verify behavior**
- 브라우저에서 싱글 시작
- AI가 setup/메인턴/강도 처리 수행

**Step 4: Commit**
- index 통합 커밋

### Task 4: 문서 및 회귀 확인

**Files:**
- Create: `docs/plans/2026-02-24-catan-ai-single-design.md`
- Create: `docs/plans/2026-02-24-catan-ai-single-implementation-plan.md`

**Step 1: Run tests**
- `node --test catan/ai.test.cjs`

**Step 2: Quick manual smoke**
- 싱글플레이 1판 진행 (AI 턴 멈춤/오류 확인)

**Step 3: Commit**
- 문서 + 테스트 결과 반영
