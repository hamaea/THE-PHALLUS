import { ASSETS, LEGACY_ASSETS, HERO_ASSETS, FIRST_ASSETS, CUSTOM_ASSETS } from './assets-data.js';
export { ASSETS, HERO_ASSETS, FIRST_ASSETS, CUSTOM_ASSETS };
export const assetById = new Map([...LEGACY_ASSETS, ...ASSETS, ...FIRST_ASSETS, ...CUSTOM_ASSETS].map(asset => [asset.id, asset]));
export function assetUrl(asset, { preview = false } = {}) {
  return new URL(preview ? asset.previewSrc : asset.src, new URL('../', import.meta.url)).href;
}
export function chooseHero(random = Math.random) {
  return HERO_ASSETS[Math.min(HERO_ASSETS.length - 1, Math.floor(random() * HERO_ASSETS.length))];
}
