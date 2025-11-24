FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (legacy-peer-deps handles the React 19 conflict)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Fix: Explicitly set CI=false so warnings don't get treated as errors
ENV CI=false

# --- PRODUCTION BUILD STEP ---
# This compiles React into static files in the /dist folder
RUN npm run build

# Expose the production port
EXPOSE 2100

# Set environment to production (Tells server.js to serve /dist)
ENV NODE_ENV=production

# Default Command: Run the Node.js backend
CMD ["node", "server.js"]