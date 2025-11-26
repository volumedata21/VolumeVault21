# Dockerfile

FROM node:20-alpine

WORKDIR /app

# --- 1. Dependencies and Configuration Copy ---
COPY package.json package-lock.json* ./
COPY postcss.config.cjs ./ 

# Delete the lockfile
RUN rm -f package-lock.json

# Install dependencies (This step includes installing tailwindcss into node_modules)
RUN npm install --legacy-peer-deps

# --- 2. Source Code Copy and Build ---
COPY . . 

ENV CI=false

# --- PRODUCTION BUILD STEP ---
# CRITICAL FIX: Set NODE_PATH to explicitly point to node_modules ONLY for the build command.
# This ensures PostCSS and Vite can find 'tailwindcss' within the container's environment.
RUN NODE_PATH=/app/node_modules npm run build

# Expose the production port
EXPOSE 2100

# Set environment to production
ENV NODE_ENV=production

# Default Command: Run the Node.js backend
CMD ["node", "server.js"]