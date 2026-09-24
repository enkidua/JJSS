import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

/**
 * canonical·Open Graph·sitemap·robots가 localhost 주소로 배포되지 않도록
 * 프로덕션 빌드에서는 NEXT_PUBLIC_SITE_URL(배포 도메인)을 필수로 요구한다.
 * vinext는 이 설정 파일을 읽기 전에 .env.production 등을 process.env에 불러온다.
 */
function assertProductionSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const hint =
    '배포 도메인을 환경변수로 지정한 뒤 다시 빌드하세요. 예) NEXT_PUBLIC_SITE_URL=https://example.com npm run build ' +
    '(또는 website/.env.production 파일에 NEXT_PUBLIC_SITE_URL=https://example.com)';
  if (!value) {
    throw new Error(`[JJSS website] NEXT_PUBLIC_SITE_URL이 설정되지 않아 프로덕션 빌드를 중단합니다. ${hint}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[JJSS website] NEXT_PUBLIC_SITE_URL 값이 올바른 주소가 아닙니다: "${value}". ${hint}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`[JJSS website] NEXT_PUBLIC_SITE_URL은 http:// 또는 https://로 시작해야 합니다: "${value}". ${hint}`);
  }
}

export default defineConfig(async ({ command, mode }) => {
  if (command === 'build' && (mode === 'production' || process.env.NODE_ENV === 'production')) {
    assertProductionSiteUrl();
  }

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
