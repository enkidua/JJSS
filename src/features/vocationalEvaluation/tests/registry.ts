/** 검사 플러그인 등록소. VE Assist `src/vocational-tests/registry.ts` 이식. */
import { keadHandFunctionPlugin } from './keadHandFunction';
import { keadBimanualPlugin } from './keadBimanual';
import type { TestPlugin } from './types';

const plugins = new Map<string, TestPlugin>();

function register(plugin: TestPlugin): void {
    if (plugins.has(plugin.manifest.id)) {
        throw new Error(`검사 플러그인 ID가 중복되었습니다: ${plugin.manifest.id}`);
    }
    plugins.set(plugin.manifest.id, plugin);
}

register(keadHandFunctionPlugin);
register(keadBimanualPlugin);

export function getTestPlugin(id: string): TestPlugin {
    const plugin = plugins.get(id);
    if (!plugin) throw new Error(`등록되지 않은 검사입니다: ${id}`);
    return plugin;
}

export function findTestPlugin(id: string): TestPlugin | undefined {
    return plugins.get(id);
}

export function listTestPlugins(): TestPlugin[] {
    return [...plugins.values()];
}

export { keadHandFunctionPlugin, keadBimanualPlugin };
export type { TestPlugin, TestManifest } from './types';
