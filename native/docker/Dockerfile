# syntax=docker/dockerfile:1.7

FROM dart:stable AS build
WORKDIR /app

COPY pubspec.yaml ./
COPY pubspec.lock ./
RUN export PATH=/usr/lib/dart/bin:$PATH && dart pub get

COPY lib ./lib
COPY config ./config
COPY headless_main.dart ./headless_main.dart

RUN mkdir -p /out && export PATH=/usr/lib/dart/bin:$PATH && dart compile exe headless_main.dart -o /out/honeycomb-headless

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
RUN useradd -r -u 10050 -m -d /home/honeycomb honeycomb

COPY --from=build /out/honeycomb-headless /usr/local/bin/honeycomb-headless
COPY config/honeycomb.example.json /etc/honeycomb/config.json

ENV HONEYCOMB_CONFIG=/etc/honeycomb/config.json
ENV HONEYCOMB_MODE=headless

USER honeycomb
WORKDIR /home/honeycomb
EXPOSE 8091
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8091/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/honeycomb-headless"]
