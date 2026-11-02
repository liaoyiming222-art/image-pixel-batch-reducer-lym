const path = require('node:path');
const { createRequire } = require('node:module');
const roots = [process.env.PORTFOLIO_NODE_MODULES, path.resolve('node_modules')].filter(Boolean);
exports.load = name => { for (const root of roots) { try { return createRequire(path.join(root, '_loader.cjs'))(name); } catch {} } throw new Error(`Install ${name} or set PORTFOLIO_NODE_MODULES`); };
