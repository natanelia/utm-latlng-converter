import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: 'build',
  test: {
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,
      providerOptions: {
        launch: {
          args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
        },
      },
    },
    benchmark: {
      include: ['**/*.bench.*.ts'],
    },
  },
});
