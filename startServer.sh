#!/bin/bash

echo "==================================================="
echo " HIPAA-Compliant Chat Server"
echo "==================================================="
echo
echo " Starting server on default port 3000..."
echo " Once started, you can access the status page at:"
echo " http://localhost:3000"
echo
echo " To stop the server, press Ctrl+C"
echo "==================================================="
echo

# Check if executable version exists and run it
if [ -f "./hipaa-chat-server" ]; then
  echo "Found standalone executable. Running..."
  chmod +x ./hipaa-chat-server
  ./hipaa-chat-server
else
  # Check if node is installed
  if command -v node &> /dev/null; then
    echo "Found Node.js. Running with Node..."
    node chatServer.js
  else
    echo "ERROR: Neither standalone executable nor Node.js found."
    echo "Please install Node.js or download the executable version."
    echo
    read -p "Press Enter to exit..."
    exit 1
  fi
fi

# If the server exits, pause to see any errors
read -p "Server has stopped. Press Enter to exit..."