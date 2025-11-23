# 1. Use Node alpine as base
FROM node:18-alpine

# 2. Set working directory
WORKDIR /app

# 3. Copy package files first (optimizes cache)
# We assume you have a package.json. If not, the previous
# setup command `npm init -y` generated one locally for you.
COPY package*.json ./

# 4. Install dependencies
# 'npm ci' is faster/cleaner for production, but 'npm install' is safer if lockfile is missing
RUN npm install

# 5. Copy the rest of the application code
COPY . .

# 6. Expose the port
EXPOSE 2100

# 7. Start the server
CMD ["node", "server.js"]