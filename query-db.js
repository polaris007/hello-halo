
const Database = require('better-sqlite3');
const db = Database('data/halo.db');

console.log('=== DATABASE TABLES ===');
const tables = db.prepare('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name').all();
console.log(tables.map(t => t.name).join(', '));

console.log('\n=== TABLE RECORD COUNTS ===');
const tableNames = ['users', 'sessions', 'spaces', 'conversations', 'configs', 'login_attempts', 'apps', 'app_activities', 'notification_channels', 'activity_logs'];
tableNames.forEach(table =&gt; {
  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM ' + table).get().cnt;
    console.log(`${table.padEnd(25)}: ${count} records`);
  } catch(e) {
    console.log(`${table.padEnd(25)}: ${e.message}`);
  }
});

console.log('\n=== SAMPLE DATA ===');
console.log('\n-- Users:');
try {
  const users = db.prepare('SELECT id, email, username, name, role, is_default, last_login_at, created_at FROM users LIMIT 5').all();
  console.table(users);
} catch(e) {
  console.log('Error:', e.message);
}

console.log('\n-- Spaces:');
try {
  const spaces = db.prepare('SELECT id, user_id, name, path, working_dir, created_at FROM spaces LIMIT 5').all();
  console.table(spaces);
} catch(e) {
  console.log('Error:', e.message);
}

console.log('\n-- Conversations:');
try {
  const convos = db.prepare('SELECT id, user_id, space_id, title, starred, created_at, updated_at FROM conversations LIMIT 5').all();
  console.table(convos);
} catch(e) {
  console.log('Error:', e.message);
}

console.log('\n-- Apps:');
try {
  const apps = db.prepare('SELECT id, user_id, space_id, name, type, status, last_run_at, created_at FROM apps LIMIT 5').all();
  console.table(apps);
} catch(e) {
  console.log('Error:', e.message);
}

db.close();
