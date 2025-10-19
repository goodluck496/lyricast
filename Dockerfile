# Базовый образ с electron-builder
FROM electronuserland/builder:latest

# Системные пакеты для AppImage/DEB/RPM
RUN apt-get update && apt-get install -y \
    libfuse2 squashfs-tools rpm fakeroot dpkg desktop-file-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /project

# pnpm
RUN corepack enable
ENV npm_config_loglevel=warn

# 1) Кэшируем установку без скриптов (postinstall не бегает)
# ВАЖНО: копируем только манифесты
COPY package.json pnpm-lock.yaml ./
# (если есть) COPY .npmrc ./
RUN --mount=type=cache,target=/root/.pnpm-store pnpm i --frozen-lockfile --ignore-scripts

# 2) Теперь весь проект (тут появится tools/electron-builder.config.js)
COPY . .

# 3) Полная установка (теперь postinstall может запускать electron-builder)
RUN --mount=type=cache,target=/root/.pnpm-store pnpm i --frozen-lockfile

# 4) Сборка linux-артефактов (без snap)
CMD ["bash", "-lc", "pnpm __build-linux"]
