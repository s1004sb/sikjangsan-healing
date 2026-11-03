// 저장소 — 환경 변수 DATABASE_URL이 있으면 PostgreSQL(Neon 등)에, 없으면 data/ 폴더의 JSON 파일에 저장합니다.
// 어느 쪽이든 서버가 켜질 때 전부 메모리로 읽어 두고, 바뀔 때마다 저장소에 바로 씁니다.
const fs = require('fs');
const path = require('path');

let pool = null;
let dataDir = '';

async function init(dir) {
  dataDir = dir;
  if (!process.env.DATABASE_URL) return 'file';
  const { Pool } = require('pg'); // 데이터베이스를 쓸 때만 필요
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX) || 3 });
  await pool.query(`CREATE TABLE IF NOT EXISTS items (
    id   TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    at   BIGINT NOT NULL,
    data JSONB NOT NULL
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS items_kind_at ON items (kind, at)');
  return 'database';
}

const logError = (kind, what) => (e) => console.error(`${kind} ${what} 실패:`, e.message);

// kind별 목록(오래된 것부터). 최근 maxKeep개만 보관
async function createStore(kind, maxKeep) {
  let items = [];
  const file = path.join(dataDir, kind + '.json');

  if (pool) {
    const { rows } = await pool.query('SELECT data FROM items WHERE kind = $1 ORDER BY at', [kind]);
    items = rows.map((r) => r.data);
  } else {
    try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { items = []; }
  }

  function saveFile() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
      fs.renameSync(tmp, file);
    } catch (e) { console.error(`${kind} 저장 실패:`, e.message); }
  }

  return {
    all: () => items,
    find: (id) => items.find((it) => it.id === id),
    add(item) {
      items.push(item);
      const dropped = items.length > maxKeep ? items.splice(0, items.length - maxKeep) : [];
      if (!pool) return saveFile();
      pool.query('INSERT INTO items (id, kind, at, data) VALUES ($1, $2, $3, $4)', [item.id, kind, item.at, item])
        .catch(logError(kind, '저장'));
      if (dropped.length) pool.query('DELETE FROM items WHERE id = ANY($1)', [dropped.map((d) => d.id)]).catch(logError(kind, '정리'));
    },
    update(id, patch) {
      const item = items.find((it) => it.id === id);
      if (!item) return null;
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete item[k]; else item[k] = v; }
      if (!pool) saveFile();
      else pool.query('UPDATE items SET data = $2 WHERE id = $1', [id, item]).catch(logError(kind, '수정'));
      return item;
    },
    remove(id) {
      const before = items.length;
      items = items.filter((it) => it.id !== id);
      if (items.length === before) return false;
      if (!pool) saveFile();
      else pool.query('DELETE FROM items WHERE id = $1', [id]).catch(logError(kind, '삭제'));
      return true;
    },
  };
}

module.exports = { init, createStore };
