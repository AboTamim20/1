// موجّه CRUD عام للجداول البسيطة: يكفي تمرير اسم الجدول والحقول المسموحة والمطلوبة
const express = require('express');
const { getDb } = require('../db');
const { HttpError } = require('../middleware/errors');

function pick(body, fields) {
  return Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
}

function crudRouter({ table, fields, required = [], filters = [], orderBy = 'id DESC' }) {
  const router = express.Router();

  const findOrFail = (id) => {
    const row = getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new HttpError(404, 'السجل غير موجود');
    return row;
  };

  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    for (const f of filters) {
      if (req.query[f] !== undefined) {
        where.push(`${f} = ?`);
        params.push(req.query[f]);
      }
    }
    const sql = `SELECT * FROM ${table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`;
    res.json(getDb().prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => res.json(findOrFail(req.params.id)));

  router.post('/', (req, res) => {
    const data = pick(req.body, fields);
    const missing = required.filter((f) => data[f] === undefined || data[f] === '');
    if (missing.length) throw new HttpError(400, `حقول مطلوبة: ${missing.join(', ')}`);
    const cols = Object.keys(data);
    const info = getDb()
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...Object.values(data));
    res.status(201).json(findOrFail(info.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    findOrFail(req.params.id);
    const data = pick(req.body, fields);
    const cols = Object.keys(data);
    if (cols.length) {
      getDb()
        .prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...Object.values(data), req.params.id);
    }
    res.json(findOrFail(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    findOrFail(req.params.id);
    getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { crudRouter, pick };
