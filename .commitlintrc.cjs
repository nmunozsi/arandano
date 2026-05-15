'use strict';

const base = require('./packages/templates/commitlint-rules');

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'gitmoji-leading': [1, 'always'], // warn during T5–T7; flipped to 2 (error) in T8
    'gitmoji-type-match': [1, 'always'],
  },
};
