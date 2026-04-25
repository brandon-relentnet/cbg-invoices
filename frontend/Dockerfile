FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ---- Dev target ----
FROM base AS dev
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# ---- Build ----
FROM base AS builder

# VITE_* values must be present at build time — Vite bakes them into
# the JS bundle. Coolify passes these via the `args:` section in
# docker-compose.prod.yml so they appear here, then we re-export as ENV
# so Vite sees them when `pnpm build` runs.
ARG VITE_API_BASE_URL
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ARG VITE_LOGTO_RESOURCE
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_LOGTO_ENDPOINT=${VITE_LOGTO_ENDPOINT}
ENV VITE_LOGTO_APP_ID=${VITE_LOGTO_APP_ID}
ENV VITE_LOGTO_RESOURCE=${VITE_LOGTO_RESOURCE}

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm build

# ---- Prod target ----
FROM nginx:alpine AS prod
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
