# --- Stage 1: Base (Used for Dev) ---
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# In dev, we stop here. We don't run 'build'.

# --- Stage 2: Builder (Used for Prod) ---
FROM base AS builder
# This runs the build command which was failing
RUN npm run build

# --- Stage 3: Production Server (Nginx) ---
FROM nginx:alpine
# Copy the build output from Stage 2
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]