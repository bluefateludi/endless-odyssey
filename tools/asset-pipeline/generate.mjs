import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildMossWarden } from './models/moss-warden.mjs';

// GLTFExporter uses FileReader to pack Blob data. Node provides Blob.arrayBuffer().
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    });
  }
}

const generators = { 'moss-warden': buildMossWarden };

export function getGenerator(name) {
  const generator = Object.hasOwn(generators, name) && generators[name];
  if (!generator) throw new Error('Unknown generator: ' + name);
  return generator;
}

export async function generateGlb(spec) {
  globalThis.FileReader ??= NodeFileReader;
  const { scene, animations } = getGenerator(spec.generator)(spec);
  const data = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true, animations });
  return Buffer.from(data);
}

