import { __assign, __awaiter, __generator, __read, __spread, __values } from "tslib";
/* eslint-disable max-lines */
import { getSentryRelease } from '@sentry/node';
import { dropUndefinedKeys, logger } from '@sentry/utils';
import { default as SentryWebpackPlugin } from '@sentry/webpack-plugin';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
export { SentryWebpackPlugin };
// TODO: merge default SentryWebpackPlugin ignore with their SentryWebpackPlugin ignore or ignoreFile
// TODO: merge default SentryWebpackPlugin include with their SentryWebpackPlugin include
// TODO: drop merged keys from override check? `includeDefaults` option?
/**
 * Construct the function which will be used as the nextjs config's `webpack` value.
 *
 * Sets:
 *   - `devtool`, to ensure high-quality sourcemaps are generated
 *   - `entry`, to include user's sentry config files (where `Sentry.init` is called) in the build
 *   - `plugins`, to add SentryWebpackPlugin (TODO: optional)
 *
 * @param userNextConfig The user's existing nextjs config, as passed to `withSentryConfig`
 * @param userSentryWebpackPluginOptions The user's SentryWebpackPlugin config, as passed to `withSentryConfig`
 * @returns The function to set as the nextjs config's `webpack` value
 */
export function constructWebpackConfigFunction(userNextConfig, userSentryWebpackPluginOptions) {
    var _this = this;
    if (userNextConfig === void 0) { userNextConfig = {}; }
    if (userSentryWebpackPluginOptions === void 0) { userSentryWebpackPluginOptions = {}; }
    // Will be called by nextjs and passed its default webpack configuration and context data about the build (whether
    // we're building server or client, whether we're in dev, what version of webpack we're using, etc). Note that
    // `incomingConfig` and `buildContext` are referred to as `config` and `options` in the nextjs docs.
    var newWebpackFunction = function (incomingConfig, buildContext) {
        var _a, _b;
        var newConfig = __assign({}, incomingConfig);
        // if user has custom webpack config (which always takes the form of a function), run it so we have actual values to
        // work with
        if ('webpack' in userNextConfig && typeof userNextConfig.webpack === 'function') {
            newConfig = userNextConfig.webpack(newConfig, buildContext);
        }
        // Tell webpack to inject user config files (containing the two `Sentry.init()` calls) into the appropriate output
        // bundles. Store a separate reference to the original `entry` value to avoid an infinite loop. (If we don't do
        // this, we'll have a statement of the form `x.y = () => f(x.y)`, where one of the things `f` does is call `x.y`.
        // Since we're setting `x.y` to be a callback (which, by definition, won't run until some time later), by the time
        // the function runs (causing `f` to run, causing `x.y` to run), `x.y` will point to the callback itself, rather
        // than its original value. So calling it will call the callback which will call `f` which will call `x.y` which
        // will call the callback which will call `f` which will call `x.y`... and on and on. Theoretically this could also
        // be fixed by using `bind`, but this is way simpler.)
        var origEntryProperty = newConfig.entry;
        newConfig.entry = function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, addSentryToEntryProperty(origEntryProperty, buildContext)];
        }); }); };
        // Enable the Sentry plugin (which uploads source maps to Sentry when not in dev) by default
        var enableWebpackPlugin = 
        // TODO: this is a hack to fix https://github.com/getsentry/sentry-cli/issues/1085, which is caused by
        // https://github.com/getsentry/sentry-cli/issues/915. Once the latter is addressed, this existence check can come
        // out. (The check is necessary because currently, `@sentry/cli` uses a post-install script to download an
        // architecture-specific version of the `sentry-cli` binary. If `yarn install`, `npm install`, or `npm ci` are run
        // with the `--ignore-scripts` option, this will be blocked and the missing binary will cause an error when users
        // try to build their apps.)
        ensureCLIBinaryExists() &&
            (buildContext.isServer
                ? !((_a = userNextConfig.sentry) === null || _a === void 0 ? void 0 : _a.disableServerWebpackPlugin)
                : !((_b = userNextConfig.sentry) === null || _b === void 0 ? void 0 : _b.disableClientWebpackPlugin));
        if (enableWebpackPlugin) {
            // TODO Handle possibility that user is using `SourceMapDevToolPlugin` (see
            // https://webpack.js.org/plugins/source-map-dev-tool-plugin/)
            // TODO Give user option to use `hidden-source-map` ?
            // Next doesn't let you change this is dev even if you want to - see
            // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md
            if (!buildContext.dev) {
                newConfig.devtool = 'source-map';
            }
            newConfig.plugins = newConfig.plugins || [];
            newConfig.plugins.push(new SentryWebpackPlugin(getWebpackPluginOptions(buildContext, userSentryWebpackPluginOptions)));
        }
        return newConfig;
    };
    return newWebpackFunction;
}
/**
 * Modify the webpack `entry` property so that the code in `sentry.server.config.js` and `sentry.client.config.js` is
 * included in the the necessary bundles.
 *
 * @param currentEntryProperty The value of the property before Sentry code has been injected
 * @param buildContext Object passed by nextjs containing metadata about the build
 * @returns The value which the new `entry` property (which will be a function) will return (TODO: this should return
 * the function, rather than the function's return value)
 */
function addSentryToEntryProperty(currentEntryProperty, buildContext) {
    return __awaiter(this, void 0, void 0, function () {
        var newEntryProperty, _a, userConfigFile, filesToInject, rewriteFramesHelper, entryPointName;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(typeof currentEntryProperty === 'function')) return [3 /*break*/, 2];
                    return [4 /*yield*/, currentEntryProperty()];
                case 1:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = __assign({}, currentEntryProperty);
                    _b.label = 3;
                case 3:
                    newEntryProperty = _a;
                    userConfigFile = buildContext.isServer
                        ? getUserConfigFile(buildContext.dir, 'server')
                        : getUserConfigFile(buildContext.dir, 'client');
                    filesToInject = ["./" + userConfigFile];
                    // Support non-default output directories by making the output path (easy to get here at build-time) available to the
                    // server SDK's default `RewriteFrames` instance (which needs it at runtime). Doesn't work when using the dev server
                    // because it somehow tricks the file watcher into thinking that compilation itself is a file change, triggering an
                    // infinite recompiling loop. (This should be fine because we don't upload sourcemaps in dev in any case.)
                    if (buildContext.isServer && !buildContext.dev) {
                        rewriteFramesHelper = path.resolve(fs.mkdtempSync(path.resolve(os.tmpdir(), 'sentry-')), 'rewriteFramesHelper.js');
                        fs.writeFileSync(rewriteFramesHelper, "global.__rewriteFramesDistDir__ = '" + buildContext.config.distDir + "';\n");
                        // stick our helper file ahead of the user's config file so the value is in the global namespace *before*
                        // `Sentry.init()` is called
                        filesToInject.unshift(rewriteFramesHelper);
                    }
                    // inject into all entry points which might contain user's code
                    for (entryPointName in newEntryProperty) {
                        if (shouldAddSentryToEntryPoint(entryPointName)) {
                            addFilesToExistingEntryPoint(newEntryProperty, entryPointName, filesToInject);
                        }
                    }
                    return [2 /*return*/, newEntryProperty];
            }
        });
    });
}
/**
 * Search the project directory for a valid user config file for the given platform, allowing for it to be either a
 * TypeScript or JavaScript file.
 *
 * @param projectDir The root directory of the project, where the file should be located
 * @param platform Either "server" or "client", so that we know which file to look for
 * @returns The name of the relevant file. If no file is found, this method throws an error.
 */
export function getUserConfigFile(projectDir, platform) {
    var e_1, _a;
    var possibilities = ["sentry." + platform + ".config.ts", "sentry." + platform + ".config.js"];
    try {
        for (var possibilities_1 = __values(possibilities), possibilities_1_1 = possibilities_1.next(); !possibilities_1_1.done; possibilities_1_1 = possibilities_1.next()) {
            var filename = possibilities_1_1.value;
            if (fs.existsSync(path.resolve(projectDir, filename))) {
                return filename;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (possibilities_1_1 && !possibilities_1_1.done && (_a = possibilities_1.return)) _a.call(possibilities_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    throw new Error("Cannot find '" + possibilities[0] + "' or '" + possibilities[1] + "' in '" + projectDir + "'.");
}
/**
 * Add files to a specific element of the given `entry` webpack config property.
 *
 * @param entryProperty The existing `entry` config object
 * @param entryPointName The key where the file should be injected
 * @param filepaths An array of paths to the injected files
 */
function addFilesToExistingEntryPoint(entryProperty, entryPointName, filepaths) {
    // can be a string, array of strings, or object whose `import` property is one of those two
    var currentEntryPoint = entryProperty[entryPointName];
    var newEntryPoint = currentEntryPoint;
    if (typeof currentEntryPoint === 'string') {
        newEntryPoint = __spread(filepaths, [currentEntryPoint]);
    }
    else if (Array.isArray(currentEntryPoint)) {
        newEntryPoint = __spread(filepaths, currentEntryPoint);
    }
    // descriptor object (webpack 5+)
    else if (typeof currentEntryPoint === 'object' && 'import' in currentEntryPoint) {
        var currentImportValue = currentEntryPoint.import;
        var newImportValue = void 0;
        if (typeof currentImportValue === 'string') {
            newImportValue = __spread(filepaths, [currentImportValue]);
        }
        else {
            newImportValue = __spread(filepaths, currentImportValue);
        }
        newEntryPoint = __assign(__assign({}, currentEntryPoint), { import: newImportValue });
    }
    // malformed entry point (use `console.error` rather than `logger.error` because it will always be printed, regardless
    // of SDK settings)
    else {
        // eslint-disable-next-line no-console
        console.error('Sentry Logger [Error]:', "Could not inject SDK initialization code into entry point " + entryPointName + ", as its current value is not in a recognized format.\n", "Expected: string | Array<string> | { [key:string]: any, import: string | Array<string> }\n", "Got: " + currentEntryPoint);
    }
    entryProperty[entryPointName] = newEntryPoint;
}
/**
 * Check the SentryWebpackPlugin options provided by the user against the options we set by default, and warn if any of
 * our default options are getting overridden. (Note: If any of our default values is undefined, it won't be included in
 * the warning.)
 *
 * @param defaultOptions Default SentryWebpackPlugin options
 * @param userOptions The user's SentryWebpackPlugin options
 */
function checkWebpackPluginOverrides(defaultOptions, userOptions) {
    // warn if any of the default options for the webpack plugin are getting overridden
    var sentryWebpackPluginOptionOverrides = Object.keys(defaultOptions).filter(function (key) { return key in userOptions; });
    if (sentryWebpackPluginOptionOverrides.length > 0) {
        logger.warn('[Sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
            ("\t" + sentryWebpackPluginOptionOverrides.toString() + ",\n") +
            "which has the possibility of breaking source map upload and application. This is only a good idea if you know what you're doing.");
    }
}
/**
 * Determine if this is an entry point into which both `Sentry.init()` code and the release value should be injected
 *
 * @param entryPointName The name of the entry point in question
 * @returns `true` if sentry code should be injected, and `false` otherwise
 */
function shouldAddSentryToEntryPoint(entryPointName) {
    return entryPointName === 'pages/_app' || entryPointName.includes('pages/api');
}
/**
 * Combine default and user-provided SentryWebpackPlugin options, accounting for whether we're building server files or
 * client files.
 *
 * @param buildContext Nexjs-provided data about the current build
 * @param userPluginOptions User-provided SentryWebpackPlugin options
 * @returns Final set of combined options
 */
export function getWebpackPluginOptions(buildContext, userPluginOptions) {
    var _a;
    var isServer = buildContext.isServer, projectDir = buildContext.dir, buildId = buildContext.buildId, isDev = buildContext.dev, nextConfig = buildContext.config, webpack = buildContext.webpack;
    var distDir = (_a = nextConfig.distDir, (_a !== null && _a !== void 0 ? _a : '.next')); // `.next` is the default directory
    var isWebpack5 = webpack.version.startsWith('5');
    var isServerless = nextConfig.target === 'experimental-serverless-trace';
    var hasSentryProperties = fs.existsSync(path.resolve(projectDir, 'sentry.properties'));
    var urlPrefix = nextConfig.basePath ? "~" + nextConfig.basePath + "/_next" : '~/_next';
    var serverInclude = isServerless
        ? [{ paths: [distDir + "/serverless/"], urlPrefix: urlPrefix + "/serverless" }]
        : [{ paths: [distDir + "/server/pages/"], urlPrefix: urlPrefix + "/server/pages" }].concat(isWebpack5 ? [{ paths: [distDir + "/server/chunks/"], urlPrefix: urlPrefix + "/server/chunks" }] : []);
    var clientInclude = [{ paths: [distDir + "/static/chunks/pages"], urlPrefix: urlPrefix + "/static/chunks/pages" }];
    var defaultPluginOptions = dropUndefinedKeys({
        include: isServer ? serverInclude : clientInclude,
        ignore: [],
        url: process.env.SENTRY_URL,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        configFile: hasSentryProperties ? 'sentry.properties' : undefined,
        stripPrefix: ['webpack://_N_E/'],
        urlPrefix: urlPrefix,
        entries: shouldAddSentryToEntryPoint,
        release: getSentryRelease(buildId),
        dryRun: isDev,
    });
    checkWebpackPluginOverrides(defaultPluginOptions, userPluginOptions);
    return __assign(__assign({}, defaultPluginOptions), userPluginOptions);
}
function ensureCLIBinaryExists() {
    return fs.existsSync(path.join(require.resolve('@sentry/cli'), '../../sentry-cli'));
}
//# sourceMappingURL=webpack.js.map