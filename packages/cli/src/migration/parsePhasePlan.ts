export interface ParsedTask {
  number: number;
  title: string;
  body: string;
}

export interface ParsedPhasePlan {
  preamble: string;
  tasks: ParsedTask[];
  exitCriteria: string | null;
}

const TASK_HEADING = /^#{2,3} Task (\d+):\s*(.+?)$/m;

export function parsePhasePlan(text: string): ParsedPhasePlan {
  const lines = text.split('\n');
  const headings: Array<
    { kind: 'task'; line: number; number: number; title: string } | { kind: 'exit'; line: number }
  > = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = TASK_HEADING.exec(line);
    if (m) {
      headings.push({
        kind: 'task',
        line: i,
        number: Number(m[1]),
        title: m[2]!.trim(),
      });
    } else if (/^## Phase (?:\d+ )?done/i.test(line) || /^## Exit criteria/i.test(line)) {
      headings.push({ kind: 'exit', line: i });
    }
  }

  const firstIdx = headings[0]?.line ?? lines.length;
  const preamble = lines.slice(0, firstIdx).join('\n').trimEnd();

  const tasks: ParsedTask[] = [];
  let exitCriteria: string | null = null;
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    const next = headings[i + 1];
    const end = next ? next.line : lines.length;
    const body = lines.slice(h.line, end).join('\n').trimEnd();
    if (h.kind === 'task') {
      tasks.push({ number: h.number, title: h.title, body });
    } else {
      exitCriteria = body;
    }
  }

  return { preamble, tasks, exitCriteria };
}
