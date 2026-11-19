# Build Expo Web (output: dist/) rồi phục vụ SPA bằng Nginx.
FROM node:22.13.1-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

ARG EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} \
    EXPO_NO_DOTENV=1 \
    EXPO_PUBLIC_ENABLE_DIAGNOSTICS=0
RUN npm run build:web

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
