# syntax=docker/dockerfile:1

# ---------- Stage 1: build wavy frontend with bun ----------
FROM --platform=$BUILDPLATFORM oven/bun:1 AS web-builder

WORKDIR /web
COPY web/wavy/package.json web/wavy/bun.lock ./
RUN bun install --frozen-lockfile

COPY web/wavy/ ./
COPY VERSION /VERSION
RUN VITE_REACT_APP_VERSION=$(cat /VERSION) bun run build:only

# ---------- Stage 2: compile Go binary ----------
FROM golang:1.25-alpine AS go-builder

RUN apk add --no-cache gcc musl-dev sqlite-dev build-base

ENV GO111MODULE=on \
    CGO_ENABLED=1 \
    GOOS=linux

WORKDIR /build

ADD go.mod go.sum ./
RUN go mod download

COPY . .
# wavy build output → web/build/wavy/ (go:embed target in main.go)
COPY --from=web-builder /web/dist ./web/build/wavy

RUN go build -trimpath \
    -ldflags "-s -w -X 'github.com/songquanpeng/one-api/common.Version=$(cat VERSION)' -linkmode external -extldflags '-static'" \
    -o one-api

# ---------- Stage 3: minimal runtime ----------
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

COPY --from=go-builder /build/one-api /

EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/one-api"]
