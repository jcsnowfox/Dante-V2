import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildEngineeringReport } = require('../src/engineeringIntelligence.js');
console.log(JSON.stringify(buildEngineeringReport(), null, 2));
