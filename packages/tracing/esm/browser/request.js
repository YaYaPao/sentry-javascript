import { __assign, __read, __spread } from "tslib";
import { addInstrumentationHandler, isInstanceOf, isMatchingPattern } from '@sentry/utils';
import { getActiveTransaction, hasTracingEnabled } from '../utils';
export var DEFAULT_TRACING_ORIGINS = ['localhost', /^\//];
export var defaultRequestInstrumentationOptions = {
    traceFetch: true,
    traceXHR: true,
    autoSentryTrace: true,
    tracingOrigins: DEFAULT_TRACING_ORIGINS,
};
/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(_options) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    var _a = __assign(__assign({}, defaultRequestInstrumentationOptions), _options), traceFetch = _a.traceFetch, traceXHR = _a.traceXHR, autoSentryTrace = _a.autoSentryTrace, tracingOrigins = _a.tracingOrigins, shouldCreateSpanForRequest = _a.shouldCreateSpanForRequest;
    // We should cache url -> decision so that we don't have to compute
    // regexp everytime we create a request.
    var urlMap = {};
    var defaultShouldCreateSpan = function (url) {
        if (urlMap[url]) {
            return urlMap[url];
        }
        var origins = tracingOrigins;
        urlMap[url] =
            origins.some(function (origin) { return isMatchingPattern(url, origin); }) &&
                !isMatchingPattern(url, 'sentry_key');
        return urlMap[url];
    };
    // We want that our users don't have to re-implement shouldCreateSpanForRequest themselves
    // That's why we filter out already unwanted Spans from tracingOrigins
    var shouldCreateSpan = defaultShouldCreateSpan;
    if (typeof shouldCreateSpanForRequest === 'function') {
        shouldCreateSpan = function (url) {
            return defaultShouldCreateSpan(url) && shouldCreateSpanForRequest(url);
        };
    }
    var spans = {};
    if (traceFetch) {
        addInstrumentationHandler('fetch', function (handlerData) {
            fetchCallback(handlerData, shouldCreateSpan, spans, autoSentryTrace);
        });
    }
    if (traceXHR) {
        addInstrumentationHandler('xhr', function (handlerData) {
            xhrCallback(handlerData, shouldCreateSpan, spans, autoSentryTrace);
        });
    }
}
/**
 * Create and track fetch request spans
 */
export function fetchCallback(handlerData, shouldCreateSpan, spans, autoSentryTrace) {
    if (!hasTracingEnabled() || !(handlerData.fetchData && shouldCreateSpan(handlerData.fetchData.url))) {
        return;
    }
    if (handlerData.endTimestamp && handlerData.fetchData.__span) {
        var span = spans[handlerData.fetchData.__span];
        if (span) {
            if (handlerData.response) {
                // TODO (kmclb) remove this once types PR goes through
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                span.setHttpStatus(handlerData.response.status);
            }
            else if (handlerData.error) {
                span.setStatus('internal_error');
            }
            span.finish();
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete spans[handlerData.fetchData.__span];
        }
        return;
    }
    var activeTransaction = getActiveTransaction();
    if (activeTransaction) {
        var span = activeTransaction.startChild({
            data: __assign(__assign({}, handlerData.fetchData), { type: 'fetch' }),
            description: handlerData.fetchData.method + " " + handlerData.fetchData.url,
            op: 'http.client',
        });
        handlerData.fetchData.__span = span.spanId;
        spans[span.spanId] = span;
        var request = (handlerData.args[0] = handlerData.args[0]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        var options = (handlerData.args[1] = handlerData.args[1] || {});
        var headers = options.headers;
        if (isInstanceOf(request, Request)) {
            headers = request.headers;
        }
        if (autoSentryTrace && headers) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (typeof headers.append === 'function') {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                headers.append('sentry-trace', span.toTraceparent());
            }
            else if (Array.isArray(headers)) {
                headers = __spread(headers, [['sentry-trace', span.toTraceparent()]]);
            }
            else {
                headers = __assign(__assign({}, headers), { 'sentry-trace': span.toTraceparent() });
            }
        }
        else {
            headers = { 'sentry-trace': span.toTraceparent() };
        }
        options.headers = headers;
    }
}
/**
 * Create and track xhr request spans
 */
export function xhrCallback(handlerData, shouldCreateSpan, spans, autoSentryTrace) {
    if (!hasTracingEnabled() ||
        (handlerData.xhr && handlerData.xhr.__sentry_own_request__) ||
        !(handlerData.xhr && handlerData.xhr.__sentry_xhr__ && shouldCreateSpan(handlerData.xhr.__sentry_xhr__.url))) {
        return;
    }
    var xhr = handlerData.xhr.__sentry_xhr__;
    // check first if the request has finished and is tracked by an existing span which should now end
    if (handlerData.endTimestamp && handlerData.xhr.__sentry_xhr_span_id__) {
        var span = spans[handlerData.xhr.__sentry_xhr_span_id__];
        if (span) {
            span.setHttpStatus(xhr.status_code);
            span.finish();
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete spans[handlerData.xhr.__sentry_xhr_span_id__];
        }
        return;
    }
    // if not, create a new span to track it
    var activeTransaction = getActiveTransaction();
    if (activeTransaction) {
        var span = activeTransaction.startChild({
            data: __assign(__assign({}, xhr.data), { type: 'xhr', method: xhr.method, url: xhr.url }),
            description: xhr.method + " " + xhr.url,
            op: 'http.client',
        });
        handlerData.xhr.__sentry_xhr_span_id__ = span.spanId;
        spans[handlerData.xhr.__sentry_xhr_span_id__] = span;
        if (autoSentryTrace && handlerData.xhr.setRequestHeader) {
            try {
                handlerData.xhr.setRequestHeader('sentry-trace', span.toTraceparent());
            }
            catch (_) {
                // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
            }
        }
    }
}
//# sourceMappingURL=request.js.map