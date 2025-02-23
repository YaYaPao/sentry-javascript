import { captureException, flush, getCurrentHub, Handlers, startTransaction } from '@sentry/node';
import { extractTraceparentData } from '@sentry/tracing';
import { isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';
import { domainify, getActiveDomain, proxyFunction } from './../utils';
const { parseRequest } = Handlers;
/**
 * Wraps an HTTP function handler adding it error capture and tracing capabilities.
 *
 * @param fn HTTP Handler
 * @param options Options
 * @returns HTTP handler
 */
export function wrapHttpFunction(fn, wrapOptions = {}) {
    const wrap = (f) => domainify(_wrapHttpFunction(f, wrapOptions));
    let overrides;
    // Functions emulator from firebase-tools has a hack-ish workaround that saves the actual function
    // passed to `onRequest(...)` and in fact runs it so we need to wrap it too.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const emulatorFunc = fn.__emulator_func;
    if (emulatorFunc) {
        overrides = { __emulator_func: proxyFunction(emulatorFunc, wrap) };
    }
    return proxyFunction(fn, wrap, overrides);
}
/** */
function _wrapHttpFunction(fn, wrapOptions = {}) {
    const options = {
        flushTimeout: 2000,
        parseRequestOptions: {},
        ...wrapOptions,
    };
    return (req, res) => {
        const reqMethod = (req.method || '').toUpperCase();
        const reqUrl = stripUrlQueryAndFragment(req.originalUrl || req.url || '');
        // Applying `sentry-trace` to context
        let traceparentData;
        const reqWithHeaders = req;
        if (reqWithHeaders.headers && isString(reqWithHeaders.headers['sentry-trace'])) {
            traceparentData = extractTraceparentData(reqWithHeaders.headers['sentry-trace']);
        }
        const transaction = startTransaction({
            name: `${reqMethod} ${reqUrl}`,
            op: 'gcp.function.http',
            ...traceparentData,
        });
        // getCurrentHub() is expected to use current active domain as a carrier
        // since functions-framework creates a domain for each incoming request.
        // So adding of event processors every time should not lead to memory bloat.
        getCurrentHub().configureScope(scope => {
            scope.addEventProcessor(event => parseRequest(event, req, options.parseRequestOptions));
            // We put the transaction on the scope so users can attach children to it
            scope.setSpan(transaction);
        });
        // We also set __sentry_transaction on the response so people can grab the transaction there to add
        // spans to it later.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        res.__sentry_transaction = transaction;
        // functions-framework creates a domain for each incoming request so we take advantage of this fact and add an error handler.
        // BTW this is the only way to catch any exception occured during request lifecycle.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        getActiveDomain().on('error', err => {
            captureException(err);
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const _end = res.end;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.end = function (chunk, encoding, cb) {
            transaction.setHttpStatus(res.statusCode);
            transaction.finish();
            void flush(options.flushTimeout)
                .then(() => {
                _end.call(this, chunk, encoding, cb);
            })
                .then(null, e => {
                logger.error(e);
            });
        };
        return fn(req, res);
    };
}
//# sourceMappingURL=http.js.map