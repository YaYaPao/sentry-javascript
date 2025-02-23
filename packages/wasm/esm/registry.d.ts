import { DebugImage } from '@sentry/types';
export declare const IMAGES: Array<DebugImage>;
export interface ModuleInfo {
    buildId: string | null;
    debugFile: string | null;
}
/**
 * Returns the extracted meta information from a web assembly module that
 * Sentry uses to identify debug images.
 *
 * @param module
 */
export declare function getModuleInfo(module: WebAssembly.Module): ModuleInfo;
/**
 * Records a module
 */
export declare function registerModule(module: WebAssembly.Module, url: string): void;
/**
 * Returns all known images.
 */
export declare function getImages(): Array<DebugImage>;
/**
 * Looks up an image by URL.
 *
 * @param url the URL of the WebAssembly module.
 */
export declare function getImage(url: string): number;
//# sourceMappingURL=registry.d.ts.map