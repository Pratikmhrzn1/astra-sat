# ── build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# VITE_API_URL is set via frontend/.env.production (VITE_API_URL=/sat) for the
# shared domain deployment at mocktest.niec.edu.np/sat/. That file is picked
# up automatically by Vite during this build step.
RUN npm run build

# ── production stage ───────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
