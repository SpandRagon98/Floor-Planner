import * as THREE from "three";

// Module-level shared texture cache so every room floor reuses one GPU upload
// per image instead of re-fetching through a fresh TextureLoader on each mount.
const textureCache = new Map(); // resolvedPath -> { texture, promise }

export function loadSharedTexture(path) {
  if (!path) return Promise.reject(new Error("Missing texture path"));
  const cached = textureCache.get(path);
  if (cached) return cached.promise;

  const entry = { texture: null, promise: null };
  entry.promise = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      path,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        entry.texture = texture;
        resolve(texture);
      },
      undefined,
      (error) => {
        // Drop the failed entry so a later attempt can retry the network fetch.
        textureCache.delete(path);
        reject(error || new Error(`Failed to load texture: ${path}`));
      }
    );
  });
  textureCache.set(path, entry);
  return entry.promise;
}

export function getCachedTexture(path) {
  return textureCache.get(path)?.texture || null;
}
