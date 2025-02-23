export * from '@sentry/browser';
export { init } from './sdk';
export { createErrorHandler, SentryErrorHandler } from './errorhandler';
export { getActiveTransaction, 
// TODO `instrumentAngularRouting` is just an alias for `routingInstrumentation`; deprecate the latter at some point
instrumentAngularRouting, // new name
routingInstrumentation, // legacy name
TraceClassDecorator, TraceMethodDecorator, TraceDirective, TraceModule, TraceService, } from './tracing';
//# sourceMappingURL=index.js.map