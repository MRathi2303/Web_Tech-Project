#!/bin/sh
set -e
# Generate config.js from environment variables (used by Vercel/build pipelines).
# Provide GCAL_CLIENT_ID and GCAL_API_KEY as environment variables in Vercel.
cat > config.js <<'EOF'
window.TASKFLOW_CONFIG = {
  GCAL_CLIENT_ID: "${GCAL_CLIENT_ID:-YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com}",
  GCAL_API_KEY: "${GCAL_API_KEY:-YOUR_GOOGLE_API_KEY}",
  GCAL_SCOPES: "https://www.googleapis.com/auth/calendar"
};
EOF
