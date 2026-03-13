module.exports = {
  apps: [
    {
      name: 'halo-server',
      script: './dist/server/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        HALO_DATA_DIR: '/data/halo',
        HALO_PORT: '3000',
        HALO_HOST: '0.0.0.0'
      },
      env_development: {
        NODE_ENV: 'development',
        HALO_DATA_DIR: '~/.halo-dev',
        HALO_PORT: '3000',
        HALO_HOST: '127.0.0.1'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true
    }
  ]
}
