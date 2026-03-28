import fetch from 'node-fetch'

async function testLogin() {
  try {
    const response = await fetch('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin',
        password: 'Clqc@1234'
      })
    })
    
    const data = await response.json()
    console.log('Login response:', data)
    
  } catch (error) {
    console.error('Error:', error)
  }
}

testLogin()
