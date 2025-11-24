FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

# Install dependencies (including express/multer)
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build the React Frontend (creates /dist folder)
RUN npm run build

# Expose port
EXPOSE 2100

# Start the custom server
CMD ["node", "server.js"]