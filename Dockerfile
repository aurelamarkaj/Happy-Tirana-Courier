FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL} \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}

COPY package.json package-lock.json ./
COPY apps/admin-portal/package.json apps/admin-portal/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/business-portal/package.json apps/business-portal/package.json
COPY apps/rider-app/package.json apps/rider-app/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm ci --include=dev

COPY . .

RUN npm run typecheck \
 && NEXT_PUBLIC_BASE_PATH=/admin npm run build -w @happy-tirana/admin-portal \
 && NEXT_PUBLIC_BASE_PATH=/business npm run build -w @happy-tirana/business-portal \
 && NEXT_PUBLIC_BASE_PATH=/rider npm run build -w @happy-tirana/rider-app

EXPOSE 3000 3001 3002 4000
