import { describe, it, expect } from 'vitest';
import { classeDoControle } from '../src/classe-controle.js';
import { classeDoControle as doServidor } from '../../src/services/classe-controle.ts';

const STATUS = ['Implemented', 'IMPLEMENTED', 'Compliant', 'Approved', 'Completed', 'Conforme', 'Partial', 'PARTIAL', 'In Progress', 'Planned', 'Missing', 'Not Started', 'NOT_STARTED', 'Not Applicable', '', null, undefined];

describe('a tela classifica o controle como o servidor', () => {
  it.each(STATUS)('%s', (s) => expect(classeDoControle(s)).toBe(doServidor(s)));
});
