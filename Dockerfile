FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# --- PRODUCTION BUILD STEP ---
# This compiles React into static files in the /dist folder
RUN npm run build

# Expose the production port
EXPOSE 2100

# Set environment to production (Tells server.js to serve /dist)
ENV NODE_ENV=production

# Default Command: Run the Node.js backend
# (Your compose.dev.yaml overrides this for local development)
CMD ["node", "server.js"]