import Database from 'better-sqlite3'

// 连接数据库
const db = new Database('./data/halo.db')

try {
  // 查询用户信息
  const users = db.prepare('SELECT id, email, username, is_default, created_at FROM users').all()
  console.log('Users in database:')
  users.forEach(user => {
    console.log(`ID: ${user.id}`)
    console.log(`Email: ${user.email}`)
    console.log(`Username: ${user.username}`)
    console.log(`Is Default: ${user.is_default}`)
    console.log(`Created At: ${new Date(user.created_at * 1000).toString()}`)
    console.log('---')
  })
  
  // 查询登录尝试
  const attempts = db.prepare('SELECT * FROM login_attempts ORDER BY attempt_time DESC LIMIT 10').all()
  if (attempts.length > 0) {
    console.log('\nRecent login attempts:')
    attempts.forEach(attempt => {
      console.log(`Username: ${attempt.username}`)
      console.log(`Time: ${new Date(attempt.attempt_time).toString()}`)
      console.log('---')
    })
  }
  
} catch (error) {
  console.error('Error querying database:', error)
} finally {
  db.close()
}
