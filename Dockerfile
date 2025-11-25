# Dockerfile

FROM node:20-alpine

# --- 1. USER SETUP ---
# Create a dedicated non-root user and group
ARG USER_NAME=appuser
ARG USER_UID=21210

# FIX: Add this line to explicitly create the group first
RUN addgroup -g ${USER_UID} ${USER_NAME}

# Original line 9, now runs correctly as the group exists
RUN adduser -u ${USER_UID} -D -G ${USER_NAME} ${USER_NAME}

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Delete the lockfile to force npm to download the correct Linux binaries
RUN rm -f package-lock.json

# Install dependencies (legacy-peer-deps handles the React 19 conflict)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# --- 2. PERMISSIONS FIX ---
# Change ownership of the app directory to the new non-root user
# This allows the 'appuser' to read the node_modules and built files at runtime
RUN chown -R ${USER_NAME}:${USER_NAME} /app

# Fix permissions on the persistent data volume location to ensure writes work
# The 'data' folder is mounted from the host, so we ensure the non-root user can write to it.
RUN mkdir -p /data/uploads /data/notes && chown -R ${USER_NAME}:${USER_NAME} /data

# Fix: Explicitly set CI=false so warnings don't get treated as errors
ENV CI=false

# --- PRODUCTION BUILD STEP ---
# This compiles React into static files in the /dist folder
RUN npm run build

# --- 3. SWITCH USER FOR RUNTIME ---
# Switch to the non-root user for the final command
USER ${USER_NAME}

# Expose the production port
EXPOSE 2100

# Set environment to production (Tells server.js to serve /dist)
ENV NODE_ENV=production

# Default Command: Run the Node.js backend
CMD ["node", "server.js"]