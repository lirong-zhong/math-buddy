import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const db = readFileSync('db.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
const css = readFileSync('style.css', 'utf8');

assert.match(db, /async function getQuestionSources\(\)/);
assert.match(db, /async function getQuestionsBySource\(sourceId\)/);
assert.match(db, /from\('question_bank_sources'\)/);
assert.match(db, /from\('questions'\)/);
assert.match(db, /getQuestionSources,/);
assert.match(db, /getQuestionsBySource,/);

assert.match(app, /async function startWithQuestionSource\(sourceId, title\)/);
assert.match(app, /function normalizeQuestion\(q\)/);
assert.match(app, /function renderQuestionAssets\(assets = \[\]\)/);
assert.match(app, /DB\.getQuestionsBySource\(sourceId\)/);
assert.match(app, /App\.startWithQuestionSource/);

assert.match(index, /id="questionAssets"/);
assert.match(css, /\.question-assets/);
assert.match(css, /\.question-asset-img/);
