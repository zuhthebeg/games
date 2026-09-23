# JokerRun Laya Strategy Evaluation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Measure whether Laya makes stable, rule-aware combat choices using JokerRun order, levels and resources; no gameplay changes.

**Architecture:** Export bounded read-only state fixtures from actual game concepts into `jokerrun/eval/`. Build a Python Laya evaluation runner that permutes candidate order and changes one causal variable at a time. Report raw choices and latency, never mistake simple estimates for exact battle score.

**Tech Stack:** Node.js built-in test, Python 3.12 `laya` in Windows GPU venv, vanilla JokerRun JS as read-only source.

---

### Task 1: Battle-state snapshot fixtures

**Files:** `jokerrun/eval/state.cjs`, `jokerrun/eval/state.test.cjs`.

1. Write failing test for a snapshot with ordered `hand`, ordered `jokers` including edition/counter, `handLevels`, `handsLeft`, `discardsLeft`, `deckComposition`, `bossModifier`, `score`, `target`; assert input remains unchanged.
2. Run `node --test jokerrun/eval/state.test.cjs`, expect failure.
3. Implement whitelisted, bounded serializer and counterfactual modifiers for joker order, hand card order, and one hand level. No index.html edits.
4. Re-run test, `git diff --check`; commit only eval files.

### Task 2: Laya choice harness

**Files:** `jokerrun/eval/laya-strategy.py`, `jokerrun/eval/fixtures.json`, `jokerrun/eval/laya-strategy.test.cjs`.

1. Add tests for valid candidate IDs, candidate list permutation, fixture immutability, and stable output record schema.
2. Implement batch local-GPU inference via `Router.predict(state, questions, model=...)` using 2-4 explicitly legal strategy choices per fixture and their reversed order. Set checkpoint explicitly and record prompt, choice, runtime, model; no API tokens, external requests or game writes.
3. Test counterfactual pairs with joker swap / card swap / level change. Label ground truth only when rule cause is unambiguous. Run `node --test jokerrun/eval/*.test.cjs`; commit.

### Task 3: Quality report

**Files:** `jokerrun/eval/report.md`.

1. Run evaluation on Windows native GPU venv and save only public fixture/choice results; no private credentials or runtime logs.
2. Compare baseline and reversed candidate order, check rule violations and order/level sensitivity; distinguish feasibility from validated quality.
3. Report pass/fail; do not edit UI, restart server, or deploy. `git diff --check` and commit report.
