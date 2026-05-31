# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM node:20-alpine AS build
WORKDIR /app
ARG KORNIX_SESSION_MODE=bff
ARG KORNIX_API_BASE_URL=
ARG KORNIX_ENABLE_MOCK_API=false
COPY package*.json ./
RUN npm ci
COPY . .
RUN VITE_AUTH_MODE=${KORNIX_SESSION_MODE} \
    VITE_API_BASE_URL=${KORNIX_API_BASE_URL} \
    VITE_ENABLE_MOCK_API=${KORNIX_ENABLE_MOCK_API} \
    npm run build

FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
