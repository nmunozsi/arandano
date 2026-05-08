import { it, expect } from 'vitest';
import { parseTaskMd } from '../parsers/task-md';

it('should have readable error messages', () => {
  const content = `---
id: ''
role: developer
tdd: maybe
---
Body`;

  try {
    parseTaskMd(content, 'error-test.md');
  } catch (e: unknown) {
    if (e instanceof Error) {
      expect(e.message).toContain('id: String must contain at least 1 character(s)');
      expect(e.message).toContain('title: Required');
      expect(e.message).toContain(
        "tdd: Invalid enum value. Expected 'strict' | 'relaxed', received 'maybe'",
      );
      console.log('Error message:', e.message);
    } else {
      throw e;
    }
  }
});
