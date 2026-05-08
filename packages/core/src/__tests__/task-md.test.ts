import { describe, it, expect } from 'vitest';
import { parseTaskMd } from '../parsers/task-md';

describe('parseTaskMd', () => {
  it('should parse a valid task markdown file', () => {
    const content = `---
id: task-1
title: Valid Task
role: developer
type: feature
priority: high
status: todo
---
# The Body
This is the content.`;

    const result = parseTaskMd(content, 'test.md');

    expect(result.frontmatter).toMatchObject({
      id: 'task-1',
      title: 'Valid Task',
      role: 'developer',
    });
    expect(result.body.trim()).toBe('# The Body\nThis is the content.');
  });

  it('should throw for missing required fields', () => {
    const content = `---
title: Missing ID
---
Body content.`;

    expect(() => parseTaskMd(content, 'test.md')).toThrow();
  });

  it('should throw for invalid field values', () => {
    const content = `---
id: task-1
title: Invalid Role
role: 123
---
Body content.`;

    expect(() => parseTaskMd(content, 'test.md')).toThrow();
  });
});
