#!/bin/bash

# Check if setup.sh exists and execute it
if [ -f "/app/config/setup.sh" ]; then
  echo "Found setup.sh, executing..."
  chmod +x /app/config/setup.sh
  . /app/config/setup.sh
else
  echo "No setup script."
fi

# Start the server
exec node dist/server/index.js
