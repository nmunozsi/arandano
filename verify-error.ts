import { parseTaskMd } from './packages/core/src/parsers/task-md.js';

const content = `---
id: 
role: developer
tdd: maybe
---
Body`;

try {
  parseTaskMd(content, 'error-test.md');
} catch (e) {
  console.log(e.message);
}
