import { describe, expect, it } from 'vitest';
import { parsePhasePlan } from '../parsePhasePlan.js';

const SAMPLE = `# arandano Phase 2 — Example Plan

**Goal:** A example.

**Architecture:** A test.

**Tech Stack:** TS.

---

## Task 1: First task

**Files:**

- Create: \`a.ts\`

- [x] **Step 1: Do thing**

\`\`\`ts
const x = 1;
\`\`\`

- [ ] **Step 2: Do other thing**

---

## Task 2: Second task (TDD)

**Files:**

- Create: \`b.ts\`

- [ ] **Step 1: Write test**

---

## Phase done — exit criteria

- [ ] Everything works
`;

describe('parsePhasePlan', () => {
  it('extracts the preamble (everything before the first Task heading)', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.preamble).toContain('# arandano Phase 2');
    expect(r.preamble).toContain('**Goal:**');
    expect(r.preamble).not.toContain('## Task 1');
  });

  it('extracts each task with number, title, and body', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks[0]?.number).toBe(1);
    expect(r.tasks[0]?.title).toBe('First task');
    expect(r.tasks[0]?.body).toContain('Step 1: Do thing');
    expect(r.tasks[1]?.number).toBe(2);
    expect(r.tasks[1]?.title).toBe('Second task (TDD)');
  });

  it('captures the exit-criteria block separately', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.exitCriteria).toContain('Everything works');
  });

  it('preserves [x] state inside task bodies', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.tasks[0]?.body).toContain('- [x] **Step 1');
    expect(r.tasks[0]?.body).toContain('- [ ] **Step 2');
  });

  it('handles a plan with a Task 0', () => {
    const r = parsePhasePlan(
      '# x\n\nGoal\n\n---\n\n## Task 0: Setup\n\n- [ ] step\n\n---\n\n## Task 1: Real\n\n- [ ] step\n',
    );
    expect(r.tasks.map((t) => t.number)).toEqual([0, 1]);
  });
});
