import { init as browserInit, SDK_VERSION } from '@sentry/browser';
/**
 * Inits the Angular SDK
 */
export function init(options) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = {
        name: 'sentry.javascript.angular',
        packages: [
            {
                name: 'npm:@sentry/angular',
                version: SDK_VERSION,
            },
        ],
        version: SDK_VERSION,
    };
    browserInit(options);
}
//# sourceMappingURL=sdk.js.map