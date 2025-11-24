# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy the definition files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including marked/turndown) in one go
# This is cleaner and caches better
RUN npm install --legacy-peer-deps

# Copy the app source
COPY . .

EXPOSE 2100

CMD ["npm", "run", "dev", "--", "--host"]