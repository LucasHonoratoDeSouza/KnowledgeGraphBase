# Disposable container for scripts/test-install.sh. A clean Ubuntu image
# with only what a real target machine would already have (curl,
# coreutils, tar) plus desktop-file-utils so `update-desktop-database`'s
# effect is observable, and a non-root user since install.sh must never
# require or invoke sudo.
FROM ubuntu:22.04

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        coreutils \
        tar \
        desktop-file-utils \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/sh tester

USER tester
WORKDIR /home/tester

COPY --chown=tester:tester install.sh /home/tester/install.sh
RUN chmod +x /home/tester/install.sh
